-- Migration: Add tombstones column to cloud_bookmarks table
-- This column stores deleted bookmark records for cross-browser deletion sync

-- Add tombstones column as JSONB array
ALTER TABLE cloud_bookmarks 
ADD COLUMN IF NOT EXISTS tombstones JSONB DEFAULT '[]'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN cloud_bookmarks.tombstones IS 'Array of tombstone records for deleted bookmarks. Each tombstone has {url: string, deletedAt: number (timestamp)}';

-- Create index for efficient tombstone queries
CREATE INDEX IF NOT EXISTS idx_cloud_bookmarks_tombstones ON cloud_bookmarks USING GIN (tombstones);
