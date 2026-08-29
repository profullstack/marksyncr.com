/**
 * Tests for vault payload validation.
 *
 * The server cannot inspect what it stores, so these checks are the entire
 * defence against a malformed or hostile write reaching the table. The
 * KDF-floor case matters most: it stops one client creating a weak vault that
 * every other client then has to open.
 * @module __tests__/vault-validation.test
 */

import { describe, it, expect } from 'vitest';
import {
  isUuid,
  isSaneBlob,
  validateItemPayload,
  validateVaultMeta,
  MAX_CIPHERTEXT_LENGTH,
  MIN_KDF_ITERATIONS,
} from '@/lib/vault-validation';

const validItem = () => ({
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  type: 1,
  ciphertext: 'aGVsbG8gd29ybGQ=',
  iv: 'YWJjZGVmZ2hpams=',
});

const validMeta = () => ({
  kdf: 'pbkdf2-sha256',
  iterations: 600000,
  salt: 'c2FsdHNhbHQ=',
  protectedUserKey: 'a2V5',
  protectedUserKeyIv: 'aXY=',
  authHash: 'aGFzaA==',
});

describe('isUuid', () => {
  it('accepts a v4 uuid', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
  });

  it.each([['not-a-uuid'], [''], [null], [42], ['3f2504e04f8941d39a0c0305e82c3301']])(
    'rejects %s',
    (value) => {
      expect(isUuid(value)).toBe(false);
    }
  );
});

describe('isSaneBlob', () => {
  it('accepts base64', () => {
    expect(isSaneBlob('aGVsbG8=')).toBe(true);
  });

  it('rejects non-base64 characters', () => {
    expect(isSaneBlob('not base64!')).toBe(false);
    expect(isSaneBlob('<script>')).toBe(false);
  });

  it('rejects anything over the length ceiling', () => {
    expect(isSaneBlob('a'.repeat(2000))).toBe(false);
  });

  it('treats an empty value as missing', () => {
    expect(isSaneBlob('')).toBe(false);
    expect(isSaneBlob('', { required: false })).toBe(true);
    expect(isSaneBlob(undefined, { required: false })).toBe(true);
  });
});

describe('validateItemPayload', () => {
  it('accepts a well-formed item', () => {
    expect(validateItemPayload(validItem())).toBeNull();
  });

  it('requires a real id', () => {
    expect(validateItemPayload({ ...validItem(), id: 'nope' })).toMatch(/valid item id/);
  });

  it('can skip the id, for a route that takes it from the path', () => {
    const { id: _omitted, ...withoutId } = validItem();
    expect(validateItemPayload(withoutId, { requireId: false })).toBeNull();
  });

  it.each([[0], [7], [null], ['login'], [1.5]])('rejects type %s', (type) => {
    expect(validateItemPayload({ ...validItem(), type })).toMatch(/Unknown item type/);
  });

  it('accepts every defined type', () => {
    // The OpenCreds six: 1 login, 2 card, 3 identity, 4 note, 5 key, 6 account.
    // Mirrors the vault_items_type_known constraint, so a rejection here and a
    // rejection in the database mean the same thing.
    for (const type of [1, 2, 3, 4, 5, 6]) {
      expect(validateItemPayload({ ...validItem(), type })).toBeNull();
    }
  });

  it('rejects an empty or non-base64 ciphertext', () => {
    expect(validateItemPayload({ ...validItem(), ciphertext: '' })).toMatch(/ciphertext/);
    expect(validateItemPayload({ ...validItem(), ciphertext: 'not base64!' })).toMatch(
      /ciphertext/
    );
  });

  it('rejects a ciphertext beyond the size ceiling', () => {
    const huge = 'a'.repeat(MAX_CIPHERTEXT_LENGTH + 4);
    expect(validateItemPayload({ ...validItem(), ciphertext: huge })).toMatch(/ciphertext/);
  });

  it('rejects a malformed iv', () => {
    expect(validateItemPayload({ ...validItem(), iv: '!!' })).toMatch(/iv/);
  });

  it('rejects a non-object body', () => {
    expect(validateItemPayload(null)).toMatch(/Invalid JSON/);
    expect(validateItemPayload('a string')).toMatch(/Invalid JSON/);
  });
});

describe('validateVaultMeta', () => {
  it('accepts well-formed key material', () => {
    expect(validateVaultMeta(validMeta())).toBeNull();
  });

  it('accepts an optional recovery blob', () => {
    expect(
      validateVaultMeta({ ...validMeta(), recoveryKeyBlob: 'YmxvYg==', recoveryKeyIv: 'aXY=' })
    ).toBeNull();
  });

  it('refuses a KDF it does not know', () => {
    expect(validateVaultMeta({ ...validMeta(), kdf: 'md5' })).toMatch(/Unsupported KDF/);
  });

  it('refuses iterations below the floor — the downgrade defence', () => {
    expect(validateVaultMeta({ ...validMeta(), iterations: 1 })).toMatch(/below the permitted/);
    expect(validateVaultMeta({ ...validMeta(), iterations: MIN_KDF_ITERATIONS - 1 })).toMatch(
      /below the permitted/
    );
  });

  it('accepts exactly the floor', () => {
    expect(validateVaultMeta({ ...validMeta(), iterations: MIN_KDF_ITERATIONS })).toBeNull();
  });

  it('refuses a non-integer iteration count', () => {
    expect(validateVaultMeta({ ...validMeta(), iterations: '600000' })).toMatch(
      /below the permitted/
    );
  });

  it('requires every mandatory blob', () => {
    for (const field of ['salt', 'protectedUserKey', 'protectedUserKeyIv', 'authHash']) {
      const meta = { ...validMeta(), [field]: '' };
      expect(validateVaultMeta(meta)).toMatch(/Malformed key material/);
    }
  });
});
