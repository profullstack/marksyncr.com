/**
 * Bitwarden JSON import.
 *
 * Bitwarden's export button gives JSON by default, and JSON is the only one of
 * its formats that keeps TOTP seeds, password history, URI match rules and the
 * whole of a card or identity. Its CSV drops all of that, so "export as CSV
 * instead" is a lossy workaround rather than an answer.
 *
 * Until this existed, `detectImportKind` sent every JSON file to the OpenCreds
 * reader, so a Bitwarden export came back as "neither an OpenCreds database nor
 * a CSV export" and there was nothing a person could do about it in the UI.
 */
import { createItem, MAX_HISTORY_ENTRIES } from './items.js';

/** Bitwarden's numeric item types. */
const BW_TYPE = Object.freeze({ LOGIN: 1, NOTE: 2, CARD: 3, IDENTITY: 4 });

/** Bitwarden's numeric URI match rules. null means domain, its own default. */
const BW_URI_MATCH = Object.freeze({
  0: 'domain',
  1: 'host',
  2: 'startsWith',
  3: 'exact',
  4: 'regex',
  5: 'never',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Does this parsed JSON look like a Bitwarden export?
 *
 * Narrow on purpose: an `items` array plus either a `folders` array or the
 * `encrypted` flag. An OpenCreds database has neither at its top level, so the
 * two can never be taken for one another.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBitwardenExport(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value.items)) return false;
  return Array.isArray(value.folders) || typeof value.encrypted === 'boolean';
}

function str(value) {
  if (typeof value === 'string') return value;
  return value === null || value === undefined ? '' : String(value);
}

/** Best-effort hostname, to name a login whose export had no title. */
function hostOf(uri) {
  if (!uri) return '';
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return uri;
  }
}

function bitwardenUris(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry) out.push({ uri: entry, match: 'domain' });
      continue;
    }
    const uri = str(entry?.uri);
    if (!uri) continue;
    // Flattening every rule to "domain" would quietly widen a login pinned to
    // an exact URL, which is a security change rather than a cosmetic one.
    const raw_match = entry?.match;
    const match =
      raw_match === null || raw_match === undefined
        ? 'domain'
        : BW_URI_MATCH[Number(raw_match)] || 'domain';
    out.push({ uri, match });
  }
  return out;
}

/** Bitwarden's password history, newest first, capped at the schema's limit. */
function bitwardenHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const password = str(entry?.password);
    if (!password) continue;
    out.push({ password, changedAt: str(entry?.lastUsedDate) });
  }
  out.sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : 0));
  return out.slice(0, MAX_HISTORY_ENTRIES);
}

/**
 * Read a Bitwarden JSON export.
 *
 * An encrypted export is refused rather than half-read: its items are opaque
 * strings, so a best-effort parse would store ciphertext as if it were a
 * password and leave a vault full of entries that never decrypt.
 *
 * Folders are deliberately not carried. The import message sends items only, so
 * a folderId here would point at a folder that was never created.
 *
 * @param {string} text
 * @returns {{ source: string|null, items: Array, folders: Array, skipped: Array<{row: number, reason: string}> }}
 */
export function parseBitwardenJson(text) {
  let parsed;
  try {
    // A BOM written as an escape, not as the character, to match the rest of
    // this package: a literal BOM is invisible in every editor and reads as a
    // corrupted file to the next person who opens it.
    parsed = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
  } catch {
    return { source: null, items: [], folders: [], skipped: [{ row: 0, reason: 'Not valid JSON' }] };
  }

  if (!isBitwardenExport(parsed)) {
    return {
      source: null,
      items: [],
      folders: [],
      skipped: [{ row: 0, reason: 'Not a Bitwarden export' }],
    };
  }

  if (parsed.encrypted === true) {
    return {
      source: 'bitwarden',
      items: [],
      folders: [],
      skipped: [
        {
          row: 0,
          reason:
            'This export is encrypted. Export again from Bitwarden with encryption turned off.',
        },
      ],
    };
  }

  const items = [];
  const skipped = [];

  parsed.items.forEach((raw, index) => {
    const row = index + 1;
    if (!raw || typeof raw !== 'object') {
      skipped.push({ row, reason: 'Not an object' });
      return;
    }

    // Bitwarden ids are already UUIDs, so keeping them makes a re-import
    // idempotent: the same file twice reports its items as already present
    // rather than duplicating the vault. createItem mints its own id and drops
    // any passed in, so it is applied after construction.
    const id = str(raw.id);
    // creationDate/revisionDate are the only record of when a password was
    // rotated. Restamping them to "now" on import destroys that permanently.
    const createdAt = str(raw.creationDate);
    const updatedAt = str(raw.revisionDate);

    const common = {
      name: str(raw.name),
      notes: str(raw.notes),
      favorite: raw.favorite === true,
      folderId: null,
    };
    if (createdAt) common.createdAt = createdAt;
    if (updatedAt) common.updatedAt = updatedAt;

    const type = Number(raw.type);
    try {
      let item;

      if (type === BW_TYPE.CARD) {
        const card = raw.card || {};
        item = createItem('card', {
          ...common,
          card: {
            cardholderName: str(card.cardholderName),
            brand: str(card.brand),
            number: str(card.number),
            expMonth: str(card.expMonth),
            expYear: str(card.expYear),
            code: str(card.code),
          },
        });
      } else if (type === BW_TYPE.IDENTITY) {
        const identity = raw.identity || {};
        item = createItem('identity', {
          ...common,
          identity: {
            title: str(identity.title),
            firstName: str(identity.firstName),
            middleName: str(identity.middleName),
            lastName: str(identity.lastName),
            username: str(identity.username),
            company: str(identity.company),
            email: str(identity.email),
            phone: str(identity.phone),
            address1: str(identity.address1),
            address2: str(identity.address2),
            address3: str(identity.address3),
            city: str(identity.city),
            state: str(identity.state),
            postalCode: str(identity.postalCode),
            country: str(identity.country),
            ssn: str(identity.ssn),
            passportNumber: str(identity.passportNumber),
            licenseNumber: str(identity.licenseNumber),
          },
        });
      } else if (type === BW_TYPE.NOTE) {
        item = createItem('note', common);
      } else if (type === BW_TYPE.LOGIN) {
        const login = raw.login || {};
        const uris = bitwardenUris(login.uris);
        const history = bitwardenHistory(raw.passwordHistory);
        item = createItem('login', {
          ...common,
          name: common.name || hostOf(uris[0]?.uri || ''),
          ...(history.length > 0 ? { history } : {}),
          login: {
            username: str(login.username),
            password: str(login.password),
            totp: str(login.totp),
            uris,
          },
        });
      } else {
        skipped.push({ row, reason: `Unknown Bitwarden item type ${str(raw.type)}` });
        return;
      }

      if (UUID_RE.test(id)) item.id = id;
      items.push(item);
    } catch (err) {
      skipped.push({ row, reason: err.message });
    }
  });

  return { source: 'bitwarden', items, folders: [], skipped };
}
