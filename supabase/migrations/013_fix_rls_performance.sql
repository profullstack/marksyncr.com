-- Fix RLS Policy Performance
-- This migration updates all RLS policies to use (select auth.uid()) instead of auth.uid()
-- to prevent unnecessary re-evaluation for each row
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================
-- Table: public.users
-- ============================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING ((select auth.uid()) = id);

-- ============================================
-- Table: public.subscriptions
-- ============================================
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
    FOR SELECT USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.oauth_tokens
-- ============================================
DROP POLICY IF EXISTS "Users can view own tokens" ON public.oauth_tokens;
CREATE POLICY "Users can view own tokens" ON public.oauth_tokens
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own tokens" ON public.oauth_tokens;
CREATE POLICY "Users can insert own tokens" ON public.oauth_tokens
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own tokens" ON public.oauth_tokens;
CREATE POLICY "Users can update own tokens" ON public.oauth_tokens
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own tokens" ON public.oauth_tokens;
CREATE POLICY "Users can delete own tokens" ON public.oauth_tokens
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.cloud_bookmarks
-- ============================================
DROP POLICY IF EXISTS "Users can view own bookmarks" ON public.cloud_bookmarks;
CREATE POLICY "Users can view own bookmarks" ON public.cloud_bookmarks
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own bookmarks" ON public.cloud_bookmarks;
CREATE POLICY "Users can insert own bookmarks" ON public.cloud_bookmarks
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own bookmarks" ON public.cloud_bookmarks;
CREATE POLICY "Users can update own bookmarks" ON public.cloud_bookmarks
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.cloud_bookmarks;
CREATE POLICY "Users can delete own bookmarks" ON public.cloud_bookmarks
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.sync_state
-- ============================================
DROP POLICY IF EXISTS "Users can view own sync state" ON public.sync_state;
CREATE POLICY "Users can view own sync state" ON public.sync_state
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own sync state" ON public.sync_state;
CREATE POLICY "Users can insert own sync state" ON public.sync_state
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own sync state" ON public.sync_state;
CREATE POLICY "Users can update own sync state" ON public.sync_state
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own sync state" ON public.sync_state;
CREATE POLICY "Users can delete own sync state" ON public.sync_state
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.devices
-- ============================================
DROP POLICY IF EXISTS "Users can view own devices" ON public.devices;
CREATE POLICY "Users can view own devices" ON public.devices
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own devices" ON public.devices;
CREATE POLICY "Users can insert own devices" ON public.devices
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON public.devices;
CREATE POLICY "Users can update own devices" ON public.devices
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own devices" ON public.devices;
CREATE POLICY "Users can delete own devices" ON public.devices
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.bookmark_versions
-- ============================================
DROP POLICY IF EXISTS "Users can view own version history" ON public.bookmark_versions;
CREATE POLICY "Users can view own version history" ON public.bookmark_versions
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own version history" ON public.bookmark_versions;
CREATE POLICY "Users can insert own version history" ON public.bookmark_versions
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own version history" ON public.bookmark_versions;
CREATE POLICY "Users can delete own version history" ON public.bookmark_versions
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.sync_sources
-- ============================================
DROP POLICY IF EXISTS "Users can view own sync sources" ON public.sync_sources;
CREATE POLICY "Users can view own sync sources" ON public.sync_sources
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own sync sources" ON public.sync_sources;
CREATE POLICY "Users can insert own sync sources" ON public.sync_sources
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own sync sources" ON public.sync_sources;
CREATE POLICY "Users can update own sync sources" ON public.sync_sources
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own sync sources" ON public.sync_sources;
CREATE POLICY "Users can delete own sync sources" ON public.sync_sources
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.user_tags
-- ============================================
DROP POLICY IF EXISTS "Users can view own tags" ON public.user_tags;
CREATE POLICY "Users can view own tags" ON public.user_tags
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own tags" ON public.user_tags;
CREATE POLICY "Users can insert own tags" ON public.user_tags
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own tags" ON public.user_tags;
CREATE POLICY "Users can update own tags" ON public.user_tags
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own tags" ON public.user_tags;
CREATE POLICY "Users can delete own tags" ON public.user_tags
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.bookmark_analytics
-- ============================================
DROP POLICY IF EXISTS "Users can view own analytics" ON public.bookmark_analytics;
CREATE POLICY "Users can view own analytics" ON public.bookmark_analytics
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own analytics" ON public.bookmark_analytics;
CREATE POLICY "Users can insert own analytics" ON public.bookmark_analytics
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own analytics" ON public.bookmark_analytics;
CREATE POLICY "Users can update own analytics" ON public.bookmark_analytics
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own analytics" ON public.bookmark_analytics;
CREATE POLICY "Users can delete own analytics" ON public.bookmark_analytics
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.link_checks
-- ============================================
DROP POLICY IF EXISTS "Users can view own link checks" ON public.link_checks;
CREATE POLICY "Users can view own link checks" ON public.link_checks
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own link checks" ON public.link_checks;
CREATE POLICY "Users can insert own link checks" ON public.link_checks
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own link checks" ON public.link_checks;
CREATE POLICY "Users can update own link checks" ON public.link_checks
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own link checks" ON public.link_checks;
CREATE POLICY "Users can delete own link checks" ON public.link_checks
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.sync_schedules
-- ============================================
DROP POLICY IF EXISTS "Users can view own sync schedule" ON public.sync_schedules;
CREATE POLICY "Users can view own sync schedule" ON public.sync_schedules
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own sync schedule" ON public.sync_schedules;
CREATE POLICY "Users can insert own sync schedule" ON public.sync_schedules
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own sync schedule" ON public.sync_schedules;
CREATE POLICY "Users can update own sync schedule" ON public.sync_schedules
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own sync schedule" ON public.sync_schedules;
CREATE POLICY "Users can delete own sync schedule" ON public.sync_schedules
    FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================
-- Table: public.user_settings
-- ============================================
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
CREATE POLICY "Users can view own settings" ON public.user_settings
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;
CREATE POLICY "Users can delete own settings" ON public.user_settings
    FOR DELETE USING ((select auth.uid()) = user_id);
