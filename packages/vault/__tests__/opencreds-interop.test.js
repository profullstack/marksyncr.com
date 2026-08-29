/**
 * Cross-implementation interoperability, against the OpenCreds reference
 * implementation.
 *
 * The whole claim of the specification is that a vault exported from one
 * conforming implementation imports into another with the item records
 * unchanged. A round trip within one implementation proves nothing about that —
 * it only proves this code agrees with itself — so these tests drive
 * `@marksyncr/vault` against `@logicsrc/opencreds` in both directions.
 *
 * The reference implementation is not a dependency of this repo, and should not
 * become one: MarkSyncr ships a vault, not a standards toolkit. So the suite
 * resolves it at runtime and skips itself when it is absent, rather than turning
 * CI red on a machine that simply does not have it. Point OPENCREDS_REF at a
 * built checkout to run it.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { createItem } from '../src/items.js';
import { decryptItems, encryptItem } from '../src/items.js';
import { randomBytes } from '../src/primitives.js';
import {
  exportOpenCredsDatabase,
  exportPlaintextOpenCredsDatabase,
} from '../src/opencreds.js';
import { detectImportKind, inspectOpenCredsFile, parseOpenCredsImport } from '../src/import.js';

const PASSPHRASE = 'opencreds-fixture';
// The construction is under test, not the work factor.
const FAST = { kdf: 'pbkdf2-sha256', iterations: 100_000 };

/** The reference implementation, or null when it is not installed. */
let ref = null;

beforeAll(async () => {
  const candidates = [
    process.env.OPENCREDS_REF,
    '@logicsrc/opencreds',
  ].filter(Boolean);

  for (const specifier of candidates) {
    try {
      ref = await import(specifier);
      return;
    } catch {
      /* try the next one */
    }
  }
});

/** One item of every type, so no field group goes unexercised. */
function payloadFrom(impl) {
  const folder = { id: '11111111-1111-4111-8111-111111111111', name: 'Work' };
  return {
    folders: [folder],
    items: [
      impl.createItem('login', {
        name: 'GitHub',
        folderId: folder.id,
        login: {
          username: 'anthony',
          password: 'hunter2',
          totp: 'otpauth://totp/GitHub:anthony?secret=JBSWY3DPEHPK3PXP',
          uris: [{ uri: 'https://github.com', match: 'domain' }],
        },
        history: [{ password: 'hunter1', changedAt: '2026-01-04T09:12:00.000Z' }],
      }),
      impl.createItem('card', {
        name: 'Visa',
        card: { number: '4242424242424242', code: '123', expMonth: '4', expYear: '2029' },
      }),
      impl.createItem('identity', { name: 'Me', identity: { firstName: 'Anthony', ssn: '000-00-0000' } }),
      impl.createItem('note', { name: 'WiFi', notes: 'the password is on the router' }),
      impl.createItem('key', {
        name: 'deploy@railway',
        key: { keyType: 'ssh', algorithm: 'ed25519', privateKey: '<private key body>', path: '~/.ssh/id_ed25519', mode: '0600' },
      }),
      impl.createItem('account', {
        name: 'Stripe',
        account: { provider: 'stripe', accessToken: '<access token>', scopes: ['charges:write', 'customers:read'] },
      }),
    ],
  };
}

describe('OpenCreds interoperability', () => {
  it('has a reference implementation, or is skipped', (ctx) => {
    if (!ref) ctx.skip();
    expect(ref.OPENCREDS_VERSION).toBe('0.1');
  });

  it('reads a database the reference implementation wrote', async (ctx) => {
    if (!ref) ctx.skip();
    const payload = payloadFrom(ref);
    const wire = JSON.stringify(await ref.exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST }));

    expect(detectImportKind(wire)).toBe('opencreds');

    // The header is readable without the passphrase, and authenticated.
    const header = inspectOpenCredsFile(wire);
    expect(header.itemCount).toBe(6);
    expect(header.namespace).toBe('opencreds');

    const opened = await parseOpenCredsImport(wire, { passphrase: PASSPHRASE });
    expect(opened.items).toEqual(payload.items);
    expect(opened.folders).toEqual(payload.folders);

    // The fields no CSV has a column for.
    expect(opened.items[0].history[0].password).toBe('hunter1');
    expect(opened.items.find((i) => i.type === 'key').key.mode).toBe('0600');
    expect(opened.items.find((i) => i.type === 'account').account.scopes).toHaveLength(2);
  }, 30_000);

  it('stores every imported item in this vault, under this vault’s own labels', async (ctx) => {
    if (!ref) ctx.skip();
    const payload = payloadFrom(ref);
    const wire = JSON.stringify(await ref.exportDatabase(payload, { passphrase: PASSPHRASE, params: FAST }));
    const opened = await parseOpenCredsImport(wire, { passphrase: PASSPHRASE });

    const userKey = randomBytes(32);
    const rows = [];
    for (const item of opened.items) rows.push(await encryptItem(userKey, item));

    expect(rows.map((r) => r.type).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const back = await decryptItems(userKey, rows);
    expect(back.failed).toHaveLength(0);
    expect(back.items).toHaveLength(6);
  }, 30_000);

  it('writes a database the reference implementation reads', async (ctx) => {
    if (!ref) ctx.skip();
    const payload = payloadFrom({ createItem });
    const db = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: 100_000 });

    const parsed = ref.parseDatabase(JSON.stringify(db));
    expect(ref.readHeader(parsed).namespace).toBe('marksyncr');

    const opened = await ref.openDatabase(parsed, { passphrase: PASSPHRASE });
    expect(opened.items).toEqual(payload.items);
  }, 30_000);

  it('writes a plaintext database that passes the reference validator', async (ctx) => {
    if (!ref) ctx.skip();
    const db = await exportPlaintextOpenCredsDatabase(payloadFrom({ createItem }), { acknowledged: true });
    const { diagnostics } = ref.validateDocument(JSON.parse(JSON.stringify(db)));
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(ref.formatDiagnostics(errors)).toBe('');
  });

  it('survives a round trip out through the reference implementation and back', async (ctx) => {
    if (!ref) ctx.skip();
    const original = payloadFrom(ref);

    const first = JSON.stringify(await ref.exportDatabase(original, { passphrase: PASSPHRASE, params: FAST }));
    const here = await parseOpenCredsImport(first, { passphrase: PASSPHRASE });
    const second = JSON.stringify(
      await exportOpenCredsDatabase({ folders: here.folders, items: here.items }, { passphrase: PASSPHRASE, iterations: 100_000 })
    );
    const there = await ref.openDatabase(ref.parseDatabase(second), { passphrase: PASSPHRASE });

    expect(there.items).toEqual(original.items);
    // createdAt is the only evidence of when a password was last rotated.
    expect(there.items[0].createdAt).toBe(original.items[0].createdAt);
    expect(there.folders).toEqual(original.folders);
  }, 60_000);
});
