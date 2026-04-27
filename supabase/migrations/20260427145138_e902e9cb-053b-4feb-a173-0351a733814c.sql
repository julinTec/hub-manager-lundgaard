CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view system_settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert system_settings"
ON public.system_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update system_settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();