/**
 * Key derivation for the MarkSyncr vault.
 *
 * The master password is stretched once into a master key, and everything else
 * is derived from that by HKDF with a distinct label. The labels are versioned
 * because they are baked into every existing vault — changing a label string
 * makes every vault in the world undecryptable, so they must never be edited,
 * only superseded.
 */

import { pbkdf2, hkdf, toBase64, KEY_BYTES } from './primitives.js';

/** Supported key derivation functions. */
export const KDF = {
  PBKDF2_SHA256: 'pbkdf2-sha256',
  // Reserved. Argon2id needs WASM in the browser, which means adding
  // 'wasm-unsafe-eval' to the extension CSP. The parameters are carried per-user
  // in vault_meta specifically so this can be adopted later without
  // invalidating a single existing vault.
  ARGON2ID: 'argon2id',
};

/**
 * Default parameters for a vault created today. OWASP's current floor for
 * PBKDF2-HMAC-SHA256 is 600,000 iterations.
 */
export const DEFAULT_KDF_PARAMS = Object.freeze({
  kdf: KDF.PBKDF2_SHA256,
  iterations: 600_000,
});

/**
 * The lowest iteration count a client will accept.
 *
 * KDF parameters arrive from the server, which makes them attacker-controlled if
 * the server is compromised: serving `iterations: 1` would turn every captured
 * auth hash into an offline guessing exercise with no work factor. Refuse to
 * derive at all below this floor rather than silently doing weak work.
 */
export const MIN_PBKDF2_ITERATIONS = 100_000;

/** Domain-separation labels. Append-only — never edit an existing value. */
export const INFO_WRAP = 'marksyncr:vault:wrap:v1';
export const INFO_AUTH = 'marksyncr:vault:auth:v1';
export const INFO_RECOVERY = 'marksyncr:vault:recovery:v1';

/**
 * Validate KDF parameters received from the server.
 * @param {{kdf: string, iterations: number}} params
 * @returns {{kdf: string, iterations: number}}
 */
export function assertUsableKdfParams(params) {
  const kdf = params?.kdf;
  if (kdf !== KDF.PBKDF2_SHA256) {
    throw new Error(`Unsupported KDF: ${kdf ?? 'missing'}`);
  }
  const iterations = params?.iterations;
  if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS) {
    throw new Error(
      `Refusing to derive a key with ${iterations} iterations — the minimum is ${MIN_PBKDF2_ITERATIONS}`
    );
  }
  return { kdf, iterations };
}

/**
 * Stretch the master password into the master key.
 *
 * The master key is never used to encrypt anything directly; it exists only to
 * be split by {@link deriveWrapKey} and {@link deriveAuthHash}.
 *
 * @param {string} password
 * @param {Uint8Array} salt per-user, random, stored alongside the vault
 * @param {{kdf: string, iterations: number}} params
 * @returns {Promise<Uint8Array>} 32 bytes
 */
export async function deriveMasterKey(password, salt, params = DEFAULT_KDF_PARAMS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A master password is required');
  }
  if (!(salt instanceof Uint8Array) || salt.length < 16) {
    throw new Error('KDF salt must be at least 16 bytes');
  }
  const { iterations } = assertUsableKdfParams(params);
  return pbkdf2(password, salt, iterations, KEY_BYTES);
}

/**
 * The key that wraps the user key. Never leaves the device.
 * @param {Uint8Array} masterKey
 * @returns {Promise<Uint8Array>}
 */
export function deriveWrapKey(masterKey) {
  return hkdf(masterKey, INFO_WRAP, KEY_BYTES);
}

/**
 * The only password-derived value that is ever sent to the server, which stores
 * it hashed again. Because it comes out of a different HKDF label than the
 * wrapping key, holding it does not help an attacker decrypt anything.
 * @param {Uint8Array} masterKey
 * @returns {Promise<string>} base64
 */
export async function deriveAuthHash(masterKey) {
  return toBase64(await hkdf(masterKey, INFO_AUTH, KEY_BYTES));
}

/**
 * Derive both halves at once — the common path on unlock.
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {{kdf: string, iterations: number}} params
 * @returns {Promise<{ masterKey: Uint8Array, wrapKey: Uint8Array, authHash: string }>}
 */
export async function deriveAll(password, salt, params = DEFAULT_KDF_PARAMS) {
  const masterKey = await deriveMasterKey(password, salt, params);
  const [wrapKey, authHash] = await Promise.all([
    deriveWrapKey(masterKey),
    deriveAuthHash(masterKey),
  ]);
  return { masterKey, wrapKey, authHash };
}
