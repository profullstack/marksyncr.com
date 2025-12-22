-- Migration: Backfill public.users from auth.users
-- This ensures all authenticated users have a corresponding row in public.users
-- which is required for foreign key constraints on cloud_bookmarks, etc.

-- First, ensure the trigger function exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    
    -- Create free subscription by default if not exists
    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing auth users that don't have a public.users row
INSERT INTO public.users (id, email, name, avatar_url, created_at)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name'),
    au.raw_user_meta_data->>'avatar_url',
    au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL;

-- Backfill subscriptions for users that don't have one
INSERT INTO public.subscriptions (user_id, plan, status, created_at)
SELECT 
    u.id,
    'free',
    'active',
    u.created_at
FROM public.users u
LEFT JOIN public.subscriptions s ON u.id = s.user_id
WHERE s.id IS NULL;
