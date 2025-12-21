-- MarkSyncr Pro Features Schema
-- This migration adds tables for Pro features: tags, notes, analytics, link checking, and scheduled sync

-- ============================================
-- User Tags Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON public.user_tags(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_tags table
CREATE POLICY "Users can view own tags" ON public.user_tags
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tags" ON public.user_tags
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags" ON public.user_tags
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags" ON public.user_tags
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Bookmark Analytics Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.bookmark_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    bookmark_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    visit_count INTEGER DEFAULT 0,
    last_visited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, bookmark_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_bookmark_analytics_user_id ON public.bookmark_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_analytics_visit_count ON public.bookmark_analytics(user_id, visit_count DESC);
CREATE INDEX IF NOT EXISTS idx_bookmark_analytics_last_visited ON public.bookmark_analytics(user_id, last_visited_at DESC NULLS LAST);

-- Enable Row Level Security
ALTER TABLE public.bookmark_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bookmark_analytics table
CREATE POLICY "Users can view own analytics" ON public.bookmark_analytics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics" ON public.bookmark_analytics
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analytics" ON public.bookmark_analytics
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics" ON public.bookmark_analytics
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_bookmark_analytics_updated_at
    BEFORE UPDATE ON public.bookmark_analytics
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- Link Checks Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.link_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    bookmark_id TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT CHECK (status IN ('valid', 'broken', 'redirect', 'timeout', 'unknown')) DEFAULT 'unknown',
    status_code INTEGER,
    redirect_url TEXT,
    error_message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, bookmark_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_link_checks_user_id ON public.link_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_link_checks_status ON public.link_checks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_link_checks_checked_at ON public.link_checks(user_id, checked_at DESC);

-- Enable Row Level Security
ALTER TABLE public.link_checks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for link_checks table
CREATE POLICY "Users can view own link checks" ON public.link_checks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own link checks" ON public.link_checks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own link checks" ON public.link_checks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own link checks" ON public.link_checks
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Sync Schedules Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.sync_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (interval_minutes >= 5),
    enabled BOOLEAN DEFAULT TRUE,
    last_scheduled_sync TIMESTAMPTZ,
    next_scheduled_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_sync_schedules_user_id ON public.sync_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_next_sync ON public.sync_schedules(next_scheduled_sync) WHERE enabled = TRUE;

-- Enable Row Level Security
ALTER TABLE public.sync_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sync_schedules table
CREATE POLICY "Users can view own sync schedule" ON public.sync_schedules
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync schedule" ON public.sync_schedules
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync schedule" ON public.sync_schedules
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync schedule" ON public.sync_schedules
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sync_schedules_updated_at
    BEFORE UPDATE ON public.sync_schedules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to check if user has Pro features
CREATE OR REPLACE FUNCTION public.user_has_pro_features(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_plan TEXT;
BEGIN
    SELECT plan INTO user_plan
    FROM public.subscriptions
    WHERE user_id = p_user_id AND status IN ('active', 'trialing');
    
    RETURN user_plan IN ('pro', 'team');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record a bookmark visit (for analytics)
CREATE OR REPLACE FUNCTION public.record_bookmark_visit(
    p_user_id UUID,
    p_bookmark_id TEXT,
    p_url TEXT,
    p_title TEXT DEFAULT NULL
)
RETURNS public.bookmark_analytics AS $$
DECLARE
    result public.bookmark_analytics;
BEGIN
    INSERT INTO public.bookmark_analytics (user_id, bookmark_id, url, title, visit_count, last_visited_at)
    VALUES (p_user_id, p_bookmark_id, p_url, p_title, 1, NOW())
    ON CONFLICT (user_id, bookmark_id) DO UPDATE SET
        visit_count = public.bookmark_analytics.visit_count + 1,
        last_visited_at = NOW(),
        title = COALESCE(EXCLUDED.title, public.bookmark_analytics.title),
        updated_at = NOW()
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get analytics summary for a user
CREATE OR REPLACE FUNCTION public.get_analytics_summary(p_user_id UUID)
RETURNS TABLE (
    total_bookmarks BIGINT,
    total_visits BIGINT,
    most_visited_url TEXT,
    most_visited_title TEXT,
    most_visited_count INTEGER,
    never_visited_count BIGINT,
    broken_links_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            COUNT(DISTINCT ba.bookmark_id) as total_bookmarks,
            COALESCE(SUM(ba.visit_count), 0) as total_visits,
            COUNT(*) FILTER (WHERE ba.visit_count = 0 OR ba.visit_count IS NULL) as never_visited
        FROM public.bookmark_analytics ba
        WHERE ba.user_id = p_user_id
    ),
    most_visited AS (
        SELECT url, title, visit_count
        FROM public.bookmark_analytics
        WHERE user_id = p_user_id
        ORDER BY visit_count DESC
        LIMIT 1
    ),
    broken AS (
        SELECT COUNT(*) as broken_count
        FROM public.link_checks
        WHERE user_id = p_user_id AND status = 'broken'
    )
    SELECT 
        s.total_bookmarks,
        s.total_visits,
        mv.url,
        mv.title,
        mv.visit_count,
        s.never_visited,
        b.broken_count
    FROM stats s
    CROSS JOIN LATERAL (SELECT * FROM most_visited) mv
    CROSS JOIN broken b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get broken links for a user
CREATE OR REPLACE FUNCTION public.get_broken_links(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    bookmark_id TEXT,
    url TEXT,
    status TEXT,
    status_code INTEGER,
    redirect_url TEXT,
    error_message TEXT,
    checked_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lc.id,
        lc.bookmark_id,
        lc.url,
        lc.status,
        lc.status_code,
        lc.redirect_url,
        lc.error_message,
        lc.checked_at
    FROM public.link_checks lc
    WHERE lc.user_id = p_user_id AND lc.status IN ('broken', 'timeout')
    ORDER BY lc.checked_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to upsert link check result
CREATE OR REPLACE FUNCTION public.upsert_link_check(
    p_user_id UUID,
    p_bookmark_id TEXT,
    p_url TEXT,
    p_status TEXT,
    p_status_code INTEGER DEFAULT NULL,
    p_redirect_url TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS public.link_checks AS $$
DECLARE
    result public.link_checks;
BEGIN
    INSERT INTO public.link_checks (user_id, bookmark_id, url, status, status_code, redirect_url, error_message, checked_at)
    VALUES (p_user_id, p_bookmark_id, p_url, p_status, p_status_code, p_redirect_url, p_error_message, NOW())
    ON CONFLICT (user_id, bookmark_id) DO UPDATE SET
        url = EXCLUDED.url,
        status = EXCLUDED.status,
        status_code = EXCLUDED.status_code,
        redirect_url = EXCLUDED.redirect_url,
        error_message = EXCLUDED.error_message,
        checked_at = NOW()
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update sync schedule
CREATE OR REPLACE FUNCTION public.update_sync_schedule(
    p_user_id UUID,
    p_interval_minutes INTEGER,
    p_enabled BOOLEAN DEFAULT TRUE
)
RETURNS public.sync_schedules AS $$
DECLARE
    result public.sync_schedules;
BEGIN
    INSERT INTO public.sync_schedules (user_id, interval_minutes, enabled, next_scheduled_sync)
    VALUES (
        p_user_id, 
        p_interval_minutes, 
        p_enabled,
        CASE WHEN p_enabled THEN NOW() + (p_interval_minutes || ' minutes')::INTERVAL ELSE NULL END
    )
    ON CONFLICT (user_id) DO UPDATE SET
        interval_minutes = EXCLUDED.interval_minutes,
        enabled = EXCLUDED.enabled,
        next_scheduled_sync = CASE 
            WHEN EXCLUDED.enabled THEN NOW() + (EXCLUDED.interval_minutes || ' minutes')::INTERVAL 
            ELSE NULL 
        END,
        updated_at = NOW()
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark sync as completed and schedule next
CREATE OR REPLACE FUNCTION public.complete_scheduled_sync(p_user_id UUID)
RETURNS public.sync_schedules AS $$
DECLARE
    result public.sync_schedules;
BEGIN
    UPDATE public.sync_schedules
    SET 
        last_scheduled_sync = NOW(),
        next_scheduled_sync = CASE 
            WHEN enabled THEN NOW() + (interval_minutes || ' minutes')::INTERVAL 
            ELSE NULL 
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Grant Permissions
-- ============================================
GRANT EXECUTE ON FUNCTION public.user_has_pro_features(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_bookmark_visit(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_broken_links(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_link_check(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_sync_schedule(UUID, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_scheduled_sync(UUID) TO authenticated;
