-- Lock down what a signed-in user can change on their own public.users row.
--
-- Before: "Users can update own profile" had no column restriction and the
-- Supabase default grants gave anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE
-- on every column, so a signed-in user could PATCH /rest/v1/users and rewrite
-- their email, created_at (the invite age checks read auth.users, but anything
-- new that trusted this row would be fooled), email_verified or last_login_at.
--
-- After:
--   * authenticated may UPDATE only the profile fields a user edits
--     (name, avatar_url, first_name, last_name, company_domain, job_title,
--     linkedin_url, updated_at). The app itself writes them server-side on the
--     service-role client (/api/v1/me/profile), so nothing in the UI needs a
--     client-side write.
--   * id, email, created_at, last_login_at, email_verified are pinned by a
--     BEFORE UPDATE trigger for anon/authenticated (belt and braces over the
--     column grants); service_role, postgres and the auth admin are unaffected.
--   * anon loses every write privilege on public tables (RLS already denied
--     them: every policy needs auth.uid()), and no API role keeps TRUNCATE,
--     which RLS does not cover.
--   * authenticated loses INSERT/UPDATE/DELETE on subscriptions and
--     coinpay_payments (read-only policies already; server writes them).
--
-- Apply by hand on dev2:
--   docker exec -i marksyncr-com-supabase-db psql -U postgres -d postgres -1 -v ON_ERROR_STOP=1 < this file
--   then: notify pgrst, 'reload schema';

-- 1. Column grants on public.users.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM anon, authenticated;
GRANT UPDATE (name, avatar_url, first_name, last_name, company_domain, job_title, linkedin_url, updated_at)
  ON public.users TO authenticated;

-- 2. Pin the identity/audit columns for API end-user roles.
CREATE OR REPLACE FUNCTION public.users_pin_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
    OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
  ) THEN
    RAISE EXCEPTION 'users: id, email, created_at, last_login_at and email_verified are read-only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.users_pin_protected_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_pin_protected_columns ON public.users;
CREATE TRIGGER users_pin_protected_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_pin_protected_columns();

-- The update policy also needs a WITH CHECK so a row can never be re-keyed.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- 3. Server-owned billing tables: read-only for the signed-in user.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions, public.coinpay_payments FROM authenticated;

-- 4. anon never writes; nobody on the API truncates.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
