/**
 * Tests for the vault UI's pure helpers — search and master-password strength.
 * @module __tests__/vault-ui.test
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('webextension-polyfill', () => ({ default: {} }));

import { filterItems } from '../src/popup/components/VaultPanel.jsx';
import { assessPassword } from '../src/popup/components/vault/VaultUnlock.jsx';

const items = [
  {
    id: '1',
    type: 'login',
    name: 'GitHub',
    notes: '',
    login: { username: 'anthony', uris: [{ uri: 'https://github.com' }] },
  },
  {
    id: '2',
    type: 'card',
    name: 'Travel Visa',
    notes: 'expires soon',
    card: { cardholderName: 'A Ettinger', brand: 'Visa' },
  },
  {
    id: '3',
    type: 'identity',
    name: 'Home',
    notes: '',
    identity: { email: 'me@example.com', firstName: 'Ada', lastName: 'Lovelace' },
  },
];

describe('filterItems', () => {
  it('returns everything for an empty query', () => {
    expect(filterItems(items, '')).toHaveLength(3);
    expect(filterItems(items, '   ')).toHaveLength(3);
  });

  it('matches on name, case-insensitively', () => {
    expect(filterItems(items, 'github')).toHaveLength(1);
    expect(filterItems(items, 'GITHUB')[0].id).toBe('1');
  });

  it('matches on a login username', () => {
    expect(filterItems(items, 'anthony')[0].id).toBe('1');
  });

  it('matches on the website, which is how people look a login up', () => {
    expect(filterItems(items, 'github.com')[0].id).toBe('1');
  });

  it('matches on an identity email and name', () => {
    expect(filterItems(items, 'lovelace')[0].id).toBe('3');
    expect(filterItems(items, 'me@example')[0].id).toBe('3');
  });

  it('matches on a card brand and cardholder', () => {
    expect(filterItems(items, 'visa').map((i) => i.id)).toContain('2');
    expect(filterItems(items, 'ettinger')[0].id).toBe('2');
  });

  it('matches on notes', () => {
    expect(filterItems(items, 'expires')[0].id).toBe('2');
  });

  it('returns nothing when nothing matches', () => {
    expect(filterItems(items, 'zzzz')).toEqual([]);
  });

  it('does not blow up on items missing field groups', () => {
    const sparse = [{ id: '9', type: 'note', name: 'Just a note' }];
    expect(filterItems(sparse, 'note')).toHaveLength(1);
    expect(filterItems(sparse, 'nothing')).toHaveLength(0);
  });
});

describe('assessPassword', () => {
  it('says nothing for an empty password', () => {
    expect(assessPassword('')).toMatchObject({ score: 0, label: '' });
  });

  it('rates a very short password weak without demanding a minimum length', () => {
    const result = assessPassword('Ab1!xy');
    expect(result.label).toBe('Weak');
    expect(result.hint).not.toMatch(/at least/);
  });

  it('accepts an eleven-character password as a normal rating', () => {
    const result = assessPassword('5stringerSS');
    expect(result.label).toBe('Fair');
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('rates a long mixed password highly', () => {
    const result = assessPassword('correct-horse-Battery-9-staple!');
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(['Good', 'Strong']).toContain(result.label);
  });

  it('rates a long but monotonous password lower than a mixed one', () => {
    const plain = assessPassword('aaaaaaaaaaaaaaaaaaaa');
    const mixed = assessPassword('aA1!aaaaaaaaaaaaaaaa');
    expect(plain.score).toBeLessThan(mixed.score);
  });

  it('is never negative or above five', () => {
    for (const pw of ['', 'a', 'abcdefghijkl', 'aA1!'.repeat(20)]) {
      const { score } = assessPassword(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(5);
    }
  });
});
