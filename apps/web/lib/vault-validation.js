/**
 * Shape validation for vault payloads.
 *
 * The server cannot inspect what it is storing — that is the point of the
 * feature — so validation here is limited to what is checkable without a key:
 * that ids are ids, that blobs are base64, and that nothing is absurdly large.
 *
 * Lives outside the route files because a Next.js route module may only export
 * handlers and route config; anything else fails the build.
 */

/** A generous ciphertext ceiling: notes are free text, but not unbounded. */
export const MAX_CIPHERTEXT_LENGTH = 64 * 1024;
/** Ceiling for key material and IVs. */
export const MAX_KEY_FIELD_LENGTH = 1024;
/** Largest page of items returned in one request. */
export const MAX_PAGE_SIZE = 1000;
/** How long a deleted item stays recoverable. */
export const TRASH_RETENTION_DAYS = 30;
/**
 * Lowest KDF iteration count the server will store. Mirrors
 * MIN_PBKDF2_ITERATIONS in packages/vault/src/kdf.js — the client enforces this
 * for its own safety, and the server enforces it so one client cannot create a
 * weak vault that every other client then has to open.
 */
export const MIN_KDF_ITERATIONS = 100_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** @param {string} value */
export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Base64 of a plausible length, and nothing else.
 * @param {unknown} value
 * @param {{ required?: boolean, maxLength?: number }} [options]
 */
export function isSaneBlob(value, { required = true, maxLength = MAX_KEY_FIELD_LENGTH } = {}) {
  if (value === undefined || value === null || value === '') return !required;
  return typeof value === 'string' && value.length <= maxLength && BASE64_RE.test(value);
}

/**
 * Validate an item create/update payload.
 * @param {unknown} body
 * @param {{ requireId?: boolean }} [options]
 * @returns {string|null} an error message, or null when the payload is usable
 */
export function validateItemPayload(body, { requireId = true } = {}) {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  if (requireId && !isUuid(body.id)) return 'A valid item id is required';
  // OpenCreds type codes: 1 login, 2 card, 3 identity, 4 note, 5 key, 6 account.
  // Mirrors the vault_items_type_known constraint, so a rejection here and a
  // rejection in the database mean the same thing.
  if (!Number.isInteger(body.type) || body.type < 1 || body.type > 6) return 'Unknown item type';
  if (!isSaneBlob(body.ciphertext, { maxLength: MAX_CIPHERTEXT_LENGTH })) {
    return 'Malformed ciphertext';
  }
  if (!isSaneBlob(body.iv, { maxLength: 64 })) return 'Malformed iv';
  return null;
}

/**
 * Validate the vault key material posted at creation or re-wrap.
 * @param {unknown} body
 * @returns {string|null}
 */
export function validateVaultMeta(body) {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  if (body.kdf !== 'pbkdf2-sha256' && body.kdf !== 'argon2id') return 'Unsupported KDF';
  if (!Number.isInteger(body.iterations) || body.iterations < MIN_KDF_ITERATIONS) {
    return 'KDF iterations below the permitted minimum';
  }
  if (
    !isSaneBlob(body.salt) ||
    !isSaneBlob(body.protectedUserKey) ||
    !isSaneBlob(body.protectedUserKeyIv) ||
    !isSaneBlob(body.authHash) ||
    !isSaneBlob(body.recoveryKeyBlob, { required: false }) ||
    !isSaneBlob(body.recoveryKeyIv, { required: false })
  ) {
    return 'Malformed key material';
  }
  return null;
}
