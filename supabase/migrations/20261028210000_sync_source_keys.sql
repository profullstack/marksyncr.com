-- Seal v2 for sync-source tokens (GitHub / Dropbox / Google Drive).
--
-- sync_sources.access_token / refresh_token were PLAINTEXT. Now each user's
-- extension registers a sync key: an ECDH P-256 public key (stored here in the
-- clear) whose private half is encrypted under the user's vault key
-- (private_sealed) and so opens only in their unlocked extension. The server
-- seals tokens to the public key ("v2:" values) and can never read them back.
-- Rows not starting with 'v2:' are legacy plaintext awaiting migration.

CREATE TABLE IF NOT EXISTS public.sync_source_keys (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    private_sealed JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sync_source_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sync key" ON public.sync_source_keys;
CREATE POLICY "Users can view own sync key" ON public.sync_source_keys
    FOR SELECT USING (auth.uid() = user_id);
-- Writes go through POST /api/sync-key (service role) only.

-- Unmigrated rows (run by hand):
--   SELECT provider, count(*) FROM sync_sources
--    WHERE (access_token IS NOT NULL AND access_token NOT LIKE 'v2:%')
--       OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE 'v2:%') GROUP BY 1;
