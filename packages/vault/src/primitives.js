/**
 * Cryptographic primitives for the MarkSyncr vault.
 *
 * Deliberately thin wrappers over WebCrypto and nothing else. Every function
 * here is a named algorithm with published test vectors, so the whole file can
 * be checked against those vectors rather than reasoned about. Nothing in the
 * vault may implement a construction that is not in this file.
 *
 * Runs unmodified in the extension service worker, the browser page and Node 18+,
 * all of which expose `globalThis.crypto.subtle`.
 */

/** @returns {SubtleCrypto} */
function subtle() {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('WebCrypto is unavailable — the vault cannot operate without it');
  }
  return c.subtle;
}

/** AES-GCM initialisation vector length, in bytes. 96 bits is the spec-recommended size. */
export const IV_BYTES = 12;
/** Symmetric key length, in bytes. */
export const KEY_BYTES = 32;

/**
 * Cryptographically secure random bytes.
 * @param {number} length
 * @returns {Uint8Array}
 */
export function randomBytes(length) {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** @param {string} text @returns {Uint8Array} */
export function utf8Encode(text) {
  return encoder.encode(text);
}

/** @param {Uint8Array} bytes @returns {string} */
export function utf8Decode(bytes) {
  return decoder.decode(bytes);
}

/**
 * Base64 encode. Used for every value that crosses the wire or lands in a
 * text column — the API speaks JSON, so raw bytes need an encoding.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function fromBase64(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** @param {Uint8Array} bytes @returns {string} lowercase hex */
export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** @param {string} hex @returns {Uint8Array} */
export function fromHex(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) throw new Error('Hex string must have an even length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

/**
 * Compare two byte arrays without leaking their contents through timing.
 *
 * A plain `===` on hex strings short-circuits at the first differing byte, which
 * tells an attacker who can time the comparison how much of their guess was
 * right. Always use this for anything secret-derived.
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * PBKDF2-HMAC-SHA256.
 *
 * This is the slow step that stands between a stolen database and a user's
 * vault, so the iteration count is a security parameter, not a tuning knob.
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @param {number} lengthBytes
 * @returns {Promise<Uint8Array>}
 */
export async function pbkdf2(password, salt, iterations, lengthBytes = KEY_BYTES) {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('PBKDF2 iterations must be a positive integer');
  }
  const keyMaterial = await subtle().importKey('raw', utf8Encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    lengthBytes * 8
  );
  return new Uint8Array(bits);
}

/**
 * HKDF-SHA256 expand. Splits one high-entropy key into several independent
 * keys, one per `info` label — so the wrapping key and the auth hash cannot be
 * derived from one another.
 * @param {Uint8Array} ikm  input key material (already high-entropy)
 * @param {string|Uint8Array} info  domain separation label. Accepts raw bytes as
 *   well as a string so published test vectors, whose info fields are not valid
 *   UTF-8, can be checked through this same function rather than a special case.
 * @param {number} lengthBytes
 * @param {Uint8Array} [salt]
 * @returns {Promise<Uint8Array>}
 */
export async function hkdf(ikm, info, lengthBytes = KEY_BYTES, salt = new Uint8Array(0)) {
  const infoBytes = info instanceof Uint8Array ? info : utf8Encode(info);
  const keyMaterial = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: infoBytes },
    keyMaterial,
    lengthBytes * 8
  );
  return new Uint8Array(bits);
}

/**
 * Import raw bytes as an AES-GCM key.
 * @param {Uint8Array} raw
 * @param {KeyUsage[]} usages
 */
async function importAesKey(raw, usages) {
  if (raw.length !== KEY_BYTES) {
    throw new Error(`AES key must be ${KEY_BYTES} bytes, got ${raw.length}`);
  }
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, usages);
}

/**
 * AES-256-GCM encrypt with a fresh random IV.
 *
 * GCM is authenticated, so there is no separate MAC key to manage and a
 * tampered ciphertext fails to decrypt rather than returning garbage. The IV is
 * generated here and never accepted from a caller — reusing an IV under the same
 * key destroys the security of the mode entirely.
 *
 * @param {Uint8Array} key 32 bytes
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} [aad] additional authenticated data — bound to the
 *   ciphertext but not encrypted. Use it to tie a ciphertext to its row, so a
 *   server cannot move ciphertexts between records undetected.
 * @returns {Promise<{ iv: Uint8Array, ciphertext: Uint8Array }>}
 */
export async function aesGcmEncrypt(key, plaintext, aad) {
  const cryptoKey = await importAesKey(key, ['encrypt']);
  const iv = randomBytes(IV_BYTES);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  const ciphertext = await subtle().encrypt(params, cryptoKey, plaintext);
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/**
 * AES-256-GCM decrypt. Throws when the key is wrong, the ciphertext was
 * altered, or the AAD does not match what was bound at encryption time.
 * @param {Uint8Array} key
 * @param {Uint8Array} iv
 * @param {Uint8Array} ciphertext
 * @param {Uint8Array} [aad]
 * @returns {Promise<Uint8Array>}
 */
export async function aesGcmDecrypt(key, iv, ciphertext, aad) {
  const cryptoKey = await importAesKey(key, ['decrypt']);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = aad;
  const plaintext = await subtle().decrypt(params, cryptoKey, ciphertext);
  return new Uint8Array(plaintext);
}
