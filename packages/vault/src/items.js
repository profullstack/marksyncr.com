/**
 * Vault items: the record format, and encrypting it under the user key.
 *
 * Logins, cards and identities are not three features — they are one record
 * with a `type` and three field groups. Everything the user typed lives inside
 * a single encrypted blob, which is what makes password history free: it is an
 * array in that blob, so it is encrypted by construction rather than needing
 * its own protected table.
 */

import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  toBase64,
  fromBase64,
  utf8Encode,
  utf8Decode,
} from './primitives.js';

/**
 * Stored in the `type` column in plaintext so the server can filter and
 * paginate without decrypting. This is deliberate, and it is the metadata the
 * design accepts leaking: the server learns you hold 40 logins and 2 cards,
 * never which sites or what values.
 */
export const ITEM_TYPE = Object.freeze({
  login: 1,
  card: 2,
  identity: 3,
  note: 4,
});

/** Reverse lookup, for turning a stored row back into a name. */
export const ITEM_TYPE_NAME = Object.freeze(
  Object.fromEntries(Object.entries(ITEM_TYPE).map(([name, id]) => [id, name]))
);

/**
 * Version stamped into every blob. A record you cannot identify is a record you
 * cannot migrate, so this is written from the first commit rather than added
 * when it is first needed.
 */
export const ITEM_SCHEMA_VERSION = 1;

/**
 * Password history cap. The blob is rewritten on every save, so an uncapped
 * array grows the ciphertext without bound.
 */
export const MAX_HISTORY_ENTRIES = 20;

/** Empty field groups, so every item has a predictable shape. */
const EMPTY_FIELDS = Object.freeze({
  login: () => ({ username: '', password: '', totp: '', uris: [] }),
  card: () => ({ cardholderName: '', brand: '', number: '', expMonth: '', expYear: '', code: '' }),
  identity: () => ({
    title: '',
    firstName: '',
    middleName: '',
    lastName: '',
    company: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  }),
  note: () => ({}),
});

/**
 * Create a new item.
 *
 * The id is generated here, on the client, because it is bound into the
 * ciphertext as additional authenticated data — see {@link encryptItem}. The
 * server stores this id rather than assigning one.
 *
 * @param {keyof ITEM_TYPE} type
 * @param {Object} [fields] partial item to merge over the defaults
 * @returns {Object} a plaintext item
 */
export function createItem(type, fields = {}) {
  if (!(type in ITEM_TYPE)) {
    throw new Error(`Unknown item type: ${type}`);
  }
  const now = new Date().toISOString();
  return {
    v: ITEM_SCHEMA_VERSION,
    id: globalThis.crypto.randomUUID(),
    type,
    name: '',
    favorite: false,
    folderId: null,
    notes: '',
    [type]: { ...EMPTY_FIELDS[type](), ...(fields[type] || {}) },
    history: [],
    createdAt: now,
    updatedAt: now,
    ...stripGroups(fields),
  };
}

/** Copy the top-level fields of a partial item, minus the per-type groups. */
function stripGroups(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key in ITEM_TYPE || key === 'v' || key === 'id') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Record a password change in the item's own history.
 *
 * Called before overwriting the password, so the value being replaced is what
 * gets kept. Returns a new item; does not mutate.
 *
 * @param {Object} item
 * @param {string} newPassword
 * @returns {Object}
 */
export function recordPasswordChange(item, newPassword) {
  if (item.type !== 'login') {
    throw new Error('Only logins have password history');
  }
  const previous = item.login?.password || '';
  const history =
    previous && previous !== newPassword
      ? [{ password: previous, changedAt: new Date().toISOString() }, ...(item.history || [])]
      : [...(item.history || [])];

  return {
    ...item,
    login: { ...item.login, password: newPassword },
    history: history.slice(0, MAX_HISTORY_ENTRIES),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The additional authenticated data bound to an item's ciphertext.
 *
 * Binding the id means a ciphertext cannot be moved from one row to another
 * without decryption failing — without it, anyone with database write access
 * could swap the ciphertext of a low-value login into a high-value one and
 * watch what the user does next.
 * @param {string} id
 * @param {number} version
 */
function itemAad(id, version) {
  return utf8Encode(`marksyncr:vault:item:${version}:${id}`);
}

/**
 * Encrypt an item for storage.
 * @param {Uint8Array} userKey
 * @param {Object} item
 * @returns {Promise<{ id: string, type: number, ciphertext: string, iv: string }>}
 */
export async function encryptItem(userKey, item) {
  if (!item?.id) throw new Error('An item must have an id before it can be encrypted');
  if (!(item.type in ITEM_TYPE)) throw new Error(`Unknown item type: ${item.type}`);

  const version = item.v ?? ITEM_SCHEMA_VERSION;
  const plaintext = utf8Encode(JSON.stringify({ ...item, v: version }));
  const { iv, ciphertext } = await aesGcmEncrypt(userKey, plaintext, itemAad(item.id, version));

  return {
    id: item.id,
    type: ITEM_TYPE[item.type],
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
  };
}

/**
 * Decrypt a stored row back into an item.
 *
 * Throws when the key is wrong, the ciphertext was altered, or the row's id
 * does not match the one bound at encryption time.
 *
 * @param {Uint8Array} userKey
 * @param {{ id: string, ciphertext: string, iv: string, v?: number }} row
 * @returns {Promise<Object>}
 */
export async function decryptItem(userKey, row) {
  const version = row.v ?? ITEM_SCHEMA_VERSION;
  let plaintext;
  try {
    plaintext = await aesGcmDecrypt(
      userKey,
      fromBase64(row.iv),
      fromBase64(row.ciphertext),
      itemAad(row.id, version)
    );
  } catch {
    throw new Error(`Could not decrypt item ${row.id}`);
  }

  const item = JSON.parse(utf8Decode(plaintext));
  if (item.id !== row.id) {
    // Belt and braces: the AAD already makes this unreachable.
    throw new Error(`Item id mismatch for ${row.id}`);
  }
  return item;
}

/**
 * Decrypt a page of rows, keeping going when one fails.
 *
 * A single corrupt row must not hide the rest of someone's vault, so failures
 * are collected and returned rather than thrown.
 * @param {Uint8Array} userKey
 * @param {Array<Object>} rows
 * @returns {Promise<{ items: Object[], failed: Array<{id: string, error: string}> }>}
 */
export async function decryptItems(userKey, rows) {
  const items = [];
  const failed = [];
  for (const row of rows) {
    try {
      items.push(await decryptItem(userKey, row));
    } catch (err) {
      failed.push({ id: row.id, error: err.message });
    }
  }
  return { items, failed };
}
