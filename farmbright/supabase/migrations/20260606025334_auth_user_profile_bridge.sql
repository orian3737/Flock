-- Bridge Supabase Auth users to the existing app-owned public.users table.
--
-- The app keeps public.users.id as its internal integer profile key because
-- existing farm tables already reference it. Supabase Auth owns identity via
-- auth.users.id, which is stored in public.users.supabase_uid.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE supabase_uid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'public.users.supabase_uid contains non-UUID values. Clean those rows before applying auth bridge migration.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'supabase_uid'
      AND udt_name <> 'uuid'
  ) THEN
    ALTER TABLE public.users
      ALTER COLUMN supabase_uid TYPE uuid
      USING supabase_uid::uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users app_user
    LEFT JOIN auth.users auth_user
      ON auth_user.id = app_user.supabase_uid
    WHERE auth_user.id IS NULL
  ) THEN
    RAISE EXCEPTION 'public.users contains rows whose supabase_uid does not exist in auth.users. Repair orphan profiles before applying auth bridge migration.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_supabase_uid_auth_users_fkey'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_supabase_uid_auth_users_fkey
      FOREIGN KEY (supabase_uid)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    supabase_uid,
    email,
    farm_name,
    display_name,
    preferences
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'farm_name'), ''), 'Flock Farm'),
    NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
    COALESCE(NEW.raw_user_meta_data -> 'preferences', '{}'::jsonb)::json
  )
  ON CONFLICT (supabase_uid) DO UPDATE
    SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE supabase_uid = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO anon, authenticated, service_role;
