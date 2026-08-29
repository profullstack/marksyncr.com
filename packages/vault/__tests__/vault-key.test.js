/**
 * Tests for the vault key lifecycle — creation, unlock, recovery, password
 * change — and for the properties the whole design rests on.
 * @module __tests__/vault-key.test
 */

import { describe, it, expect } from 'vitest';
import {
  createVault,
  unlockVault,
  unlockWithRecoveryKey,
  rewrapUserKey,
  resetRecoveryKey,
  formatRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_BYTES,
  SALT_BYTES,
} from '../src/vault-key.js';
import { toHex, randomBytes, fromBase64 } from '../src/primitives.js';
import { DEFAULT_KDF_PARAMS, MIN_PBKDF2_ITERATIONS, KDF } from '../src/kdf.js';

// A weak-but-legal KDF setting keeps these tests fast. 600k iterations is the
// shipping default; running it in every test would add minutes.
const FAST = { kdf: KDF.PBKDF2_SHA256, iterations: MIN_PBKDF2_ITERATIONS };
const PASSWORD = 'correct horse battery staple';

describe('createVault', () => {
  it('returns metadata that is safe to send, and keys that are not', async () => {
    const { meta, userKey, recoveryKey } = await createVault(PASSWORD, { params: FAST });

    expect(meta.kdf).toBe(KDF.PBKDF2_SHA256);
    expect(meta.iterations).toBe(FAST.iterations);
    expect(fromBase64(meta.salt)).toHaveLength(SALT_BYTES);
    expect(meta.protectedUserKey).toBeTruthy();
    expect(meta.authHash).toBeTruthy();
    expect(userKey).toHaveLength(32);
    expect(recoveryKey).toMatch(/^[0-9A-F-]+$/);
  });

  it('never puts the password, or the user key, in the metadata', async () => {
    const { meta, userKey } = await createVault(PASSWORD, { params: FAST });
    const serialized = JSON.stringify(meta);

    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(toHex(userKey));
  });

  it('gives two vaults with the same password different keys and salts', async () => {
    const a = await createVault(PASSWORD, { params: FAST });
    const b = await createVault(PASSWORD, { params: FAST });

    expect(a.meta.salt).not.toBe(b.meta.salt);
    expect(a.meta.authHash).not.toBe(b.meta.authHash);
    expect(toHex(a.userKey)).not.toBe(toHex(b.userKey));
  });

  it('refuses an empty password', async () => {
    await expect(createVault('', { params: FAST })).rejects.toThrow(/master password is required/);
  });
});

describe('unlockVault', () => {
  it('recovers exactly the same user key', async () => {
    const { meta, userKey } = await createVault(PASSWORD, { params: FAST });
    const unlocked = await unlockVault(PASSWORD, meta);
    expect(toHex(unlocked.userKey)).toBe(toHex(userKey));
  });

  it('produces the same auth hash the server was given', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    const unlocked = await unlockVault(PASSWORD, meta);
    expect(unlocked.authHash).toBe(meta.authHash);
  });

  it('rejects the wrong password without leaking why', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    await expect(unlockVault('wrong password', meta)).rejects.toThrow('Incorrect password');
  });

  it('rejects a tampered wrapped key', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    const bytes = fromBase64(meta.protectedUserKey);
    bytes[0] ^= 0xff;
    const tampered = { ...meta, protectedUserKey: btoa(String.fromCharCode(...bytes)) };
    await expect(unlockVault(PASSWORD, tampered)).rejects.toThrow('Incorrect password');
  });
});

describe('KDF downgrade defence', () => {
  it('refuses metadata that asks for a trivial iteration count', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    // A compromised server serving iterations: 1 would make every captured auth
    // hash cheap to attack offline.
    const downgraded = { ...meta, iterations: 1 };
    await expect(unlockVault(PASSWORD, downgraded)).rejects.toThrow(/minimum is/);
  });

  it('refuses an unknown KDF rather than guessing', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    await expect(unlockVault(PASSWORD, { ...meta, kdf: 'md5-lol' })).rejects.toThrow(
      /Unsupported KDF/
    );
  });

  it('refuses to create a vault with weak parameters in the first place', async () => {
    await expect(
      createVault(PASSWORD, { params: { kdf: KDF.PBKDF2_SHA256, iterations: 10 } })
    ).rejects.toThrow(/minimum is/);
  });

  it('the shipping default is at or above the OWASP floor', () => {
    expect(DEFAULT_KDF_PARAMS.iterations).toBeGreaterThanOrEqual(600_000);
  });
});

describe('recovery key', () => {
  it('unlocks the vault when the password is forgotten', async () => {
    const { meta, userKey, recoveryKey } = await createVault(PASSWORD, { params: FAST });
    const recovered = await unlockWithRecoveryKey(recoveryKey, meta);
    expect(toHex(recovered.userKey)).toBe(toHex(userKey));
  });

  it('accepts the key back in any casing, with or without dashes', async () => {
    const { meta, userKey, recoveryKey } = await createVault(PASSWORD, { params: FAST });
    const messy = recoveryKey.toLowerCase().replace(/-/g, ' ');
    const recovered = await unlockWithRecoveryKey(messy, meta);
    expect(toHex(recovered.userKey)).toBe(toHex(userKey));
  });

  it('rejects a wrong recovery key', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    const wrong = formatRecoveryKey(randomBytes(RECOVERY_KEY_BYTES));
    await expect(unlockWithRecoveryKey(wrong, meta)).rejects.toThrow('Incorrect recovery key');
  });

  it('rejects something that is not a recovery key at all', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    await expect(unlockWithRecoveryKey('hunter2', meta)).rejects.toThrow(/does not look like/);
  });

  it('round-trips through its written-down form', () => {
    const bytes = randomBytes(RECOVERY_KEY_BYTES);
    expect(toHex(parseRecoveryKey(formatRecoveryKey(bytes)))).toBe(toHex(bytes));
  });

  it('resetting it invalidates the old one and keeps the same vault', async () => {
    const { meta, userKey, recoveryKey } = await createVault(PASSWORD, { params: FAST });
    const reset = await resetRecoveryKey(userKey, meta);

    expect(toHex((await unlockWithRecoveryKey(reset.recoveryKey, reset.meta)).userKey)).toBe(
      toHex(userKey)
    );
    await expect(unlockWithRecoveryKey(recoveryKey, reset.meta)).rejects.toThrow(
      'Incorrect recovery key'
    );
  });
});

describe('changing the master password', () => {
  it('keeps the same user key, so no item needs re-encrypting', async () => {
    const { meta, userKey } = await createVault(PASSWORD, { params: FAST });
    const { meta: next } = await rewrapUserKey(userKey, 'a brand new password', meta, {
      params: FAST,
    });

    const unlocked = await unlockVault('a brand new password', next);
    expect(toHex(unlocked.userKey)).toBe(toHex(userKey));
  });

  it('stops the old password working', async () => {
    const { meta, userKey } = await createVault(PASSWORD, { params: FAST });
    const { meta: next } = await rewrapUserKey(userKey, 'a brand new password', meta, {
      params: FAST,
    });
    await expect(unlockVault(PASSWORD, next)).rejects.toThrow('Incorrect password');
  });

  it('issues a fresh salt and auth hash', async () => {
    const { meta, userKey } = await createVault(PASSWORD, { params: FAST });
    const { meta: next } = await rewrapUserKey(userKey, 'another password', meta, { params: FAST });

    expect(next.salt).not.toBe(meta.salt);
    expect(next.authHash).not.toBe(meta.authHash);
  });

  it('preserves the recovery key, which still opens the vault', async () => {
    const { meta, userKey, recoveryKey } = await createVault(PASSWORD, { params: FAST });
    const { meta: next } = await rewrapUserKey(userKey, 'another password', meta, { params: FAST });

    const recovered = await unlockWithRecoveryKey(recoveryKey, next);
    expect(toHex(recovered.userKey)).toBe(toHex(userKey));
  });

  it('upgrades the KDF parameters on the way through', async () => {
    const { meta, userKey } = await createVault(PASSWORD, { params: FAST });
    expect(meta.iterations).toBe(FAST.iterations);

    // No params argument means "current defaults" — how a vault created under
    // weaker settings gets stronger without anyone migrating data.
    const { meta: next } = await rewrapUserKey(userKey, PASSWORD, meta);
    expect(next.iterations).toBe(DEFAULT_KDF_PARAMS.iterations);
  }, 30_000);

  it('refuses a user key that is not a real key', async () => {
    const { meta } = await createVault(PASSWORD, { params: FAST });
    await expect(rewrapUserKey(randomBytes(16), 'x', meta, { params: FAST })).rejects.toThrow(
      /valid unlocked user key/
    );
  });
});
