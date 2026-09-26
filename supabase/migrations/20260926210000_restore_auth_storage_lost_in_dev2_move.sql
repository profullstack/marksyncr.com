-- Restore the trigger on auth.users that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a trigger
-- under its table's schema, so on_auth_user_created was dropped while
-- public.handle_new_user() survived. From the cutover on, a signup got no
-- public.users row and no free subscription until ensureUserExists in the
-- bookmarks API created them on first sync; anything else keyed on
-- public.users failed its foreign key for those accounts.
--
-- The migrations define no policies on storage.objects or storage.buckets,
-- so there is nothing to restore there.
--
-- Idempotent: safe to re-run.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill what handle_new_user (final form, 012) would have written for the
-- users created while the trigger was missing. public.users.email is unique;
-- ON CONFLICT DO NOTHING skips a row rather than fail the migration if one
-- somehow collides (none should: the row cascades away with its auth user).
INSERT INTO public.users (id, email, name, avatar_url)
SELECT
    u.id,
    u.email,
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'avatar_url'
FROM auth.users u
LEFT JOIN public.users pu ON pu.id = u.id
WHERE pu.id IS NULL
ON CONFLICT DO NOTHING;

-- Every public.users row is meant to have a subscription (006 backfilled all
-- of them the same way). Covers both the rows added above and rows that
-- ensureUserExists created without managing to add a subscription.
INSERT INTO public.subscriptions (user_id, plan, status)
SELECT pu.id, 'free', 'active'
FROM public.users pu
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = pu.id)
ON CONFLICT (user_id) DO NOTHING;
