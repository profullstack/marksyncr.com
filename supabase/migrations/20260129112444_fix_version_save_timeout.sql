-- Fix statement timeout on save_bookmark_version
-- Supabase default statement_timeout (8s) is too short for inserting large JSONB
-- bookmark payloads (e.g. 743+ bookmarks as nested JSON tree).
-- This migration:
-- 1. Sets statement_timeout = 30s for save_bookmark_version
-- 2. Restores checksum deduplication lost in migration 012
-- 3. Sets statement_timeout = 30s for get_version_history (recursive JSONB counting)

-- ============================================
-- Fix save_bookmark_version with timeout + dedup
-- ============================================
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
SET statement_timeout = '30s'
AS $$
DECLARE
    new_version INTEGER;
    existing_checksum TEXT;
    result public.bookmark_versions;
BEGIN
    -- Check if the latest version has the same checksum
    -- If so, skip creating a new version (no actual changes)
    SELECT checksum INTO existing_checksum
    FROM public.bookmark_versions
    WHERE user_id = p_user_id
    ORDER BY version DESC
    LIMIT 1;

    -- If checksum matches, return the existing version without creating a new one
    IF existing_checksum IS NOT NULL AND existing_checksum = p_checksum THEN
        SELECT * INTO result
        FROM public.bookmark_versions
        WHERE user_id = p_user_id
        ORDER BY version DESC
        LIMIT 1;

        -- Still update cloud_bookmarks to ensure it's in sync
        UPDATE public.cloud_bookmarks
        SET last_modified = NOW()
        WHERE user_id = p_user_id;

        RETURN result;
    END IF;

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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.save_bookmark_version(UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================
-- Fix get_version_history with timeout
-- ============================================
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
SET statement_timeout = '30s'
AS $$
BEGIN
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
    ORDER BY bv.version DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_version_history(UUID, INTEGER, INTEGER) TO authenticated;
