-- Fix PostgreSQL function search_path security vulnerability
-- This migration updates all functions to have an immutable search_path
-- to prevent SQL injection attacks via search_path manipulation
-- See: https://supabase.com/docs/guides/database/database-advisors#security

-- ============================================
-- Functions from 001_initial_schema.sql
-- ============================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    
    -- Create free subscription by default
    INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active');
    
    RETURN NEW;
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================
-- Functions from 002_version_history.sql
-- ============================================

-- Function to get the next version number for a user
CREATE OR REPLACE FUNCTION public.get_next_version(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM public.bookmark_versions
    WHERE user_id = p_user_id;
    
    RETURN next_version;
END;
$$;

-- Function to save a new version (called on each sync)
CREATE OR REPLACE FUNCTION public.save_bookmark_version(
    p_user_id UUID,
    p_bookmark_data JSONB,
    p_checksum TEXT,
    p_source_type TEXT,
    p_source_name TEXT DEFAULT NULL,
    p_device_id TEXT DEFAULT NULL,
    p_device_name TEXT DEFAULT NULL,
    p_change_summary JSONB DEFAULT '{}'
)
RETURNS public.bookmark_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_version INTEGER;
    result public.bookmark_versions;
BEGIN
    -- Get next version number
    new_version := public.get_next_version(p_user_id);
    
    -- Insert new version
    INSERT INTO public.bookmark_versions (
        user_id,
        version,
        bookmark_data,
        checksum,
        source_type,
        source_name,
        device_id,
        device_name,
        change_summary
    ) VALUES (
        p_user_id,
        new_version,
        p_bookmark_data,
        p_checksum,
        p_source_type,
        p_source_name,
        p_device_id,
        p_device_name,
        p_change_summary
    )
    RETURNING * INTO result;
    
    -- Update current bookmarks
    INSERT INTO public.cloud_bookmarks (user_id, bookmark_data, checksum, version)
    VALUES (p_user_id, p_bookmark_data, p_checksum, new_version)
    ON CONFLICT (user_id) DO UPDATE SET
        bookmark_data = EXCLUDED.bookmark_data,
        checksum = EXCLUDED.checksum,
        version = EXCLUDED.version,
        last_modified = NOW();
    
    RETURN result;
END;
$$;

-- Function to rollback to a specific version
CREATE OR REPLACE FUNCTION public.rollback_to_version(
    p_user_id UUID,
    p_target_version INTEGER
)
RETURNS public.bookmark_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_data public.bookmark_versions;
    new_version INTEGER;
    result public.bookmark_versions;
BEGIN
    -- Get the target version data
    SELECT * INTO target_data
    FROM public.bookmark_versions
    WHERE user_id = p_user_id AND version = p_target_version;
    
    IF target_data IS NULL THEN
        RAISE EXCEPTION 'Version % not found for user', p_target_version;
    END IF;
    
    -- Create a new version with the rolled back data
    new_version := public.get_next_version(p_user_id);
    
    INSERT INTO public.bookmark_versions (
        user_id,
        version,
        bookmark_data,
        checksum,
        source_type,
        source_name,
        device_id,
        device_name,
        change_summary
    ) VALUES (
        p_user_id,
        new_version,
        target_data.bookmark_data,
        target_data.checksum,
        'rollback',
        'Rollback to version ' || p_target_version,
        target_data.device_id,
        target_data.device_name,
        jsonb_build_object(
            'type', 'rollback',
            'from_version', (SELECT version FROM public.cloud_bookmarks WHERE user_id = p_user_id),
            'to_version', p_target_version
        )
    )
    RETURNING * INTO result;
    
    -- Update current bookmarks
    UPDATE public.cloud_bookmarks
    SET 
        bookmark_data = target_data.bookmark_data,
        checksum = target_data.checksum,
        version = new_version,
        last_modified = NOW()
    WHERE user_id = p_user_id;
    
    RETURN result;
END;
$$;

-- Function to get a specific version's full data
CREATE OR REPLACE FUNCTION public.get_version_data(
    p_user_id UUID,
    p_version INTEGER
)
RETURNS public.bookmark_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result public.bookmark_versions;
BEGIN
    SELECT * INTO result
    FROM public.bookmark_versions
    WHERE user_id = p_user_id AND version = p_version;
    
    RETURN result;
END;
$$;

-- ============================================
-- Functions from 20231223_version_history_time_based.sql
-- (These use time-based retention with p_retention_days)
-- ============================================

-- Function to get version retention limit based on plan (returns days)
CREATE OR REPLACE FUNCTION public.get_version_retention_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_plan TEXT;
    retention_days INTEGER;
BEGIN
    SELECT plan INTO user_plan
    FROM public.subscriptions
    WHERE user_id = p_user_id;
    
    CASE user_plan
        WHEN 'free' THEN retention_days := 5;
        WHEN 'pro' THEN retention_days := 30;
        WHEN 'team' THEN retention_days := 365;
        ELSE retention_days := 5;
    END CASE;
    
    RETURN retention_days;
END;
$$;

-- Function to cleanup old versions (time-based retention)
CREATE OR REPLACE FUNCTION public.cleanup_old_versions(
    p_user_id UUID,
    p_retention_days INTEGER DEFAULT 5
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMPTZ;
BEGIN
    cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;
    
    DELETE FROM public.bookmark_versions
    WHERE user_id = p_user_id
      AND created_at < cutoff_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Trigger to auto-cleanup old versions after insert (time-based)
CREATE OR REPLACE FUNCTION public.auto_cleanup_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    retention_days INTEGER;
BEGIN
    -- Get retention limit based on user's plan (in days)
    retention_days := public.get_version_retention_limit(NEW.user_id);
    
    -- Cleanup old versions based on time
    PERFORM public.cleanup_old_versions(NEW.user_id, retention_days);
    
    RETURN NEW;
END;
$$;

-- Function to get version history with pagination (time-based filtering)
CREATE OR REPLACE FUNCTION public.get_version_history(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    version INTEGER,
    checksum TEXT,
    source_type TEXT,
    source_name TEXT,
    device_name TEXT,
    change_summary JSONB,
    created_at TIMESTAMPTZ,
    bookmark_count INTEGER,
    folder_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    retention_days INTEGER;
    cutoff_date TIMESTAMPTZ;
BEGIN
    -- Get retention limit based on user's plan
    retention_days := public.get_version_retention_limit(p_user_id);
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    RETURN QUERY
    SELECT 
        bv.id,
        bv.version,
        bv.checksum,
        bv.source_type,
        bv.source_name,
        bv.device_name,
        bv.change_summary,
        bv.created_at,
        -- Count bookmarks recursively from roots->toolbar/menu/other->children
        (
            SELECT COUNT(*)::INTEGER 
            FROM (
                SELECT jsonb_array_elements_recursive(
                    COALESCE(bv.bookmark_data->'roots'->'toolbar'->'children', '[]'::jsonb) ||
                    COALESCE(bv.bookmark_data->'roots'->'menu'->'children', '[]'::jsonb) ||
                    COALESCE(bv.bookmark_data->'roots'->'other'->'children', '[]'::jsonb)
                ) as elem
            ) sub
            WHERE sub.elem->>'type' = 'bookmark' OR sub.elem->>'url' IS NOT NULL
        ) as bookmark_count,
        -- Count folders recursively
        (
            SELECT COUNT(*)::INTEGER 
            FROM (
                SELECT jsonb_array_elements_recursive(
                    COALESCE(bv.bookmark_data->'roots'->'toolbar'->'children', '[]'::jsonb) ||
                    COALESCE(bv.bookmark_data->'roots'->'menu'->'children', '[]'::jsonb) ||
                    COALESCE(bv.bookmark_data->'roots'->'other'->'children', '[]'::jsonb)
                ) as elem
            ) sub
            WHERE sub.elem->>'type' = 'folder' OR (sub.elem->>'url' IS NULL AND sub.elem->'children' IS NOT NULL)
        ) as folder_count
    FROM public.bookmark_versions bv
    WHERE bv.user_id = p_user_id
      AND bv.created_at >= cutoff_date
    ORDER BY bv.version DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- ============================================
-- Functions from 004_pro_features.sql
-- ============================================

-- Function to check if user has Pro features
CREATE OR REPLACE FUNCTION public.user_has_pro_features(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_plan TEXT;
BEGIN
    SELECT plan INTO user_plan
    FROM public.subscriptions
    WHERE user_id = p_user_id AND status IN ('active', 'trialing');
    
    RETURN user_plan IN ('pro', 'team');
END;
$$;

-- Function to record a bookmark visit (for analytics)
CREATE OR REPLACE FUNCTION public.record_bookmark_visit(
    p_user_id UUID,
    p_bookmark_id TEXT,
    p_url TEXT,
    p_title TEXT DEFAULT NULL
)
RETURNS public.bookmark_analytics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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
RETURNS public.link_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Function to update sync schedule
CREATE OR REPLACE FUNCTION public.update_sync_schedule(
    p_user_id UUID,
    p_interval_minutes INTEGER,
    p_enabled BOOLEAN DEFAULT TRUE
)
RETURNS public.sync_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Function to mark sync as completed and schedule next
CREATE OR REPLACE FUNCTION public.complete_scheduled_sync(p_user_id UUID)
RETURNS public.sync_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ============================================
-- Functions from 011_fix_version_history_counts.sql
-- ============================================

-- Helper function to recursively extract all elements from nested JSONB arrays
CREATE OR REPLACE FUNCTION jsonb_array_elements_recursive(data jsonb)
RETURNS SETOF jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    elem jsonb;
BEGIN
    IF jsonb_typeof(data) = 'array' THEN
        FOR elem IN SELECT * FROM jsonb_array_elements(data)
        LOOP
            RETURN NEXT elem;
            IF elem->'children' IS NOT NULL THEN
                RETURN QUERY SELECT * FROM jsonb_array_elements_recursive(elem->'children');
            END IF;
        END LOOP;
    END IF;
END;
$$;
