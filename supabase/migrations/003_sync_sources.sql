-- MarkSyncr Sync Sources Table
-- This migration creates the sync_sources table for tracking connected sync providers

-- Sync sources table (tracks connected sync providers)
CREATE TABLE IF NOT EXISTS public.sync_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('github', 'dropbox', 'google-drive', 'marksyncr-cloud')),
    provider_user_id TEXT,
    provider_username TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_type TEXT,
    scope TEXT,
    expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sync_sources_user_id ON public.sync_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_sources_provider ON public.sync_sources(provider);

-- Enable Row Level Security
ALTER TABLE public.sync_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sync_sources table
CREATE POLICY "Users can view own sync sources" ON public.sync_sources
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync sources" ON public.sync_sources
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync sources" ON public.sync_sources
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sync sources" ON public.sync_sources
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sync_sources_updated_at
    BEFORE UPDATE ON public.sync_sources
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
