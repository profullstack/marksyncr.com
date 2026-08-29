/**
 * Importing from other password managers.
 *
 * Two shapes arrive here, and they are not equally good.
 *
 * Most products export CSV, so most of the work is one correct CSV reader plus
 * a column mapping per product. The reader is hand-written rather than pulled
 * from a dependency because this runs inside an extension service worker and
 * inside Next — and because the failure mode of a sloppy parser here is
 * silently importing half of somebody's passwords.
 *
 * The other shape is an OpenCreds database (https://logicsrc.com/opencreds): a
 * whole vault as one encrypted file, with a manifest authenticated by the same
 * tag as the data. Where a CSV truncated at 3,000 rows imports 3,000 rows and
 * reports success, an OpenCreds file that lost an item fails its manifest and
 * imports nothing. It also carries what no CSV has a column for — password
 * history, TOTP seeds, folders, custom fields, URI match rules, and `key` and
 * `account` items.
 *
 * Nothing in this file touches the network. The CSV path touches no crypto at
 * all; the OpenCreds path decrypts the file it was handed and nothing else.
 * Both produce plain item objects, and the caller encrypts them into the vault.
 */

import { createItem } from './items.js';
import {
  isOpenCredsDatabase,
  openOpenCredsDatabase,
  parseOpenCredsDatabase,
  readOpenCredsHeader,
} from './opencreds.js';

/**
 * Parse CSV into rows of cells.
 *
 * Handles quoted fields, escaped quotes (`""`), embedded newlines and commas,
 * and both CRLF and LF line endings — all of which appear in real exports,
 * because notes fields contain everything. A naive `split(',')` mangles any
 * export containing a note with a comma in it, which is most of them.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM — Chrome and Excel both emit one, and it would otherwise
  // become part of the first header name and break every column lookup.
  const input = String(text || '').replace(/^\uFEFF/, '');

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += char;
    i++;
  }

  // Whatever is buffered when the input ends is the last field, unless the file
  // ended with a newline and there is nothing pending.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Turn rows into objects keyed by header name, lowercased and trimmed so
 * column-name casing differences between export versions stop mattering.
 * @param {string[][]} rows
 * @returns {Array<Record<string, string>>}
 */
export function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? '';
    });
    return obj;
  });
}

/** First non-empty value among the given column names. */
function firstOf(row, ...names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/**
 * Supported sources. Each `detect` looks at the header row, so a user can drop
 * in a file without first telling us where it came from.
 */
export const IMPORT_SOURCES = Object.freeze({
  bitwarden: {
    label: 'Bitwarden',
    detect: (headers) => headers.includes('login_uri') || headers.includes('login_password'),
    map: mapBitwardenRow,
  },
  onepassword: {
    label: '1Password',
    detect: (headers) =>
      headers.includes('url') && headers.includes('username') && headers.includes('type'),
    map: mapOnePasswordRow,
  },
  chrome: {
    label: 'Chrome',
    detect: (headers) =>
      headers.includes('url') && headers.includes('username') && headers.includes('password'),
    map: mapChromeRow,
  },
});

/**
 * Identify which product produced an export.
 * @param {string[]} headers lowercased header names
 * @returns {string|null} a key of IMPORT_SOURCES
 */
export function detectSource(headers) {
  // Order matters: Chrome's columns are a subset of 1Password's, so the more
  // specific detector has to be asked first.
  for (const key of ['bitwarden', 'onepassword', 'chrome']) {
    if (IMPORT_SOURCES[key].detect(headers)) return key;
  }
  return null;
}

/** Bitwarden: name, login_uri, login_username, login_password, login_totp, notes, type */
function mapBitwardenRow(row) {
  const type = firstOf(row, 'type').toLowerCase();
  if (type === 'card') {
    return createItem('card', {
      name: firstOf(row, 'name'),
      notes: firstOf(row, 'notes'),
      card: {
        cardholderName: firstOf(row, 'card_cardholdername'),
        brand: firstOf(row, 'card_brand'),
        number: firstOf(row, 'card_number'),
        expMonth: firstOf(row, 'card_expmonth'),
        expYear: firstOf(row, 'card_expyear'),
        code: firstOf(row, 'card_code'),
      },
    });
  }
  if (type === 'identity') {
    return createItem('identity', {
      name: firstOf(row, 'name'),
      notes: firstOf(row, 'notes'),
      identity: {
        firstName: firstOf(row, 'identity_firstname'),
        middleName: firstOf(row, 'identity_middlename'),
        lastName: firstOf(row, 'identity_lastname'),
        company: firstOf(row, 'identity_company'),
        email: firstOf(row, 'identity_email'),
        phone: firstOf(row, 'identity_phone'),
        address1: firstOf(row, 'identity_address1'),
        address2: firstOf(row, 'identity_address2'),
        city: firstOf(row, 'identity_city'),
        state: firstOf(row, 'identity_state'),
        postalCode: firstOf(row, 'identity_postalcode'),
        country: firstOf(row, 'identity_country'),
      },
    });
  }
  if (type === 'note' || type === 'securenote') {
    return createItem('note', {
      name: firstOf(row, 'name'),
      notes: firstOf(row, 'notes'),
    });
  }

  const uri = firstOf(row, 'login_uri', 'uri');
  return createItem('login', {
    name: firstOf(row, 'name') || hostOf(uri),
    notes: firstOf(row, 'notes'),
    login: {
      username: firstOf(row, 'login_username', 'username'),
      password: firstOf(row, 'login_password', 'password'),
      totp: firstOf(row, 'login_totp', 'totp'),
      uris: uri ? [{ uri, match: 'domain' }] : [],
    },
  });
}

/** 1Password: title, url, username, password, otpauth, notes, type */
function mapOnePasswordRow(row) {
  const uri = firstOf(row, 'url', 'website');
  return createItem('login', {
    name: firstOf(row, 'title', 'name') || hostOf(uri),
    notes: firstOf(row, 'notes', 'note'),
    login: {
      username: firstOf(row, 'username'),
      password: firstOf(row, 'password'),
      totp: firstOf(row, 'otpauth', 'totp'),
      uris: uri ? [{ uri, match: 'domain' }] : [],
    },
  });
}

/** Chrome: name, url, username, password, note */
function mapChromeRow(row) {
  const uri = firstOf(row, 'url');
  return createItem('login', {
    name: firstOf(row, 'name') || hostOf(uri),
    notes: firstOf(row, 'note', 'notes'),
    login: {
      username: firstOf(row, 'username'),
      password: firstOf(row, 'password'),
      totp: '',
      uris: uri ? [{ uri, match: 'domain' }] : [],
    },
  });
}

/** Best-effort hostname, used to name an item whose export had no title. */
function hostOf(uri) {
  if (!uri) return '';
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return uri;
  }
}

/**
 * Parse an export into vault items.
 *
 * A row that cannot be mapped is reported rather than dropped — an import that
 * silently loses credentials is worse than one that says what it could not read.
 *
 * @param {string} text the CSV file contents
 * @param {{ source?: string }} [options] force a source instead of detecting
 * @returns {{ source: string|null, items: Object[], skipped: Array<{row: number, reason: string}> }}
 */
export function parseImport(text, { source } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { source: null, items: [], skipped: [{ row: 0, reason: 'No rows found' }] };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const detected = source || detectSource(headers);

  if (!detected || !IMPORT_SOURCES[detected]) {
    return {
      source: null,
      items: [],
      skipped: [{ row: 0, reason: 'Unrecognised export format' }],
    };
  }

  const { map } = IMPORT_SOURCES[detected];
  const objects = rowsToObjects(rows);
  const items = [];
  const skipped = [];

  objects.forEach((row, index) => {
    try {
      const item = map(row);
      // A login with neither a username nor a password carries nothing worth
      // importing, and usually comes from a trailing blank line.
      const isEmptyLogin =
        item.type === 'login' && !item.login.username && !item.login.password && !item.name;
      if (isEmptyLogin) {
        skipped.push({ row: index + 2, reason: 'Empty row' });
        return;
      }
      items.push(item);
    } catch (err) {
      skipped.push({ row: index + 2, reason: err.message });
    }
  });

  return { source: detected, items, skipped };
}

/**
 * Which kind of file this is, without parsing it properly.
 *
 * Cheap enough to run on a dropped file before deciding whether to ask for a
 * passphrase.
 * @param {string} text
 * @returns {'opencreds'|'csv'|'unknown'}
 */
export function detectImportKind(text) {
  // A BOM written as an escape, not as the character: a literal BOM in source
  // is invisible in every editor and reads as a corrupted file to the next
  // person who opens it.
  const trimmed = String(text || '')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return isOpenCredsDatabase(JSON.parse(trimmed)) ? 'opencreds' : 'unknown';
    } catch {
      return 'unknown';
    }
  }
  return trimmed.length > 0 ? 'csv' : 'unknown';
}

/**
 * Inspect an OpenCreds file before importing it.
 *
 * The header is readable without the passphrase, and in the encrypted form it
 * is authenticated — so a preview can show what the file claims to hold and the
 * claim cannot be a lie. Use this to decide whether to prompt.
 * @param {string} text
 */
export function inspectOpenCredsFile(text) {
  return readOpenCredsHeader(parseOpenCredsDatabase(text));
}

/**
 * Import an OpenCreds database.
 *
 * Returns the same shape as {@link parseImport}, plus the folders the file
 * carried and its header. Throws when the passphrase is wrong, the file was
 * altered, or the manifest disagrees with the payload — and in every one of
 * those cases the caller writes nothing.
 *
 * @param {string} text
 * @param {{ passphrase?: string, key?: Uint8Array, allowUnregisteredNamespace?: boolean }} [options]
 * @returns {Promise<{source: 'opencreds', items: Array, folders: Array, skipped: Array, header: Object}>}
 */
export async function parseOpenCredsImport(text, options = {}) {
  const db = parseOpenCredsDatabase(text);
  const header = readOpenCredsHeader(db);
  const payload = await openOpenCredsDatabase(db, options);
  return { source: 'opencreds', items: payload.items, folders: payload.folders, skipped: [], header };
}

/**
 * Import a file of either kind.
 *
 * One entry point, so a caller does not have to know what it was handed. CSV
 * imports carry no folders; OpenCreds imports report no skipped rows, because a
 * file that would have had any fails its manifest instead.
 *
 * @param {string} text
 * @param {{ passphrase?: string, source?: string, key?: Uint8Array }} [options]
 * @returns {Promise<{source: string|null, items: Array, folders: Array, skipped: Array, header?: Object}>}
 */
export async function importFile(text, options = {}) {
  if (detectImportKind(text) === 'opencreds') {
    return parseOpenCredsImport(text, options);
  }
  const parsed = parseImport(text, options.source ? { source: options.source } : {});
  return { ...parsed, folders: [] };
}
