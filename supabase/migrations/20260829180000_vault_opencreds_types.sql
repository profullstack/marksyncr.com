-- OpenCreds item types — widen vault_items to the full six
--
-- The vault shipped with four types: 1 login, 2 card, 3 identity, 4 note. The
-- OpenCreds specification (https://logicsrc.com/opencreds) adds two more, and
-- fixes 1-4 at the values already deployed here, because renumbering them would
-- break every ciphertext already written:
--
--   5 key      SSH and PGP keys, API tokens, certificates, .env secrets
--   6 account  a provider account and the OAuth tokens that act as it
--
-- A key is not a note with a long body, and an account is not a login. A login
-- is what a person types at a sign-in form; an account is what a machine
-- presents to an API. They expire differently and are revoked differently, and
-- conflating them is how a rotated refresh token ends up in a password history
-- array.
--
-- Nothing about the row shape changes: type stays plaintext so the server can
-- filter and paginate without decrypting, and everything else stays inside the
-- one ciphertext.

ALTER TABLE public.vault_items
    DROP CONSTRAINT IF EXISTS vault_items_type_known;

ALTER TABLE public.vault_items
    ADD CONSTRAINT vault_items_type_known CHECK (type BETWEEN 1 AND 6);

COMMENT ON COLUMN public.vault_items.type IS
    'OpenCreds item type code: 1 login, 2 card, 3 identity, 4 note, 5 key, 6 account. Plaintext on purpose — see the migration header for the metadata this deliberately leaks.';
