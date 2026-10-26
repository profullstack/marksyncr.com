-- SECURITY DEFINER follow-up (2026-10-26 fleet audit).
--
-- 20261026210300 locked every definer function, and the five version RPCs
-- now refuse another user's id (assert_caller_is). Two gaps remained:
-- * default privileges still granted EXECUTE on new functions in public to
--   anon and authenticated, so the next function added would be callable
--   with the anon key until someone remembered to revoke it;
-- * trigger functions (invoker) were still executable by anon.
--
-- After this migration a NEW function the browser calls (or an RLS policy
-- uses) needs an explicit GRANT EXECUTE ... TO anon, authenticated.

-- Trigger and event-trigger functions are never RPCs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- New functions are not executable by PUBLIC/anon/authenticated by default.
-- A new function the browser calls (or an RLS policy uses) needs an explicit
-- GRANT EXECUTE ... TO anon, authenticated.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
