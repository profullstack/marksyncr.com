-- Migration: 015_extension_sessions
-- Description: Create extension_sessions table for long-lived browser extension sessions
-- 
-- This table stores long-lived session tokens for browser extensions.
-- Unlike Supabase's default JWT tokens (which expire in 1 hour with 7-day refresh tokens),
-- extension sessions are designed to last 1 year to avoid requiring frequent re-logins.
--
-- Security considerations:
-- - extension_token is a cryptographically secure random token (256 bits)
-- - Tokens are hashed before storage for additional security
-- - Sessions can be revoked by deleting the row
-- - last_used_at tracks activity for potential cleanup of stale sessions

-- Create the extension_sessions table
CREATE TABLE IF NOT EXISTS extension_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- The extension token is what the extension stores and sends with requests
    -- This is stored as a hash for security (we only need to verify, not retrieve)
    extension_token_hash TEXT NOT NULL,
    
    -- Store the Supabase refresh token to get new access tokens
    -- This is encrypted at rest by Supabase
    supabase_refresh_token TEXT NOT NULL,
    
    -- Device identification for multi-device support
    device_id TEXT,
    device_name TEXT,
    browser TEXT,
    
    -- Session lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Revocation support
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    
    -- Ensure unique tokens
    CONSTRAINT unique_extension_token_hash UNIQUE (extension_token_hash)
);

-- Create index for fast token lookups (most common operation)
CREATE INDEX IF NOT EXISTS idx_extension_sessions_token_hash 
    ON extension_sessions(extension_token_hash) 
    WHERE revoked_at IS NULL;

-- Create index for user session management
CREATE INDEX IF NOT EXISTS idx_extension_sessions_user_id 
    ON extension_sessions(user_id);

-- Create index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_extension_sessions_expires_at 
    ON extension_sessions(expires_at) 
    WHERE revoked_at IS NULL;

-- Enable Row Level Security
ALTER TABLE extension_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own sessions
CREATE POLICY "Users can view own extension sessions"
    ON extension_sessions
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can delete (revoke) their own sessions
CREATE POLICY "Users can delete own extension sessions"
    ON extension_sessions
    FOR DELETE
    USING (auth.uid() = user_id);

-- Note: INSERT and UPDATE are done via service role key (server-side only)
-- This prevents clients from creating or modifying sessions directly

-- Function to clean up expired sessions (can be called by a cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_extension_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM extension_sessions
    WHERE expires_at < NOW()
       OR revoked_at IS NOT NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Grant execute permission to authenticated users (for manual cleanup)
GRANT EXECUTE ON FUNCTION cleanup_expired_extension_sessions() TO authenticated;

-- Comment on table for documentation
COMMENT ON TABLE extension_sessions IS 'Long-lived session tokens for browser extensions (1 year expiry)';
COMMENT ON COLUMN extension_sessions.extension_token_hash IS 'SHA-256 hash of the extension token for secure verification';
COMMENT ON COLUMN extension_sessions.supabase_refresh_token IS 'Supabase refresh token for obtaining new access tokens';
COMMENT ON COLUMN extension_sessions.device_id IS 'Unique identifier for the browser/device';
COMMENT ON COLUMN extension_sessions.expires_at IS 'Session expiration (default: 1 year from creation)';
COMMENT ON COLUMN extension_sessions.last_used_at IS 'Last time the session was used (for activity tracking)';
