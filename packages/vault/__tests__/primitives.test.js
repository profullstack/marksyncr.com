/**
 * Known-answer tests for the vault primitives.
 *
 * These pin our WebCrypto usage against published RFC vectors, not against our
 * own output. A round-trip test proves only that we are self-consistent — it
 * would still pass if the parameters were wrong in both directions. These
 * vectors are the check that we are computing the algorithm everyone else means.
 * @module __tests__/primitives.test
 */

import { describe, it, expect } from 'vitest';
import {
  pbkdf2,
  hkdf,
  aesGcmEncrypt,
  aesGcmDecrypt,
  randomBytes,
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  utf8Encode,
  utf8Decode,
  timingSafeEqual,
  IV_BYTES,
  KEY_BYTES,
} from '../src/primitives.js';

describe('PBKDF2-HMAC-SHA256 — RFC 7914 §11 vectors', () => {
  it('passwd / salt / 1 iteration / 64 bytes', async () => {
    const out = await pbkdf2('passwd', utf8Encode('salt'), 1, 64);
    expect(toHex(out)).toBe(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc' +
        '49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783'
    );
  });

  it('Password / NaCl / 80000 iterations / 64 bytes', async () => {
    const out = await pbkdf2('Password', utf8Encode('NaCl'), 80_000, 64);
    expect(toHex(out)).toBe(
      '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56' +
        'a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d'
    );
  }, 30_000);

  it('refuses a non-positive iteration count rather than doing no work', async () => {
    await expect(pbkdf2('p', utf8Encode('s'), 0, 32)).rejects.toThrow(/positive integer/);
  });
});

describe('HKDF-SHA256 — RFC 5869 vectors', () => {
  it('A.1: 22-byte IKM with salt and info', async () => {
    // The RFC's info field is raw bytes and not valid UTF-8, so it is passed
    // as bytes — through the same hkdf() the vault uses, not a special case.
    const ikm = fromHex('0b'.repeat(22));
    const salt = fromHex('000102030405060708090a0b0c');
    const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
    const out = await hkdf(ikm, info, 42, salt);
    expect(toHex(out)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    );
  });

  it('A.3: zero-length salt and info', async () => {
    const ikm = fromHex('0b'.repeat(22));
    const out = await hkdf(ikm, '', 42);
    expect(toHex(out)).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8'
    );
  });

  it('different info labels give independent keys from the same input', async () => {
    const ikm = randomBytes(KEY_BYTES);
    const a = await hkdf(ikm, 'label:a');
    const b = await hkdf(ikm, 'label:b');
    expect(toHex(a)).not.toBe(toHex(b));
  });
});

describe('AES-256-GCM', () => {
  it('round-trips', async () => {
    const key = randomBytes(KEY_BYTES);
    const message = utf8Encode('correct horse battery staple');
    const { iv, ciphertext } = await aesGcmEncrypt(key, message);
    expect(utf8Decode(await aesGcmDecrypt(key, iv, ciphertext))).toBe(
      'correct horse battery staple'
    );
  });

  it('uses a fresh IV every call — reuse would break the mode', async () => {
    const key = randomBytes(KEY_BYTES);
    const message = utf8Encode('same message');
    const a = await aesGcmEncrypt(key, message);
    const b = await aesGcmEncrypt(key, message);

    expect(toHex(a.iv)).not.toBe(toHex(b.iv));
    expect(a.iv).toHaveLength(IV_BYTES);
    // Identical plaintext must not produce identical ciphertext.
    expect(toHex(a.ciphertext)).not.toBe(toHex(b.ciphertext));
  });

  it('rejects a tampered ciphertext instead of returning garbage', async () => {
    const key = randomBytes(KEY_BYTES);
    const { iv, ciphertext } = await aesGcmEncrypt(key, utf8Encode('secret'));
    ciphertext[0] ^= 0xff;
    await expect(aesGcmDecrypt(key, iv, ciphertext)).rejects.toThrow();
  });

  it('rejects the wrong key', async () => {
    const { iv, ciphertext } = await aesGcmEncrypt(randomBytes(KEY_BYTES), utf8Encode('secret'));
    await expect(aesGcmDecrypt(randomBytes(KEY_BYTES), iv, ciphertext)).rejects.toThrow();
  });

  it('binds additional authenticated data', async () => {
    const key = randomBytes(KEY_BYTES);
    const aad = utf8Encode('row-id-1');
    const { iv, ciphertext } = await aesGcmEncrypt(key, utf8Encode('secret'), aad);

    // Correct AAD decrypts.
    expect(utf8Decode(await aesGcmDecrypt(key, iv, ciphertext, aad))).toBe('secret');
    // A different AAD does not — this is what stops a ciphertext being moved
    // from one row to another.
    await expect(aesGcmDecrypt(key, iv, ciphertext, utf8Encode('row-id-2'))).rejects.toThrow();
  });

  it('refuses a key of the wrong length', async () => {
    await expect(aesGcmEncrypt(randomBytes(16), utf8Encode('x'))).rejects.toThrow(/32 bytes/);
  });
});

describe('encoding helpers', () => {
  it('base64 round-trips arbitrary bytes', () => {
    const bytes = randomBytes(64);
    expect(toHex(fromBase64(toBase64(bytes)))).toBe(toHex(bytes));
  });

  it('handles high bytes that a naive string conversion would mangle', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 254, 255]);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('hex round-trips and ignores separators', () => {
    const bytes = randomBytes(20);
    const grouped = (toHex(bytes).match(/.{1,5}/g) || []).join('-').toUpperCase();
    expect(toHex(fromHex(grouped))).toBe(toHex(bytes));
  });

  it('rejects odd-length hex', () => {
    expect(() => fromHex('abc')).toThrow(/even length/);
  });
});

describe('timingSafeEqual', () => {
  it('is true only for identical arrays', () => {
    expect(timingSafeEqual(fromHex('00ff'), fromHex('00ff'))).toBe(true);
    expect(timingSafeEqual(fromHex('00ff'), fromHex('00fe'))).toBe(false);
  });

  it('is false for different lengths', () => {
    expect(timingSafeEqual(fromHex('00ff'), fromHex('00'))).toBe(false);
  });

  it('compares every byte rather than stopping at the first difference', () => {
    // Differing in the first byte and in the last must both be false; a
    // short-circuiting implementation passes this too, but it documents intent
    // alongside the constant-time loop.
    expect(timingSafeEqual(fromHex('ff0000'), fromHex('000000'))).toBe(false);
    expect(timingSafeEqual(fromHex('0000ff'), fromHex('000000'))).toBe(false);
  });
});

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(32)).toHaveLength(32);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 50 }, () => toHex(randomBytes(16))));
    expect(seen.size).toBe(50);
  });
});
