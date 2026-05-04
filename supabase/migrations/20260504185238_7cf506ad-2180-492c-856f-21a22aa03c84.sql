-- Tabela de API keys para BI externo
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['comercial','financeiro','operacao'],
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  usage_count BIGINT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_keys"
ON public.api_keys
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Função para validar chave a partir do hash (chamada pelas edge functions com service_role)
CREATE OR REPLACE FUNCTION public.validate_api_key(_key_hash TEXT)
RETURNS TABLE(id UUID, name TEXT, scopes TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.api_keys;
BEGIN
  SELECT * INTO _row
  FROM public.api_keys
  WHERE key_hash = _key_hash AND revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.api_keys
  SET last_used_at = now(), usage_count = usage_count + 1
  WHERE public.api_keys.id = _row.id;

  RETURN QUERY SELECT _row.id, _row.name, _row.scopes;
END;
$$;