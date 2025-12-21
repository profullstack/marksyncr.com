-- Cloud Bookmarks and User Settings Tables for MarkSyncr
-- Run this in your Supabase SQL Editor

-- ============================================
-- User Settings Table
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{
    "syncEnabled": true,
    "syncInterval": "hourly",
    "conflictResolution": "newest",
    "autoBackup": true,
    "notifications": {
      "syncComplete": true,
      "syncErrors": true,
      "duplicatesFound": false,
      "brokenLinks": false
    },
    "theme": "system"
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_settings
CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Cloud Bookmarks Table
-- ============================================
CREATE TABLE IF NOT EXISTS cloud_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  folder_path TEXT DEFAULT '',
  description TEXT DEFAULT '',
  favicon TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT 'browser', -- 'browser' | 'chrome' | 'firefox' | 'safari' | 'edge' | 'import'
  date_added TIMESTAMPTZ DEFAULT NOW(),
  last_visited TIMESTAMPTZ,
  visit_count INTEGER DEFAULT 0,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint on user_id + url to prevent duplicates
  UNIQUE(user_id, url)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_cloud_bookmarks_user_id ON cloud_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_bookmarks_url ON cloud_bookmarks(url);
CREATE INDEX IF NOT EXISTS idx_cloud_bookmarks_folder_path ON cloud_bookmarks(folder_path);
CREATE INDEX IF NOT EXISTS idx_cloud_bookmarks_tags ON cloud_bookmarks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_cloud_bookmarks_created_at ON cloud_bookmarks(created_at DESC);

-- Enable RLS
ALTER TABLE cloud_bookmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cloud_bookmarks
CREATE POLICY "Users can view their own bookmarks"
  ON cloud_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bookmarks"
  ON cloud_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookmarks"
  ON cloud_bookmarks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookmarks"
  ON cloud_bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at for bookmarks
CREATE TRIGGER update_cloud_bookmarks_updated_at
  BEFORE UPDATE ON cloud_bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Subscriptions Table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro' | 'team'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'canceled' | 'past_due'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only allow service role to modify subscriptions (via webhooks)
CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to auto-update updated_at for subscriptions
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- User Tags Table (for Pro features)
-- ============================================
CREATE TABLE IF NOT EXISTS user_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6', -- Default blue color
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, name)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags(user_id);

-- Enable RLS
ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_tags
CREATE POLICY "Users can view their own tags"
  ON user_tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags"
  ON user_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON user_tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON user_tags FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at for tags
CREATE TRIGGER update_user_tags_updated_at
  BEFORE UPDATE ON user_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper Functions
-- ============================================

-- Function to upsert bookmarks (insert or update on conflict)
CREATE OR REPLACE FUNCTION upsert_bookmarks(
  p_user_id UUID,
  p_bookmarks JSONB
)
RETURNS TABLE (
  inserted INTEGER,
  updated INTEGER,
  total INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bookmark JSONB;
  inserted_count INTEGER := 0;
  updated_count INTEGER := 0;
BEGIN
  FOR bookmark IN SELECT * FROM jsonb_array_elements(p_bookmarks)
  LOOP
    INSERT INTO cloud_bookmarks (
      user_id,
      url,
      title,
      folder_path,
      source,
      date_added
    )
    VALUES (
      p_user_id,
      bookmark->>'url',
      COALESCE(bookmark->>'title', ''),
      COALESCE(bookmark->>'folderPath', ''),
      COALESCE(bookmark->>'source', 'browser'),
      CASE 
        WHEN bookmark->>'dateAdded' IS NOT NULL 
        THEN to_timestamp((bookmark->>'dateAdded')::bigint / 1000)
        ELSE NOW()
      END
    )
    ON CONFLICT (user_id, url) DO UPDATE SET
      title = EXCLUDED.title,
      folder_path = EXCLUDED.folder_path,
      updated_at = NOW()
    RETURNING (xmax = 0) INTO STRICT inserted_count;
    
    IF inserted_count THEN
      inserted_count := inserted_count + 1;
    ELSE
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT inserted_count, updated_count, inserted_count + updated_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION upsert_bookmarks TO authenticated;

-- ============================================
-- Initial data setup
-- ============================================

-- Create default settings for existing users (if any)
INSERT INTO user_settings (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_settings)
ON CONFLICT DO NOTHING;

-- Create default free subscription for existing users (if any)
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'free', 'active' FROM auth.users
WHERE id NOT IN (SELECT user_id FROM subscriptions)
ON CONFLICT DO NOTHING;
