-- Lock down the SECURITY DEFINER functions (found during the credit-codes rollout).
--
-- Every function below runs as its owner (bypassing RLS) and takes the user id
-- as a parameter, and all of them were executable by anon and authenticated
-- (Postgres grants EXECUTE to PUBLIC by default). So anyone holding the public
-- anon key could call, for example, get_version_data(<someone's id>, n) and
-- read that person's bookmarks, or rollback_to_version() on their account.
--
-- 1. Functions the app never calls with a user's key (cron/trigger helpers,
--    and the analytics/link-check/schedule RPCs that have no caller): service
--    role only. Triggers and pg_cron still run them (they run as the owner).
-- 2. The five version-history RPCs the API routes call with the signed-in
--    user's client: authenticated only (not anon), and each one now refuses a
--    p_user_id that is not the caller's own (auth.uid()). Calls with no
--    PostgREST JWT (psql, pg_cron) and the service role are unaffected.

-- 1 --------------------------------------------------------------------------
DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.auto_cleanup_versions()',
        'public.cleanup_expired_extension_sessions()',
        'public.cleanup_old_versions(uuid, integer)',
        'public.complete_scheduled_sync(uuid)',
        'public.get_analytics_summary(uuid)',
        'public.get_broken_links(uuid, integer, integer)',
        'public.get_next_version(uuid)',
        'public.handle_new_user()',
        'public.record_bookmark_visit(uuid, text, text, text)',
        'public.update_sync_schedule(uuid, integer, boolean)',
        'public.upsert_link_check(uuid, text, text, text, integer, text, text)',
        'public.user_has_pro_features(uuid)',
        'public.purge_expired_vault_items()'
    ] LOOP
        IF to_regprocedure(fn) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
        END IF;
    END LOOP;
END
$$;

-- 2 --------------------------------------------------------------------------
-- Raises unless the caller may act for p_user_id: the user themself, the
-- service role, or a direct database session with no PostgREST JWT.
CREATE OR REPLACE FUNCTION public.assert_caller_is(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    claims TEXT := NULLIF(current_setting('request.jwt.claims', TRUE), '');
    role TEXT;
    sub TEXT;
BEGIN
    IF claims IS NOT NULL THEN
        role := claims::jsonb ->> 'role';
        sub := claims::jsonb ->> 'sub';
    ELSE
        -- Older PostgREST sets one GUC per claim.
        role := NULLIF(current_setting('request.jwt.claim.role', TRUE), '');
        sub := NULLIF(current_setting('request.jwt.claim.sub', TRUE), '');
        IF role IS NULL AND sub IS NULL THEN
            RETURN;
        END IF;
    END IF;
    IF role = 'service_role' THEN
        RETURN;
    END IF;
    IF sub IS NULL OR p_user_id IS NULL OR sub <> p_user_id::TEXT THEN
        RAISE EXCEPTION 'not allowed for this user' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- Insert the check as the first statement of each function body. The
-- functions keep their exact signatures, return types and bodies otherwise.
DO $$
DECLARE
    fn TEXT;
    def TEXT;
    patched TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.get_version_data(uuid, integer)',
        'public.get_version_history(uuid, integer, integer)',
        'public.get_version_retention_limit(uuid)',
        'public.rollback_to_version(uuid, integer)',
        'public.save_bookmark_version(uuid, jsonb, text, text, text, text, text, jsonb)'
    ] LOOP
        IF to_regprocedure(fn) IS NULL THEN
            CONTINUE;
        END IF;
        def := pg_get_functiondef(to_regprocedure(fn));
        IF position('assert_caller_is' IN def) > 0 THEN
            CONTINUE; -- already patched
        END IF;
        patched := regexp_replace(def, E'\nBEGIN\n',
                                  E'\nBEGIN\n    PERFORM public.assert_caller_is(p_user_id);\n');
        IF patched = def THEN
            RAISE EXCEPTION 'could not find the body of %', fn;
        END IF;
        EXECUTE patched;
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.assert_caller_is(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_caller_is(UUID) TO authenticated, service_role;
