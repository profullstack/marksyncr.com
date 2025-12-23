-- MarkSyncr Version History - Time-Based Retention
-- This migration updates version history to use time-based retention
-- Free users: 5 days, Pro users: 30 days, Team users: 1 year

-- Update the retention limit function to return days instead of count
CREATE OR REPLACE FUNCTION public.get_version_retention_limit(p_user_id UUID)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_version_history to filter by date based on user's plan
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
) AS $$
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
        (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(
            COALESCE(bv.bookmark_data->'bookmarks'->'toolbar', '[]'::jsonb) ||
            COALESCE(bv.bookmark_data->'bookmarks'->'menu', '[]'::jsonb) ||
            COALESCE(bv.bookmark_data->'bookmarks'->'other', '[]'::jsonb)
        )) as bookmark_count,
        (SELECT COUNT(*)::INTEGER FROM jsonb_array_elements(
            COALESCE(bv.bookmark_data->'bookmarks'->'toolbar', '[]'::jsonb) ||
            COALESCE(bv.bookmark_data->'bookmarks'->'menu', '[]'::jsonb) ||
            COALESCE(bv.bookmark_data->'bookmarks'->'other', '[]'::jsonb)
        ) elem WHERE elem->>'url' IS NULL) as folder_count
    FROM public.bookmark_versions bv
    WHERE bv.user_id = p_user_id
      AND bv.created_at >= cutoff_date
    ORDER BY bv.version DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cleanup function to use time-based retention
CREATE OR REPLACE FUNCTION public.cleanup_old_versions(
    p_user_id UUID,
    p_retention_days INTEGER DEFAULT 5
)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update auto-cleanup trigger to use time-based retention
CREATE OR REPLACE FUNCTION public.auto_cleanup_versions()
RETURNS TRIGGER AS $$
DECLARE
    retention_days INTEGER;
BEGIN
    -- Get retention limit based on user's plan (in days)
    retention_days := public.get_version_retention_limit(NEW.user_id);
    
    -- Cleanup old versions based on time
    PERFORM public.cleanup_old_versions(NEW.user_id, retention_days);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on updated functions
GRANT EXECUTE ON FUNCTION public.get_version_retention_limit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_version_history(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_versions(UUID, INTEGER) TO authenticated;
