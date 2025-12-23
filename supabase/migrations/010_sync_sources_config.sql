-- MarkSyncr Sync Sources Configuration
-- This migration adds repository/storage configuration columns to sync_sources

-- Add configuration columns for provider-specific settings
ALTER TABLE public.sync_sources
ADD COLUMN IF NOT EXISTS repository TEXT,
ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'main',
ADD COLUMN IF NOT EXISTS file_path TEXT DEFAULT 'bookmarks.json',
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN public.sync_sources.repository IS 'Repository identifier (e.g., username/repo for GitHub)';
COMMENT ON COLUMN public.sync_sources.branch IS 'Branch name for version-controlled sources (default: main)';
COMMENT ON COLUMN public.sync_sources.file_path IS 'Path to bookmark file within the storage (default: bookmarks.json)';
COMMENT ON COLUMN public.sync_sources.config IS 'Additional provider-specific configuration as JSON';

-- Create index for repository lookups
CREATE INDEX IF NOT EXISTS idx_sync_sources_repository ON public.sync_sources(repository);
