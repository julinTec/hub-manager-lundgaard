-- 1. Adicionar coluna devis_number
ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS devis_number TEXT;

-- 2. Função geradora
CREATE OR REPLACE FUNCTION public.generate_devis_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  next_seq INT;
BEGIN
  IF NEW.devis_number IS NOT NULL AND NEW.devis_number <> '' THEN
    RETURN NEW;
  END IF;
  prefix := 'DE' || to_char(COALESCE(NEW.created_at, now()), 'YYYYMM');
  SELECT COALESCE(MAX(CAST(SUBSTRING(devis_number FROM 9) AS INT)), 0) + 1
    INTO next_seq
  FROM public.devis
  WHERE devis_number LIKE prefix || '%';
  NEW.devis_number := prefix || lpad(next_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

-- 3. Trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_generate_devis_number ON public.devis;
CREATE TRIGGER trg_generate_devis_number
BEFORE INSERT ON public.devis
FOR EACH ROW
EXECUTE FUNCTION public.generate_devis_number();

-- 4. Backfill para registros existentes
DO $$
DECLARE
  r RECORD;
  prefix TEXT;
  seq INT;
  current_prefix TEXT := '';
BEGIN
  FOR r IN
    SELECT id, created_at FROM public.devis
    WHERE devis_number IS NULL OR devis_number = ''
    ORDER BY created_at ASC
  LOOP
    prefix := 'DE' || to_char(r.created_at, 'YYYYMM');
    IF prefix <> current_prefix THEN
      SELECT COALESCE(MAX(CAST(SUBSTRING(devis_number FROM 9) AS INT)), 0)
        INTO seq
      FROM public.devis
      WHERE devis_number LIKE prefix || '%';
      current_prefix := prefix;
    END IF;
    seq := seq + 1;
    UPDATE public.devis SET devis_number = prefix || lpad(seq::text, 3, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- 5. Constraint UNIQUE
ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_devis_number_key;
ALTER TABLE public.devis ADD CONSTRAINT devis_devis_number_key UNIQUE (devis_number);