/**
 * Tests for password and passphrase generation.
 * @module __tests__/generator.test
 */

import { describe, it, expect } from 'vitest';
import {
  generatePassword,
  generatePassphrase,
  passwordEntropyBits,
  passphraseEntropyBits,
  LOWERCASE,
  UPPERCASE,
  DIGITS,
  SYMBOLS,
  WORDS,
} from '../src/generator.js';

const has = (str, alphabet) => [...str].some((c) => alphabet.includes(c));

describe('generatePassword', () => {
  it('honours the requested length', () => {
    for (const length of [8, 20, 64, 128]) {
      expect(generatePassword({ length })).toHaveLength(length);
    }
  });

  it('includes at least one character from every enabled group', () => {
    // Sites reject a password that happens to contain no digit, so this is a
    // guarantee rather than a probability.
    for (let i = 0; i < 30; i++) {
      const pw = generatePassword({ length: 8 });
      expect(has(pw, LOWERCASE)).toBe(true);
      expect(has(pw, UPPERCASE)).toBe(true);
      expect(has(pw, DIGITS)).toBe(true);
      expect(has(pw, SYMBOLS)).toBe(true);
    }
  });

  it('uses only the groups that are enabled', () => {
    const pw = generatePassword({ length: 40, symbols: false, uppercase: false });
    expect(has(pw, SYMBOLS)).toBe(false);
    expect(has(pw, UPPERCASE)).toBe(false);
    expect(has(pw, LOWERCASE)).toBe(true);
  });

  it('can exclude ambiguous characters', () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword({ length: 60, avoidAmbiguous: true });
      expect(/[0O1lI]/.test(pw)).toBe(false);
    }
  });

  it('does not place the guaranteed characters in a fixed order', () => {
    // Without the shuffle, position 0 would always come from the first enabled
    // group and be lowercase every time.
    const firsts = new Set(
      Array.from({ length: 60 }, () => generatePassword({ length: 12 })[0])
    );
    const allLower = [...firsts].every((c) => LOWERCASE.includes(c));
    expect(allLower).toBe(false);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword({ length: 16 })));
    expect(seen.size).toBe(200);
  });

  it('is roughly uniform across the alphabet', () => {
    // A modulo-biased implementation over-selects the start of the alphabet.
    // With digits only, each of the 10 should appear near a tenth of the time.
    const counts = new Map();
    const sample = generatePassword({
      length: 5000,
      lowercase: false,
      uppercase: false,
      symbols: false,
    });
    for (const c of sample) counts.set(c, (counts.get(c) || 0) + 1);

    expect(counts.size).toBe(10);
    for (const count of counts.values()) {
      // Expected 500 each; a generous band that a biased generator still fails.
      expect(count).toBeGreaterThan(380);
      expect(count).toBeLessThan(620);
    }
  });

  it('generates a password longer than 256 characters', () => {
    // Regression: the shuffle drew one byte and rejected anything at or above
    // the largest multiple of n below 256 — which is zero once n exceeds 256,
    // so every draw was rejected and this spun forever.
    const pw = generatePassword({ length: 300 });
    expect(pw).toHaveLength(300);
  });

  it('refuses a length too short to satisfy the enabled groups', () => {
    expect(() => generatePassword({ length: 3 })).toThrow(/at least 4/);
  });

  it('refuses when no character type is selected', () => {
    expect(() =>
      generatePassword({ lowercase: false, uppercase: false, digits: false, symbols: false })
    ).toThrow(/at least one character type/);
  });
});

describe('passwordEntropyBits', () => {
  it('reports fewer bits when the alphabet shrinks', () => {
    const full = passwordEntropyBits({ length: 20 });
    const lowerOnly = passwordEntropyBits({
      length: 20,
      uppercase: false,
      digits: false,
      symbols: false,
    });
    expect(full).toBeGreaterThan(lowerOnly);
  });

  it('matches the hand calculation for a digits-only password', () => {
    // 20 digits = 20 * log2(10) ≈ 66.4
    const bits = passwordEntropyBits({
      length: 20,
      lowercase: false,
      uppercase: false,
      symbols: false,
    });
    expect(bits).toBe(66);
  });

  it('is zero with no character types', () => {
    expect(
      passwordEntropyBits({ lowercase: false, uppercase: false, digits: false, symbols: false })
    ).toBe(0);
  });
});

describe('generatePassphrase', () => {
  it('produces the requested number of words', () => {
    expect(generatePassphrase({ words: 5 }).split('-')).toHaveLength(5);
  });

  it('uses only words from the list', () => {
    const words = generatePassphrase({ words: 8 }).split('-');
    for (const word of words) expect(WORDS).toContain(word);
  });

  it('honours the separator', () => {
    expect(generatePassphrase({ words: 4, separator: '.' }).split('.')).toHaveLength(4);
  });

  it('can capitalize', () => {
    const phrase = generatePassphrase({ words: 4, capitalize: true });
    for (const word of phrase.split('-')) expect(word[0]).toBe(word[0].toUpperCase());
  });

  it('can append a digit to exactly one word', () => {
    const phrase = generatePassphrase({ words: 5, includeNumber: true });
    const withDigit = phrase.split('-').filter((w) => /\d$/.test(w));
    expect(withDigit).toHaveLength(1);
  });

  it('refuses a passphrase too short to be worth anything', () => {
    expect(() => generatePassphrase({ words: 2 })).toThrow(/at least 3 words/);
  });
});

describe('the word list', () => {
  it('is exactly 256 words, so each contributes a whole 8 bits', () => {
    expect(WORDS).toHaveLength(256);
    expect(Math.log2(WORDS.length)).toBe(8);
  });

  it('has no duplicates, which would skew the distribution', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  it('gives 48 bits for the six-word default', () => {
    expect(passphraseEntropyBits()).toBe(48);
  });
});
