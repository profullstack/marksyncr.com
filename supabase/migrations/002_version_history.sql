-- MarkSyncr Version History Schema
-- This migration adds version history and rollback functionality

-- Bookmark version history table
CREATE TABLE IF NOT EXISTS public.bookmark_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    bookmark_data JSONB NOT NULL,
    checksum TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_name TEXT,
    device_id TEXT,
    device_name TEXT,
    change_summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Composite unique constraint
    UNIQUE(user_id, version)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_bookmark_versions_user_id ON public.bookmark_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_versions_created_at ON public.bookmark_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmark_versions_user_version ON public.bookmark_versions(user_id, version DESC);

-- Enable Row Level Security
ALTER TABLE public.bookmark_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bookmark_versions table
CREATE POLICY "Users can view own version history" ON public.bookmark_versions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own version history" ON public.bookmark_versions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own version history" ON public.bookmark_versions
    FOR DELETE USING (auth.uid() = user_id);

-- Function to get the next version number for a user
CREATE OR REPLACE FUNCTION public.get_next_version(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    next_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM public.bookmark_versions
    WHERE user_id = p_user_id;
    
    RETURN next_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
RETURNS public.bookmark_versions AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rollback to a specific version
CREATE OR REPLACE FUNCTION public.rollback_to_version(
    p_user_id UUID,
    p_target_version INTEGER
)
RETURNS public.bookmark_versions AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get version history with pagination
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
    ORDER BY bv.version DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get a specific version's full data
CREATE OR REPLACE FUNCTION public.get_version_data(
    p_user_id UUID,
    p_version INTEGER
)
RETURNS public.bookmark_versions AS $$
DECLARE
    result public.bookmark_versions;
BEGIN
    SELECT * INTO result
    FROM public.bookmark_versions
    WHERE user_id = p_user_id AND version = p_version;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old versions (keep last N versions based on plan)
CREATE OR REPLACE FUNCTION public.cleanup_old_versions(
    p_user_id UUID,
    p_keep_count INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH versions_to_delete AS (
        SELECT id
        FROM public.bookmark_versions
        WHERE user_id = p_user_id
        ORDER BY version DESC
        OFFSET p_keep_count
    )
    DELETE FROM public.bookmark_versions
    WHERE id IN (SELECT id FROM versions_to_delete);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get version retention limit based on plan
CREATE OR REPLACE FUNCTION public.get_version_retention_limit(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    user_plan TEXT;
    retention_limit INTEGER;
BEGIN
    SELECT plan INTO user_plan
    FROM public.subscriptions
    WHERE user_id = p_user_id;
    
    CASE user_plan
        WHEN 'free' THEN retention_limit := 5;
        WHEN 'pro' THEN retention_limit := 30;
        WHEN 'team' THEN retention_limit := 365;
        ELSE retention_limit := 5;
    END CASE;
    
    RETURN retention_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-cleanup old versions after insert
CREATE OR REPLACE FUNCTION public.auto_cleanup_versions()
RETURNS TRIGGER AS $$
DECLARE
    retention_limit INTEGER;
BEGIN
    -- Get retention limit based on user's plan
    retention_limit := public.get_version_retention_limit(NEW.user_id);
    
    -- Cleanup old versions
    PERFORM public.cleanup_old_versions(NEW.user_id, retention_limit);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_cleanup_versions
    AFTER INSERT ON public.bookmark_versions
    FOR EACH ROW EXECUTE FUNCTION public.auto_cleanup_versions();

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.get_next_version(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_bookmark_version(UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_to_version(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_version_history(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_version_data(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_versions(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_version_retention_limit(UUID) TO authenticated;
