-- Fix version history bookmark/folder counting
-- The previous SQL was looking at bookmark_data->'bookmarks' but the actual structure uses bookmark_data->'roots'

-- Drop and recreate the function with correct JSON paths
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to recursively extract all elements from nested JSONB arrays
CREATE OR REPLACE FUNCTION jsonb_array_elements_recursive(data jsonb)
RETURNS SETOF jsonb AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION jsonb_array_elements_recursive(jsonb) TO authenticated;
