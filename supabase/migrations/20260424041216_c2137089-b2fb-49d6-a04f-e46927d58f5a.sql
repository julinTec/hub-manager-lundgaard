-- 1. Hotfix: corrige propostas aceitas que ficaram com status errado
UPDATE public.devis
   SET status = 'aceita'
 WHERE accepted_at IS NOT NULL
   AND rejected_at IS NULL
   AND status IN ('enviada_ao_cliente', 'aguardando_aceite');

-- 2. Blindar a função do cron contra regressões em estados terminais
CREATE OR REPLACE FUNCTION public.auto_advance_sent_devis()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.devis
     SET status = 'aguardando_aceite'
   WHERE status = 'enviada_ao_cliente'
     AND sent_at IS NOT NULL
     AND sent_at < now() - interval '30 seconds'
     AND accepted_at IS NULL
     AND rejected_at IS NULL;
$function$;

-- 3. Garantir que a tabela devis está no publication de realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'devis'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.devis;
  END IF;
END $$;

ALTER TABLE public.devis REPLICA IDENTITY FULL;