/**
 * Tests for the item record format and its encryption.
 *
 * The headline assertion here is the one the whole product claims: nothing a
 * user typed appears anywhere in what gets sent to the server.
 * @module __tests__/items.test
 */

import { describe, it, expect } from 'vitest';
import {
  ITEM_TYPE,
  ITEM_TYPE_NAME,
  ITEM_SCHEMA_VERSION,
  MAX_HISTORY_ENTRIES,
  createItem,
  recordPasswordChange,
  encryptItem,
  decryptItem,
  decryptItems,
} from '../src/items.js';
import { randomBytes, KEY_BYTES } from '../src/primitives.js';

const userKey = () => randomBytes(KEY_BYTES);

describe('createItem', () => {
  it('builds a login with every field present', () => {
    const item = createItem('login', { name: 'GitHub' });

    expect(item.v).toBe(ITEM_SCHEMA_VERSION);
    expect(item.type).toBe('login');
    expect(item.name).toBe('GitHub');
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.login).toEqual({ username: '', password: '', totp: '', uris: [] });
    expect(item.history).toEqual([]);
  });

  it('builds cards and identities from the same shape', () => {
    const card = createItem('card', { card: { number: '4242424242424242' } });
    expect(card.card.number).toBe('4242424242424242');
    expect(card.card.cardholderName).toBe('');

    const identity = createItem('identity', { identity: { firstName: 'Ada' } });
    expect(identity.identity.firstName).toBe('Ada');
    expect(identity.identity.country).toBe('');
  });

  it('gives every item a distinct id', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createItem('login').id));
    expect(ids.size).toBe(20);
  });

  it('refuses an unknown type', () => {
    expect(() => createItem('cryptowallet')).toThrow(/Unknown item type/);
  });

  it('maps type names to the stored integers both ways', () => {
    expect(ITEM_TYPE.login).toBe(1);
    expect(ITEM_TYPE_NAME[ITEM_TYPE.card]).toBe('card');
  });
});

describe('encryptItem / decryptItem', () => {
  it('round-trips every field', async () => {
    const key = userKey();
    const item = createItem('login', {
      name: 'GitHub',
      notes: 'recovery codes elsewhere',
      login: {
        username: 'anthony@profullstack.com',
        password: 'hunter2',
        totp: 'otpauth://totp/x',
        uris: [{ uri: 'https://github.com', match: 'domain' }],
      },
    });

    const row = await encryptItem(key, item);
    expect(await decryptItem(key, row)).toEqual(item);
  });

  it('sends nothing the user typed — the whole claim, asserted', async () => {
    const key = userKey();
    const item = createItem('login', {
      name: 'My Bank',
      notes: 'sort code 00-00-00',
      login: { username: 'anthony@profullstack.com', password: 'hunter2', totp: '', uris: [] },
    });

    const row = await encryptItem(key, item);
    const wire = JSON.stringify(row);

    for (const secret of ['hunter2', 'anthony@profullstack.com', 'My Bank', 'sort code']) {
      expect(wire).not.toContain(secret);
    }
    // Only the id, the type number, and two opaque blobs leave the device.
    expect(Object.keys(row).sort()).toEqual(['ciphertext', 'id', 'iv', 'type']);
  });

  it('stores the type as a plaintext integer, by design', async () => {
    const row = await encryptItem(userKey(), createItem('card'));
    expect(row.type).toBe(ITEM_TYPE.card);
  });

  it('produces different ciphertext for identical items', async () => {
    const key = userKey();
    const item = createItem('login', { name: 'Same' });
    const a = await encryptItem(key, item);
    const b = await encryptItem(key, item);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('cannot be decrypted with a different user key', async () => {
    const row = await encryptItem(userKey(), createItem('login', { name: 'x' }));
    await expect(decryptItem(userKey(), row)).rejects.toThrow(/Could not decrypt/);
  });

  it('refuses a ciphertext moved to a different row id', async () => {
    const key = userKey();
    const a = await encryptItem(key, createItem('login', { name: 'low value' }));
    const b = await encryptItem(key, createItem('login', { name: 'high value' }));

    // Someone with database write access swaps the blobs between rows. The id is
    // bound into the ciphertext as AAD, so this must fail rather than silently
    // showing the wrong credential under the wrong name.
    const swapped = { ...b, ciphertext: a.ciphertext, iv: a.iv };
    await expect(decryptItem(key, swapped)).rejects.toThrow(/Could not decrypt/);
  });

  it('refuses a tampered ciphertext', async () => {
    const key = userKey();
    const row = await encryptItem(key, createItem('login', { name: 'x' }));
    const bytes = atob(row.ciphertext).split('');
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff);
    await expect(decryptItem(key, { ...row, ciphertext: btoa(bytes.join('')) })).rejects.toThrow(
      /Could not decrypt/
    );
  });

  it('refuses to encrypt an item with no id', async () => {
    await expect(encryptItem(userKey(), { type: 'login' })).rejects.toThrow(/must have an id/);
  });
});

describe('decryptItems', () => {
  it('returns the good items and reports the bad ones', async () => {
    const key = userKey();
    const good = await encryptItem(key, createItem('login', { name: 'fine' }));
    const bad = await encryptItem(userKey(), createItem('login', { name: 'other key' }));

    const { items, failed } = await decryptItems(key, [good, bad]);

    // One corrupt row must not hide the rest of the vault.
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('fine');
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe(bad.id);
  });
});

describe('password history', () => {
  it('keeps the replaced password, not the new one', () => {
    let item = createItem('login', { login: { password: 'old-one' } });
    item = recordPasswordChange(item, 'new-one');

    expect(item.login.password).toBe('new-one');
    expect(item.history).toHaveLength(1);
    expect(item.history[0].password).toBe('old-one');
  });

  it('is newest first', () => {
    let item = createItem('login', { login: { password: 'first' } });
    item = recordPasswordChange(item, 'second');
    item = recordPasswordChange(item, 'third');

    expect(item.history.map((h) => h.password)).toEqual(['second', 'first']);
  });

  it('does not record a no-op change', () => {
    let item = createItem('login', { login: { password: 'same' } });
    item = recordPasswordChange(item, 'same');
    expect(item.history).toHaveLength(0);
  });

  it('does not record the first password, which replaced nothing', () => {
    let item = createItem('login');
    item = recordPasswordChange(item, 'first ever');
    expect(item.history).toHaveLength(0);
  });

  it('caps history so the blob cannot grow without bound', () => {
    let item = createItem('login', { login: { password: 'p0' } });
    for (let i = 1; i <= MAX_HISTORY_ENTRIES + 10; i++) {
      item = recordPasswordChange(item, `p${i}`);
    }
    expect(item.history).toHaveLength(MAX_HISTORY_ENTRIES);
    // The most recent replacement survives; the oldest fall off.
    expect(item.history[0].password).toBe(`p${MAX_HISTORY_ENTRIES + 9}`);
  });

  it('travels inside the encrypted blob, so it is protected for free', async () => {
    const key = userKey();
    let item = createItem('login', { login: { password: 'leaked-if-plaintext' } });
    item = recordPasswordChange(item, 'current');

    const row = await encryptItem(key, item);
    expect(JSON.stringify(row)).not.toContain('leaked-if-plaintext');

    const back = await decryptItem(key, row);
    expect(back.history[0].password).toBe('leaked-if-plaintext');
  });

  it('is only for logins', () => {
    expect(() => recordPasswordChange(createItem('card'), 'x')).toThrow(/Only logins/);
  });

  it('does not mutate the item it was given', () => {
    const item = createItem('login', { login: { password: 'original' } });
    recordPasswordChange(item, 'changed');
    expect(item.login.password).toBe('original');
  });
});
