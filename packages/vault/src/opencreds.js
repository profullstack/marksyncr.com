/**
 * OpenCreds — the portable vault database.
 *
 * https://logicsrc.com/opencreds
 *
 * A whole vault as one file, so moving between products is a supported
 * operation rather than a plaintext CSV export. Encrypted by default, under a
 * key derived from an *export passphrase* rather than the vault's own user key
 * — a file encrypted under the user key would only open inside the vault it
 * came from, which is the opposite of portable.
 *
 * The header is bound as additional authenticated data over the payload, so the
 * manifest is authenticated by the same tag as the data. That is the difference
 * between an import you can trust and a CSV: a CSV truncated at 3,000 rows
 * imports 3,000 rows and reports success.
 *
 * Nothing here touches the network, and nothing here touches a vault's own key
 * material. It turns a file into plain item objects and back; the caller
 * encrypts them under the vault they belong to.
 */

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  fromBase64,
  KEY_BYTES,
  randomBytes,
  toBase64,
  utf8Decode,
  utf8Encode,
} from './primitives.js';
import { hkdf, pbkdf2 } from './primitives.js';
import { assertGroupsMatchType, ITEM_TYPE } from './items.js';

/** The specification version this module reads and writes. */
export const OPENCREDS_VERSION = '0.1';

/** Conventional extension and media type. */
export const OPENCREDS_EXTENSION = '.opencreds';
export const OPENCREDS_MEDIA_TYPE = 'application/vnd.logicsrc.opencreds+json';

/**
 * This vault's declared namespace.
 *
 * MarkSyncr's vault shipped before OpenCreds, with `marksyncr:vault:*` labels
 * already compiled into the additional authenticated data of every ciphertext
 * it has written. A label cannot be edited — changing one does not migrate a
 * vault, it makes it undecryptable — so the specification carries the prefix as
 * a declared per-vault property, and `marksyncr` is registered.
 */
export const NAMESPACE = 'marksyncr';

/** Namespaces registered by the specification. */
const REGISTERED_NAMESPACES = Object.freeze(['opencreds', 'marksyncr']);
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

/** OWASP's current floor for PBKDF2-HMAC-SHA256, and the lowest we will accept. */
const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const SALT_BYTES = 16;

const GENERATOR = Object.freeze({ name: '@marksyncr/vault', version: '0.1.0' });

const TYPE_NAMES = Object.freeze(Object.keys(ITEM_TYPE));

/**
 * Derive the key a database is encrypted under.
 *
 * PBKDF2 to stretch the passphrase, then HKDF under the database label, so an
 * export key and a vault's wrapping key are computationally independent even
 * when a person reuses the passphrase.
 * @param {string} passphrase
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @param {string} namespace
 * @returns {Promise<Uint8Array>}
 */
async function deriveExportKey(passphrase, salt, iterations, namespace) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new Error('An export passphrase is required');
  }
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
    throw new Error(
      `Refusing to derive a key with ${iterations} iterations — the minimum is ${MIN_ITERATIONS}`
    );
  }
  const master = await pbkdf2(passphrase, salt, iterations, KEY_BYTES);
  return hkdf(master, `${namespace}:database:v1`, KEY_BYTES);
}

/**
 * The bytes bound as additional authenticated data.
 *
 * The key order is fixed by the specification: JSON.stringify preserves
 * insertion order, so a header rebuilt in another order produces different AAD
 * and fails to decrypt on a conforming reader.
 * @param {Object} header
 * @returns {Uint8Array}
 */
function headerAad(header) {
  const ordered = {
    opencreds: header.opencreds,
    type: header.type,
    protected: header.protected,
    namespace: header.namespace,
    exportedAt: header.exportedAt,
    generator: header.generator,
    kdf: header.kdf,
    manifest: header.manifest,
  };
  for (const key of Object.keys(ordered)) {
    if (ordered[key] === undefined) delete ordered[key];
  }
  return utf8Encode(JSON.stringify(ordered));
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

/**
 * Build the manifest for a payload.
 *
 * The digest is over sorted item ids, so a re-ordered payload is detectable —
 * an importer that silently accepted a reordering would also silently accept a
 * substitution.
 * @param {{ folders: Array, items: Array }} payload
 * @returns {Promise<{itemCount: number, types: Object, folderCount: number, digest: string}>}
 */
export async function buildManifest(payload) {
  const types = {};
  for (const item of payload.items) {
    if (!(item.type in ITEM_TYPE)) continue;
    types[item.type] = (types[item.type] ?? 0) + 1;
  }
  const ids = payload.items.map((item) => item.id).sort();
  return {
    itemCount: payload.items.length,
    types,
    folderCount: payload.folders.length,
    digest: toBase64(await sha256(utf8Encode(ids.join('\n')))),
  };
}

/**
 * Compare a claimed manifest against what a payload actually holds.
 *
 * Returns every disagreement rather than the first, because a person looking at
 * a failed import wants to know whether one item went missing or the file is
 * from a different vault entirely.
 * @returns {Promise<string[]>}
 */
export async function verifyManifest(claimed, payload) {
  const actual = await buildManifest(payload);
  const problems = [];
  if (claimed?.itemCount !== actual.itemCount) {
    problems.push(`manifest says ${claimed?.itemCount} items, payload has ${actual.itemCount}`);
  }
  if (claimed?.folderCount !== actual.folderCount) {
    problems.push(`manifest says ${claimed?.folderCount} folders, payload has ${actual.folderCount}`);
  }
  if (claimed?.digest !== actual.digest) {
    problems.push('manifest digest does not match the payload’s item ids');
  }
  for (const type of TYPE_NAMES) {
    const want = claimed?.types?.[type] ?? 0;
    const have = actual.types[type] ?? 0;
    if (want !== have) problems.push(`manifest says ${want} ${type} items, payload has ${have}`);
  }
  return problems;
}

/** True when a parsed document is an OpenCreds database. */
export function isOpenCredsDatabase(value) {
  return Boolean(value) && typeof value === 'object' && value.type === 'opencreds.database';
}

/**
 * Read a database's header without opening it.
 *
 * Enough for a preview — version, namespace, export time, generator and the
 * counts — and, in the encrypted form, authenticated, so none of it can be lied
 * about. Everything else needs the passphrase, which is the point.
 * @param {Object} db
 */
export function readOpenCredsHeader(db) {
  if (!isOpenCredsDatabase(db)) throw new Error('Not an OpenCreds database');
  return {
    opencreds: db.opencreds,
    protected: db.protected !== false,
    namespace: db.namespace,
    exportedAt: db.exportedAt,
    generator: db.generator,
    manifest: db.manifest,
    itemCount: db.manifest?.itemCount ?? 0,
    types: db.manifest?.types ?? {},
    folderCount: db.manifest?.folderCount ?? 0,
  };
}

/**
 * Parse a file's text as an OpenCreds database.
 * @param {string} text
 */
export function parseOpenCredsDatabase(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON — an OpenCreds database is a JSON document, not a CSV');
  }
  if (!isOpenCredsDatabase(parsed)) throw new Error('Not an OpenCreds database');
  return parsed;
}

function assertReadable(db, allowUnregisteredNamespace) {
  if (db.opencreds !== OPENCREDS_VERSION) {
    throw new Error(
      `Unsupported OpenCreds version ${JSON.stringify(db.opencreds)} — this build reads ${OPENCREDS_VERSION}`
    );
  }
  if (typeof db.namespace !== 'string' || !NAMESPACE_PATTERN.test(db.namespace)) {
    throw new Error(`Invalid namespace: ${JSON.stringify(db.namespace)}`);
  }
  // Accepting an arbitrary prefix is accepting an arbitrary derivation.
  if (!allowUnregisteredNamespace && !REGISTERED_NAMESPACES.includes(db.namespace)) {
    throw new Error(
      `Unregistered namespace "${db.namespace}" — registered namespaces are ${REGISTERED_NAMESPACES.join(', ')}`
    );
  }
}

/**
 * Open an OpenCreds database and verify its manifest.
 *
 * Throws on a mismatch, and the caller writes nothing — there is no state in
 * which a conforming implementation reports a complete import of an incomplete
 * file.
 *
 * @param {Object} db a parsed database
 * @param {{ passphrase?: string, key?: Uint8Array, allowUnregisteredNamespace?: boolean }} [options]
 * @returns {Promise<{ folders: Array, items: Array }>}
 */
export async function openOpenCredsDatabase(db, options = {}) {
  if (!isOpenCredsDatabase(db)) throw new Error('Not an OpenCreds database');
  assertReadable(db, options.allowUnregisteredNamespace);

  let payload;

  if (db.protected === false) {
    payload = { folders: db.folders ?? [], items: db.items ?? [] };
  } else {
    let exportKey;
    if (options.key) {
      exportKey = options.key;
    } else if (typeof options.passphrase === 'string') {
      if (!db.kdf) throw new Error('This database was encrypted with a raw key, not a passphrase');
      exportKey = await deriveExportKey(
        options.passphrase,
        fromBase64(db.kdf.salt),
        db.kdf.iterations,
        db.namespace
      );
    } else {
      throw new Error('This database is encrypted; a passphrase is required');
    }

    let plaintext;
    try {
      plaintext = await aesGcmDecrypt(
        exportKey,
        fromBase64(db.iv),
        fromBase64(db.ciphertext),
        headerAad(db)
      );
    } catch {
      // One message for a wrong passphrase and for a tampered header, because
      // the reader cannot tell them apart and guessing would be worse.
      throw new Error('Could not decrypt the database — wrong passphrase, or the file was altered');
    }
    payload = JSON.parse(utf8Decode(plaintext));
  }

  payload.folders ??= [];
  payload.items ??= [];

  const problems = await verifyManifest(db.manifest, payload);
  if (problems.length > 0) {
    throw new Error(`Manifest does not match the payload: ${problems.join('; ')}`);
  }

  for (const item of payload.items) {
    if (!(item.type in ITEM_TYPE)) {
      throw new Error(`Unknown item type in database: ${String(item.type)}`);
    }
    assertGroupsMatchType(item);
  }

  return payload;
}

/**
 * Export a payload as an encrypted OpenCreds database.
 *
 * @param {{ folders: Array, items: Array }} payload
 * @param {{ passphrase?: string, key?: Uint8Array, iterations?: number, exportedAt?: string }} options
 */
export async function exportOpenCredsDatabase(payload, options = {}) {
  if (!options.passphrase && !options.key) {
    throw new Error('An export needs a passphrase or a raw key');
  }
  if (options.passphrase && options.key) {
    throw new Error('Pass a passphrase or a raw key, not both');
  }

  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  let exportKey;
  let kdf;

  if (options.passphrase) {
    const salt = randomBytes(SALT_BYTES);
    exportKey = await deriveExportKey(options.passphrase, salt, iterations, NAMESPACE);
    kdf = { kdf: 'pbkdf2-sha256', iterations, salt: toBase64(salt) };
  } else {
    exportKey = options.key;
    if (exportKey.length !== KEY_BYTES) throw new Error('A raw export key must be 32 bytes');
  }

  const header = {
    opencreds: OPENCREDS_VERSION,
    type: 'opencreds.database',
    protected: true,
    namespace: NAMESPACE,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    generator: { ...GENERATOR },
    ...(kdf ? { kdf } : {}),
    manifest: await buildManifest(payload),
  };

  const { iv, ciphertext } = await aesGcmEncrypt(
    exportKey,
    utf8Encode(JSON.stringify({ folders: payload.folders, items: payload.items })),
    headerAad(header)
  );

  return { ...header, iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/**
 * Export a payload in the plaintext form.
 *
 * Every secret in the vault, in a file, in the clear. It exists because the
 * products people move *to* frequently read nothing else, and an export format
 * that cannot express that gets worked around with a script that is worse — no
 * warning, no file mode, no label.
 *
 * `acknowledged` is not decoration: a caller must state, in code, that it meant
 * this. The UI turns that into a confirmation.
 */
export async function exportPlaintextOpenCredsDatabase(payload, options = {}) {
  if (!options.acknowledged) {
    throw new Error(
      'A plaintext export writes every secret in the vault out unencrypted; pass acknowledged: true to proceed'
    );
  }
  return {
    opencreds: OPENCREDS_VERSION,
    type: 'opencreds.database',
    protected: false,
    namespace: NAMESPACE,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    generator: { ...GENERATOR },
    manifest: await buildManifest(payload),
    folders: payload.folders,
    items: payload.items,
  };
}
