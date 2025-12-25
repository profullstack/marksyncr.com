-- Fix version history to skip creating duplicate entries when checksum is the same
-- This prevents creating new versions when no actual changes occurred

-- Drop and recreate the save_bookmark_version function with checksum deduplication
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
RETURNS public.bookmark_versions AS $$
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
        -- (in case tombstones changed but bookmarks didn't)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.save_bookmark_version(UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
