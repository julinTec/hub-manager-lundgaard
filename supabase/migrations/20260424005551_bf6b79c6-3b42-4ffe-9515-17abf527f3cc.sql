-- Create admin user juliocezarvieira21@gmail.com with password Julio35@
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  hashed_password text;
BEGIN
  -- Hash the password using bcrypt via pgcrypto
  hashed_password := crypt('Julio35@', gen_salt('bf'));

  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'juliocezarvieira21@gmail.com',
    hashed_password,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Julio Cezar Vieira"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- Insert identity record (required for email login)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'juliocezarvieira21@gmail.com', 'email_verified', true),
    'email',
    new_user_id::text,
    now(),
    now(),
    now()
  );

  -- Ensure profile exists (handle_new_user trigger should create it, but make sure)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (new_user_id, 'Julio Cezar Vieira', 'juliocezarvieira21@gmail.com')
  ON CONFLICT DO NOTHING;

  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_user_id, 'admin'::app_role)
  ON CONFLICT DO NOTHING;
END $$;