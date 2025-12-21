-- Version History Tables and Functions for MarkSyncr
-- Run this in your Supabase SQL Editor

-- Create bookmark_versions table
CREATE TABLE IF NOT EXISTS bookmark_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  bookmark_data JSONB NOT NULL,
  checksum TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT,
  device_id TEXT,
  device_name TEXT,
  change_summary JSONB DEFAULT '{}',
  bookmark_count INTEGER DEFAULT 0,
  folder_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, version)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_bookmark_versions_user_id ON bookmark_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_versions_created_at ON bookmark_versions(created_at DESC);

-- Enable RLS
ALTER TABLE bookmark_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own versions"
  ON bookmark_versions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own versions"
  ON bookmark_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own versions"
  ON bookmark_versions FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get version history
CREATE OR REPLACE FUNCTION get_version_history(
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
    bv.bookmark_count,
    bv.folder_count
  FROM bookmark_versions bv
  WHERE bv.user_id = p_user_id
  ORDER BY bv.version DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get retention limit based on subscription
CREATE OR REPLACE FUNCTION get_version_retention_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_plan TEXT;
  retention INTEGER;
BEGIN
  -- Get user's subscription plan
  SELECT plan INTO user_plan
  FROM subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;
  
  -- Set retention based on plan
  CASE user_plan
    WHEN 'pro' THEN retention := 30;
    WHEN 'team' THEN retention := 90;
    ELSE retention := 5;
  END CASE;
  
  RETURN retention;
END;
$$;

-- Function to save a new bookmark version
CREATE OR REPLACE FUNCTION save_bookmark_version(
  p_user_id UUID,
  p_bookmark_data JSONB,
  p_checksum TEXT,
  p_source_type TEXT,
  p_source_name TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL,
  p_change_summary JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  checksum TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_version INTEGER;
  new_id UUID;
  new_created_at TIMESTAMPTZ;
  bookmark_count INTEGER;
  folder_count INTEGER;
  retention_limit INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(bv.version), 0) + 1 INTO next_version
  FROM bookmark_versions bv
  WHERE bv.user_id = p_user_id;
  
  -- Count bookmarks and folders
  SELECT 
    COUNT(*) FILTER (WHERE item->>'type' = 'bookmark'),
    COUNT(*) FILTER (WHERE item->>'type' = 'folder')
  INTO bookmark_count, folder_count
  FROM jsonb_array_elements(p_bookmark_data) AS item;
  
  -- Insert new version
  INSERT INTO bookmark_versions (
    user_id, version, bookmark_data, checksum, source_type, 
    source_name, device_id, device_name, change_summary,
    bookmark_count, folder_count
  )
  VALUES (
    p_user_id, next_version, p_bookmark_data, p_checksum, p_source_type,
    p_source_name, p_device_id, p_device_name, p_change_summary,
    bookmark_count, folder_count
  )
  RETURNING bookmark_versions.id, bookmark_versions.created_at INTO new_id, new_created_at;
  
  -- Clean up old versions based on retention limit
  retention_limit := get_version_retention_limit(p_user_id);
  
  DELETE FROM bookmark_versions
  WHERE user_id = p_user_id
  AND version <= (next_version - retention_limit);
  
  RETURN QUERY SELECT new_id, next_version, p_checksum, new_created_at;
END;
$$;

-- Function to get a specific version's data
CREATE OR REPLACE FUNCTION get_version_data(
  p_user_id UUID,
  p_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  data JSONB;
BEGIN
  SELECT bookmark_data INTO data
  FROM bookmark_versions
  WHERE user_id = p_user_id AND version = p_version;
  
  RETURN data;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_version_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_version_retention_limit TO authenticated;
GRANT EXECUTE ON FUNCTION save_bookmark_version TO authenticated;
GRANT EXECUTE ON FUNCTION get_version_data TO authenticated;
