REVOKE EXECUTE ON FUNCTION public.validate_api_key(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_api_key(TEXT) TO service_role;