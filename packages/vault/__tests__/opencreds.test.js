/**
 * OpenCreds — the portable vault database.
 *
 * These tests are the interoperability contract. A file this vault writes must
 * open in any conforming implementation, and a file any conforming
 * implementation writes must open here, with the item records byte-identical
 * both ways.
 */

import { describe, expect, it } from 'vitest';

import { createItem, encryptItem, decryptItem, ITEM_TYPE } from '../src/items.js';
import {
  buildManifest,
  exportOpenCredsDatabase,
  exportPlaintextOpenCredsDatabase,
  isOpenCredsDatabase,
  NAMESPACE,
  openOpenCredsDatabase,
  OPENCREDS_VERSION,
  parseOpenCredsDatabase,
  readOpenCredsHeader,
  verifyManifest,
} from '../src/opencreds.js';
import {
  detectImportKind,
  importFile,
  inspectOpenCredsFile,
  parseOpenCredsImport,
} from '../src/import.js';
import { randomBytes } from '../src/primitives.js';

const PASSPHRASE = 'opencreds-fixture';
// The construction is under test, not the work factor.
const FAST = 100_000;

function samplePayload() {
  const work = { id: '11111111-1111-4111-8111-111111111111', name: 'Work' };
  return {
    folders: [work],
    items: [
      createItem('login', {
        name: 'GitHub',
        folderId: work.id,
        login: {
          username: 'anthony',
          password: 'hunter2',
          totp: 'otpauth://totp/GitHub',
          uris: [{ uri: 'https://github.com', match: 'domain' }],
        },
      }),
      createItem('card', { name: 'Visa', card: { number: '4242424242424242', code: '123' } }),
      createItem('identity', { name: 'Me', identity: { firstName: 'Anthony' } }),
      createItem('note', { name: 'WiFi', notes: 'on the router' }),
      createItem('key', {
        name: 'deploy',
        key: { keyType: 'ssh', privateKey: '-----BEGIN-----', path: '~/.ssh/id_ed25519', mode: '0600' },
      }),
      createItem('account', {
        name: 'Stripe',
        account: { provider: 'stripe', accessToken: 'sk_live_x', scopes: ['charges:write'] },
      }),
    ],
  };
}

describe('the six item types', () => {
  it('carries the OpenCreds codes, with 1-4 unchanged', () => {
    // Renumbering these would break every ciphertext already written.
    expect(ITEM_TYPE).toEqual({ login: 1, card: 2, identity: 3, note: 4, key: 5, account: 6 });
  });

  it('creates a key and an account with their full field groups', () => {
    const key = createItem('key', { name: 'deploy' });
    expect(key.key).toMatchObject({ keyType: '', privateKey: '', path: '', mode: '' });

    const account = createItem('account', { name: 'Stripe' });
    expect(account.account).toMatchObject({ provider: '', accessToken: '', scopes: [] });
  });

  it('round-trips a key and an account through the vault envelope', async () => {
    const userKey = randomBytes(32);
    for (const item of [
      createItem('key', { name: 'deploy', key: { keyType: 'ssh', privateKey: 'SECRET' } }),
      createItem('account', { name: 'Stripe', account: { accessToken: 'sk_live_x' } }),
    ]) {
      const row = await encryptItem(userKey, item);
      expect(row.type).toBe(ITEM_TYPE[item.type]);
      expect(row.ciphertext).not.toContain('SECRET');
      expect(await decryptItem(userKey, row)).toEqual(item);
    }
  });

  it('refuses to encrypt an item carrying another type’s group', async () => {
    const userKey = randomBytes(32);
    const item = { ...createItem('login', { name: 'x' }), account: { provider: 'stripe' } };
    await expect(encryptItem(userKey, item)).rejects.toThrow(/must not carry an account field group/);
  });
});

describe('the manifest', () => {
  it('counts by type and digests the sorted ids', async () => {
    const manifest = await buildManifest(samplePayload());
    expect(manifest.itemCount).toBe(6);
    expect(manifest.folderCount).toBe(1);
    expect(manifest.types).toEqual({ login: 1, card: 1, identity: 1, note: 1, key: 1, account: 1 });
  });

  it('digests identically whatever order the items arrive in', async () => {
    const payload = samplePayload();
    const reversed = { ...payload, items: [...payload.items].reverse() };
    expect((await buildManifest(reversed)).digest).toBe((await buildManifest(payload)).digest);
  });

  it('reports every disagreement rather than the first', async () => {
    const payload = samplePayload();
    const manifest = await buildManifest(payload);
    const problems = await verifyManifest(manifest, { ...payload, items: payload.items.slice(0, 4) });
    expect(problems.length).toBeGreaterThan(1);
    expect(problems.join(' ')).toMatch(/says 6 items, payload has 4/);
  });
});

describe('exporting', () => {
  it('writes an encrypted database with no plaintext secret in it', async () => {
    const db = await exportOpenCredsDatabase(samplePayload(), {
      passphrase: PASSPHRASE,
      iterations: FAST,
    });

    expect(db.opencreds).toBe(OPENCREDS_VERSION);
    expect(db.protected).toBe(true);
    expect(db.namespace).toBe(NAMESPACE);
    const raw = JSON.stringify(db);
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('4242424242424242');
    expect(raw).not.toContain('sk_live_x');
    // The counts are readable without the passphrase, for a preview.
    expect(db.manifest.itemCount).toBe(6);
  });

  it('round-trips a whole vault', async () => {
    const payload = samplePayload();
    const db = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: FAST });
    const back = await openOpenCredsDatabase(db, { passphrase: PASSPHRASE });
    expect(back.items).toEqual(payload.items);
    expect(back.folders).toEqual(payload.folders);
  });

  it('refuses a plaintext export that was not asked for in so many words', async () => {
    await expect(exportPlaintextOpenCredsDatabase(samplePayload(), {})).rejects.toThrow(
      /every secret in the vault out unencrypted/
    );
  });

  it('labels a plaintext export unprotected in its own header', async () => {
    const db = await exportPlaintextOpenCredsDatabase(samplePayload(), { acknowledged: true });
    expect(db.protected).toBe(false);
    expect(JSON.stringify(db)).toContain('hunter2');
  });

  it('uses a fresh salt and IV each time', async () => {
    const payload = samplePayload();
    const a = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: FAST });
    const b = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: FAST });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
  });
});

describe('importing', () => {
  it('rejects the wrong passphrase', async () => {
    const db = await exportOpenCredsDatabase(samplePayload(), {
      passphrase: PASSPHRASE,
      iterations: FAST,
    });
    await expect(openOpenCredsDatabase(db, { passphrase: 'nope' })).rejects.toThrow(
      /Could not decrypt/
    );
  });

  it('fails when the manifest is restated, because the header is the AAD', async () => {
    const db = await exportOpenCredsDatabase(samplePayload(), {
      passphrase: PASSPHRASE,
      iterations: FAST,
    });
    const lying = { ...db, manifest: { ...db.manifest, itemCount: 5 } };
    await expect(openOpenCredsDatabase(lying, { passphrase: PASSPHRASE })).rejects.toThrow(
      /wrong passphrase, or the file was altered/
    );
  });

  it('fails when a plaintext database loses an item', async () => {
    const db = await exportPlaintextOpenCredsDatabase(samplePayload(), { acknowledged: true });
    const truncated = { ...db, items: db.items.slice(0, 3) };
    await expect(openOpenCredsDatabase(truncated)).rejects.toThrow(/Manifest does not match/);
  });

  it('refuses an unregistered namespace unless told otherwise', async () => {
    const db = await exportPlaintextOpenCredsDatabase(samplePayload(), { acknowledged: true });
    const foreign = { ...db, namespace: 'someone-else' };
    await expect(openOpenCredsDatabase(foreign)).rejects.toThrow(/Unregistered namespace/);
    await expect(
      openOpenCredsDatabase(foreign, { allowUnregisteredNamespace: true })
    ).resolves.toBeTruthy();
  });

  it('accepts a database written under the opencreds namespace', async () => {
    // The interoperability case: a file from @logicsrc/opencreds.
    const db = await exportPlaintextOpenCredsDatabase(samplePayload(), { acknowledged: true });
    const fromLogicSrc = { ...db, namespace: 'opencreds' };
    expect((await openOpenCredsDatabase(fromLogicSrc)).items).toHaveLength(6);
  });

  it('refuses a version it does not read', async () => {
    const db = await exportPlaintextOpenCredsDatabase(samplePayload(), { acknowledged: true });
    await expect(openOpenCredsDatabase({ ...db, opencreds: '9.9' })).rejects.toThrow(
      /Unsupported OpenCreds version/
    );
  });

  it('rejects an item whose group does not match its type', async () => {
    const payload = samplePayload();
    payload.items.push({ ...createItem('login', { name: 'bad' }), card: { number: '1' } });
    const db = await exportPlaintextOpenCredsDatabase(payload, { acknowledged: true });
    await expect(openOpenCredsDatabase(db)).rejects.toThrow(/must not carry a card field group/);
  });
});

describe('file detection', () => {
  it('tells an OpenCreds database from a CSV', async () => {
    const db = await exportOpenCredsDatabase(samplePayload(), {
      passphrase: PASSPHRASE,
      iterations: FAST,
    });
    expect(detectImportKind(JSON.stringify(db))).toBe('opencreds');
    expect(detectImportKind('name,url,username,password\nGitHub,x,y,z\n')).toBe('csv');
    expect(detectImportKind('{"hello":"world"}')).toBe('unknown');
    expect(detectImportKind('')).toBe('unknown');
  });

  it('survives a BOM in front of the JSON', async () => {
    const db = await exportPlaintextOpenCredsDatabase(samplePayload(), { acknowledged: true });
    expect(detectImportKind(`﻿${JSON.stringify(db)}`)).toBe('opencreds');
  });

  it('previews the header without the passphrase', async () => {
    const db = await exportOpenCredsDatabase(samplePayload(), {
      passphrase: PASSPHRASE,
      iterations: FAST,
    });
    const header = inspectOpenCredsFile(JSON.stringify(db));
    expect(header.protected).toBe(true);
    expect(header.itemCount).toBe(6);
    expect(header.types.key).toBe(1);
    expect(header.generator.name).toBe('@marksyncr/vault');
  });

  it('says what a CSV is when one reaches the database reader', () => {
    expect(() => parseOpenCredsDatabase('name,url\nx,y')).toThrow(/not a CSV/);
    expect(() => parseOpenCredsDatabase('{"hello":"world"}')).toThrow(/Not an OpenCreds database/);
    expect(isOpenCredsDatabase({ type: 'opencreds.database' })).toBe(true);
    expect(isOpenCredsDatabase(null)).toBe(false);
  });
});

describe('importFile', () => {
  it('imports an OpenCreds database, folders and all', async () => {
    const payload = samplePayload();
    const db = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: FAST });

    const result = await importFile(JSON.stringify(db), { passphrase: PASSPHRASE });
    expect(result.source).toBe('opencreds');
    expect(result.items).toEqual(payload.items);
    expect(result.folders).toEqual(payload.folders);
    expect(result.skipped).toEqual([]);
  });

  it('still imports a CSV, and reports what it skipped', async () => {
    const csv = 'name,url,username,password,note\nGitHub,https://github.com,a,b,\n,,,,\n';
    const result = await importFile(csv);
    expect(result.source).toBe('chrome');
    expect(result.items).toHaveLength(1);
    expect(result.folders).toEqual([]);
    expect(result.skipped).toEqual([{ row: 3, reason: 'Empty row' }]);
  });

  it('carries password history, which no CSV has a column for', async () => {
    const payload = samplePayload();
    payload.items[0].history = [{ password: 'old', changedAt: '2026-01-01T00:00:00.000Z' }];
    const db = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: FAST });

    const result = await parseOpenCredsImport(JSON.stringify(db), { passphrase: PASSPHRASE });
    expect(result.items[0].history).toEqual([
      { password: 'old', changedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('does not restamp timestamps or drop fields it does not know', async () => {
    const payload = samplePayload();
    payload.items[0] = {
      ...payload.items[0],
      createdAt: '2019-04-01T00:00:00.000Z',
      updatedAt: '2020-07-09T00:00:00.000Z',
      fromTheFuture: { keep: 'me' },
    };

    const db = await exportOpenCredsDatabase(payload, { passphrase: PASSPHRASE, iterations: FAST });
    const back = await openOpenCredsDatabase(db, { passphrase: PASSPHRASE });

    expect(back.items[0].createdAt).toBe('2019-04-01T00:00:00.000Z');
    expect(back.items[0].updatedAt).toBe('2020-07-09T00:00:00.000Z');
    expect(back.items[0].fromTheFuture).toEqual({ keep: 'me' });
  });
});

describe('the header a reader sees', () => {
  it('exposes only what a preview needs', async () => {
    const db = await exportOpenCredsDatabase(samplePayload(), {
      passphrase: PASSPHRASE,
      iterations: FAST,
    });
    const header = readOpenCredsHeader(db);
    expect(header).toMatchObject({
      opencreds: '0.1',
      protected: true,
      namespace: 'marksyncr',
      itemCount: 6,
      folderCount: 1,
    });
    expect(JSON.stringify(header)).not.toContain('hunter2');
  });
});
