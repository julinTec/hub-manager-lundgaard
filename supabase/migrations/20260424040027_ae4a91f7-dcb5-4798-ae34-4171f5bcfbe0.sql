-- 1) Colunas de rejeição
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rejected_ip TEXT NULL;

-- 2) Realtime
ALTER TABLE public.devis REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'devis'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.devis';
  END IF;
END $$;

-- 3) pg_cron: auto-transição enviada_ao_cliente -> aguardando_aceite após 30s
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Função que faz a transição
CREATE OR REPLACE FUNCTION public.auto_advance_sent_devis()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.devis
     SET status = 'aguardando_aceite'
   WHERE status = 'enviada_ao_cliente'
     AND sent_at IS NOT NULL
     AND sent_at < now() - interval '30 seconds';
$$;

-- Remove job antigo se existir e recria
DO $$
DECLARE
  job_id BIGINT;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'devis-auto-advance-sent';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'devis-auto-advance-sent',
  '15 seconds',
  $$ SELECT public.auto_advance_sent_devis(); $$
);