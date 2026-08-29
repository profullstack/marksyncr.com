/**
 * Vault key lifecycle: creation, unlock, recovery and master-password change.
 *
 * The whole design turns on one indirection. Items are encrypted with a random
 * **user key**, and the master password only ever encrypts that one key. So
 * changing the master password re-encrypts 32 bytes instead of every item, and
 * a second wrapped copy under a recovery key gives a way back in without the
 * server learning anything.
 */

import {
  randomBytes,
  aesGcmEncrypt,
  aesGcmDecrypt,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  hkdf,
  KEY_BYTES,
} from './primitives.js';
import {
  DEFAULT_KDF_PARAMS,
  INFO_RECOVERY,
  assertUsableKdfParams,
  deriveAll,
  deriveWrapKey,
} from './kdf.js';

/** Salt length for the master-password KDF. */
export const SALT_BYTES = 32;
/** Recovery key entropy. 160 bits, short enough to write down. */
export const RECOVERY_KEY_BYTES = 20;

/**
 * @typedef {Object} VaultMeta
 * @property {string} kdf
 * @property {number} iterations
 * @property {string} salt                  base64
 * @property {string} protectedUserKey      base64 ciphertext
 * @property {string} protectedUserKeyIv    base64
 * @property {string} authHash              base64, sent to the server
 * @property {string} [recoveryKeyBlob]     base64 ciphertext
 * @property {string} [recoveryKeyIv]       base64
 */

/**
 * Render a recovery key for a human to write down: uppercase hex in groups of
 * five, which survives being read aloud and retyped.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function formatRecoveryKey(bytes) {
  return (toHex(bytes).toUpperCase().match(/.{1,5}/g) || []).join('-');
}

/**
 * Accept a recovery key back in any casing, with or without separators.
 * @param {string} formatted
 * @returns {Uint8Array}
 */
export function parseRecoveryKey(formatted) {
  const bytes = fromHex(String(formatted || ''));
  if (bytes.length !== RECOVERY_KEY_BYTES) {
    throw new Error('That does not look like a recovery key');
  }
  return bytes;
}

/**
 * Wrap the user key under a key-encrypting key.
 * @param {Uint8Array} kek
 * @param {Uint8Array} userKey
 * @returns {Promise<{ blob: string, iv: string }>}
 */
async function wrapUserKey(kek, userKey) {
  const { iv, ciphertext } = await aesGcmEncrypt(kek, userKey);
  return { blob: toBase64(ciphertext), iv: toBase64(iv) };
}

/**
 * Unwrap the user key. Throws when the password (or recovery key) is wrong —
 * GCM authentication fails rather than yielding a wrong-but-plausible key.
 * @param {Uint8Array} kek
 * @param {string} blob base64
 * @param {string} iv base64
 * @returns {Promise<Uint8Array>}
 */
async function unwrapUserKey(kek, blob, iv) {
  try {
    return await aesGcmDecrypt(kek, fromBase64(iv), fromBase64(blob));
  } catch {
    throw new Error('Incorrect password');
  }
}

/**
 * Create a brand-new vault.
 *
 * Everything returned in `meta` is safe to hand to the server. `userKey` and
 * `recoveryKey` are not — the caller holds the first in memory for the session
 * and shows the second to the user exactly once.
 *
 * @param {string} password
 * @param {{ params?: {kdf: string, iterations: number} }} [options]
 * @returns {Promise<{ meta: VaultMeta, userKey: Uint8Array, recoveryKey: string }>}
 */
export async function createVault(password, { params = DEFAULT_KDF_PARAMS } = {}) {
  assertUsableKdfParams(params);

  const salt = randomBytes(SALT_BYTES);
  const { wrapKey, authHash } = await deriveAll(password, salt, params);

  // The one key that actually encrypts items. Random, never derived from the
  // password, so the password can change without touching a single item.
  const userKey = randomBytes(KEY_BYTES);

  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES);
  const recoveryKek = await hkdf(recoveryBytes, INFO_RECOVERY, KEY_BYTES);

  const [wrapped, recoveryWrapped] = await Promise.all([
    wrapUserKey(wrapKey, userKey),
    wrapUserKey(recoveryKek, userKey),
  ]);

  return {
    meta: {
      kdf: params.kdf,
      iterations: params.iterations,
      salt: toBase64(salt),
      protectedUserKey: wrapped.blob,
      protectedUserKeyIv: wrapped.iv,
      authHash,
      recoveryKeyBlob: recoveryWrapped.blob,
      recoveryKeyIv: recoveryWrapped.iv,
    },
    userKey,
    recoveryKey: formatRecoveryKey(recoveryBytes),
  };
}

/**
 * Unlock an existing vault.
 * @param {string} password
 * @param {VaultMeta} meta as returned by the server
 * @returns {Promise<{ userKey: Uint8Array, authHash: string }>}
 */
export async function unlockVault(password, meta) {
  // Validates the server-supplied KDF parameters before doing any work with
  // them — see MIN_PBKDF2_ITERATIONS for why that matters.
  const params = assertUsableKdfParams(meta);
  const salt = fromBase64(meta.salt);
  const { wrapKey, authHash } = await deriveAll(password, salt, params);
  const userKey = await unwrapUserKey(wrapKey, meta.protectedUserKey, meta.protectedUserKeyIv);
  return { userKey, authHash };
}

/**
 * Unlock with the recovery key, for a forgotten master password.
 * @param {string} recoveryKey as shown to the user at setup
 * @param {VaultMeta} meta
 * @returns {Promise<{ userKey: Uint8Array }>}
 */
export async function unlockWithRecoveryKey(recoveryKey, meta) {
  if (!meta?.recoveryKeyBlob || !meta?.recoveryKeyIv) {
    throw new Error('This vault has no recovery key');
  }
  const recoveryBytes = parseRecoveryKey(recoveryKey);
  const recoveryKek = await hkdf(recoveryBytes, INFO_RECOVERY, KEY_BYTES);
  try {
    const userKey = await aesGcmDecrypt(
      recoveryKek,
      fromBase64(meta.recoveryKeyIv),
      fromBase64(meta.recoveryKeyBlob)
    );
    return { userKey };
  } catch {
    throw new Error('Incorrect recovery key');
  }
}

/**
 * Change the master password.
 *
 * Re-wraps the same user key under a key derived from the new password, so no
 * item is touched and nothing needs re-uploading. A fresh salt is generated,
 * and the KDF parameters are upgraded to current defaults on the way through —
 * which is how a vault created under weaker parameters gets stronger.
 *
 * @param {Uint8Array} userKey the unlocked key, from unlockVault
 * @param {string} newPassword
 * @param {VaultMeta} meta the existing metadata (recovery blob is preserved)
 * @param {{ params?: {kdf: string, iterations: number} }} [options]
 * @returns {Promise<{ meta: VaultMeta }>}
 */
export async function rewrapUserKey(userKey, newPassword, meta, { params = DEFAULT_KDF_PARAMS } = {}) {
  assertUsableKdfParams(params);
  if (!(userKey instanceof Uint8Array) || userKey.length !== KEY_BYTES) {
    throw new Error('A valid unlocked user key is required');
  }

  const salt = randomBytes(SALT_BYTES);
  const { wrapKey, authHash } = await deriveAll(newPassword, salt, params);
  const wrapped = await wrapUserKey(wrapKey, userKey);

  return {
    meta: {
      ...meta,
      kdf: params.kdf,
      iterations: params.iterations,
      salt: toBase64(salt),
      protectedUserKey: wrapped.blob,
      protectedUserKeyIv: wrapped.iv,
      authHash,
    },
  };
}

/**
 * Issue a new recovery key, invalidating the previous one.
 * @param {Uint8Array} userKey
 * @param {VaultMeta} meta
 * @returns {Promise<{ meta: VaultMeta, recoveryKey: string }>}
 */
export async function resetRecoveryKey(userKey, meta) {
  const recoveryBytes = randomBytes(RECOVERY_KEY_BYTES);
  const recoveryKek = await hkdf(recoveryBytes, INFO_RECOVERY, KEY_BYTES);
  const wrapped = await wrapUserKey(recoveryKek, userKey);
  return {
    meta: { ...meta, recoveryKeyBlob: wrapped.blob, recoveryKeyIv: wrapped.iv },
    recoveryKey: formatRecoveryKey(recoveryBytes),
  };
}

/** Re-export so callers need only this module for the wrap key. */
export { deriveWrapKey };
