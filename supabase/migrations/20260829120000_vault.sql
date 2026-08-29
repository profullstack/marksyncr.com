-- MarkSyncr Vault — end-to-end encrypted password manager
--
-- The server stores ciphertext and never holds a key that can open it. Every
-- value in these tables was encrypted or derived on the client by
-- @marksyncr/vault; nothing here can be decrypted with anything the database,
-- its backups, or an operator with full access can see.
--
-- Two deliberate design points:
--
--  * Keys and ciphertext are base64 TEXT rather than BYTEA. The API speaks JSON
--    over PostgREST, where bytea round-trips as an escaped hex string and
--    invites encoding mistakes on exactly the values that must not be corrupted.
--
--  * vault_items is one row per item, unlike cloud_bookmarks which stores a
--    single JSONB blob. Two devices editing two *different* passwords at the
--    same moment must not cost anyone a credential, and with one blob the later
--    write silently discards the earlier. Per-row `revision` makes that a
--    detectable conflict instead.

-- ============================================
-- Vault metadata — one row per user
-- ============================================
CREATE TABLE IF NOT EXISTS public.vault_meta (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,

    -- KDF parameters travel with the vault so they can be strengthened later
    -- without invalidating anyone's data. The client refuses to derive below its
    -- own floor, so a compromised server cannot downgrade these to something
    -- cheap to attack.
    kdf TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
    kdf_iterations INTEGER NOT NULL DEFAULT 600000,
    kdf_memory_kib INTEGER,      -- reserved for argon2id
    kdf_parallelism INTEGER,     -- reserved for argon2id
    kdf_salt TEXT NOT NULL,      -- base64, per user

    -- The user key, encrypted under a key derived from the master password.
    protected_user_key TEXT NOT NULL,
    protected_user_key_iv TEXT NOT NULL,

    -- A second copy of the same user key under the recovery key, so a forgotten
    -- master password is survivable without the server learning anything.
    recovery_key_blob TEXT,
    recovery_key_iv TEXT,

    -- Server-side hash of the client's auth hash. The client derives its auth
    -- value from a different HKDF label than the wrapping key, so this column is
    -- useless for decryption even in full.
    auth_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT vault_meta_kdf_supported CHECK (kdf IN ('pbkdf2-sha256', 'argon2id')),
    -- Mirrors MIN_PBKDF2_ITERATIONS in packages/vault/src/kdf.js. Defence in
    -- depth: the client refuses weak parameters, and so does the database.
    CONSTRAINT vault_meta_kdf_iterations_sane CHECK (kdf_iterations >= 100000)
);

-- ============================================
-- Vault items — one row per login / card / identity / note
-- ============================================
CREATE TABLE IF NOT EXISTS public.vault_items (
    -- Generated on the client, because the id is bound into the ciphertext as
    -- additional authenticated data. A ciphertext moved to another row fails to
    -- decrypt rather than silently showing the wrong credential.
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- 1 login, 2 card, 3 identity, 4 note. Plaintext on purpose so the server
    -- can filter and count without decrypting; this is the metadata the design
    -- accepts leaking.
    type SMALLINT NOT NULL,

    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,

    -- Optimistic concurrency. A client sends the revision it read; the API
    -- rejects the write if it has moved on.
    revision BIGINT NOT NULL DEFAULT 1,

    -- Trash bin. deleted_at set means hidden; purge_after is when it stops
    -- being recoverable.
    deleted_at TIMESTAMPTZ,
    purge_after TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT vault_items_type_known CHECK (type BETWEEN 1 AND 4),
    CONSTRAINT vault_items_trash_consistent CHECK (
        (deleted_at IS NULL AND purge_after IS NULL)
        OR (deleted_at IS NOT NULL AND purge_after IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user_updated
    ON public.vault_items (user_id, updated_at DESC);

-- The common read: everything not in the trash.
CREATE INDEX IF NOT EXISTS idx_vault_items_user_active
    ON public.vault_items (user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vault_items_purge
    ON public.vault_items (purge_after)
    WHERE purge_after IS NOT NULL;

-- ============================================
-- Row level security
-- ============================================
ALTER TABLE public.vault_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_items ENABLE ROW LEVEL SECURITY;

-- (SELECT auth.uid()) rather than a bare auth.uid() so the planner evaluates it
-- once per query instead of once per row — the same fix migration 013 applied
-- to the existing tables.
CREATE POLICY "Users can view own vault meta" ON public.vault_meta
    FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own vault meta" ON public.vault_meta
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own vault meta" ON public.vault_meta
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own vault meta" ON public.vault_meta
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view own vault items" ON public.vault_items
    FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own vault items" ON public.vault_items
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own vault items" ON public.vault_items
    FOR UPDATE USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own vault items" ON public.vault_items
    FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER update_vault_meta_updated_at
    BEFORE UPDATE ON public.vault_meta
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Bumps updated_at AND revision on every write, so a client cannot forget to
-- move the revision and quietly defeat conflict detection.
-- SET search_path is required here; migration 012 fixed exactly this advisory
-- across the existing functions.
CREATE OR REPLACE FUNCTION public.bump_vault_item_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.revision = OLD.revision + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER bump_vault_items_revision
    BEFORE UPDATE ON public.vault_items
    FOR EACH ROW EXECUTE FUNCTION public.bump_vault_item_revision();

-- ============================================
-- Trash purge
-- ============================================
-- Hard-deletes items whose recovery window has passed. Safe to call from the
-- API on a read (it is indexed and usually a no-op), or from pg_cron where that
-- extension is available.
CREATE OR REPLACE FUNCTION public.purge_expired_vault_items()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    purged INTEGER;
BEGIN
    DELETE FROM public.vault_items
    WHERE purge_after IS NOT NULL AND purge_after < NOW();
    GET DIAGNOSTICS purged = ROW_COUNT;
    RETURN purged;
END;
$$;

COMMENT ON TABLE public.vault_meta IS
    'Per-user vault key material. Every value is encrypted or derived client-side; the server cannot decrypt any of it.';
COMMENT ON TABLE public.vault_items IS
    'Encrypted vault items. Only id, type and timestamps are plaintext — see the migration header for the metadata this deliberately leaks.';
