/**
 * @vitest-environment node
 *
 * Seal v2 for sync-source tokens: the server (node:crypto) seals, only the
 * extension (WebCrypto, vault key) opens; per-request tokens; migration.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  createSyncKey,
  openSyncPrivateKey,
  openSealedToken,
  sealToSyncKey,
} from '../../../packages/vault/src/sync-key.js';
import { sealToPublicKey, isSealedToken, tokenForSync } from '@/lib/sealed-tokens';
import { sealRowPatch } from '@/lib/sync-key-migrate';

const USER = '11111111-1111-4111-8111-111111111111';

async function keyPair() {
  const userKey = new Uint8Array(randomBytes(32));
  const record = await createSyncKey(userKey, USER);
  return { userKey, record };
}

afterEach(() => vi.unstubAllEnvs());

describe('sync token sealing', () => {
  it('server seals, extension opens; the record holds no usable private key', async () => {
    const { userKey, record } = await keyPair();
    const sealed = sealToPublicKey(record.public_key, 'gho_token', USER, 'access_token');
    expect(isSealedToken(sealed)).toBe(true);
    expect(sealed).not.toContain('gho_token');
    const priv = await openSyncPrivateKey(userKey, record, USER);
    expect(await openSealedToken(priv, sealed, USER, 'access_token')).toBe('gho_token');
    // bound to field and user
    await expect(openSealedToken(priv, sealed, USER, 'refresh_token')).rejects.toThrow();
    await expect(openSealedToken(priv, sealed, 'other-user', 'access_token')).rejects.toThrow();
    // a different vault key cannot open the private key
    await expect(
      openSyncPrivateKey(new Uint8Array(randomBytes(32)), record, USER)
    ).rejects.toThrow();
  });

  it('WebCrypto-sealed values open the same way (format interop)', async () => {
    const { userKey, record } = await keyPair();
    const sealed = await sealToSyncKey(record.public_key, 'dbx_token', USER, 'refresh_token');
    const priv = await openSyncPrivateKey(userKey, record, USER);
    expect(await openSealedToken(priv, sealed, USER, 'refresh_token')).toBe('dbx_token');
  });
});

describe('tokenForSync (no server fallback for sealed rows)', () => {
  it('a sealed row syncs only with the token the extension sent', async () => {
    const { record } = await keyPair();
    const row = {
      provider: 'github',
      access_token: sealToPublicKey(record.public_key, 't', USER, 'access_token'),
    };
    expect(tokenForSync(row, null)).toBeNull();
    expect(tokenForSync(row, { github: { access_token: 'sent' } })).toBe('sent');
  });

  it('legacy plaintext is used only until LEGACY_KEY_MIGRATION=off', () => {
    const row = { provider: 'github', access_token: 'plain' };
    expect(tokenForSync(row, null)).toBe('plain');
    vi.stubEnv('LEGACY_KEY_MIGRATION', 'off');
    expect(tokenForSync(row, null)).toBeNull();
  });
});

describe('migration', () => {
  it('seals plaintext tokens and leaves sealed ones alone', async () => {
    const { userKey, record } = await keyPair();
    const patch = sealRowPatch(
      { access_token: 'plain-a', refresh_token: 'plain-r' },
      USER,
      record.public_key
    );
    const priv = await openSyncPrivateKey(userKey, record, USER);
    expect(await openSealedToken(priv, patch.access_token, USER, 'access_token')).toBe('plain-a');
    expect(await openSealedToken(priv, patch.refresh_token, USER, 'refresh_token')).toBe('plain-r');
    expect(
      sealRowPatch(
        { access_token: patch.access_token, refresh_token: null },
        USER,
        record.public_key
      )
    ).toBeNull();
  });
});
