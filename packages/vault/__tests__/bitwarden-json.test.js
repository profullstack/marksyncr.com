import { describe, expect, it } from 'vitest';

import { detectImportKind } from '../src/import.js';
import { isBitwardenExport, parseBitwardenJson } from '../src/bitwarden.js';

/** A minimal export in Bitwarden's real shape. */
function exportOf(items, folders = []) {
  return JSON.stringify({ encrypted: false, folders, items });
}

describe('recognising a Bitwarden JSON export', () => {
  it('is its own kind, not "unknown"', () => {
    // The bug: every JSON that was not an OpenCreds database fell through to
    // 'unknown', and the options page answered "neither an OpenCreds database
    // nor a CSV export". There was no way for a person to get past it.
    expect(detectImportKind(exportOf([]))).toBe('bitwarden-json');
  });

  it('still sends an OpenCreds database to the OpenCreds reader', () => {
    const db = JSON.stringify({
      opencreds: '0.1',
      type: 'opencreds.database',
      protected: true,
      payload: 'ciphertext',
    });
    expect(detectImportKind(db)).not.toBe('bitwarden-json');
  });

  it('leaves CSV and junk alone', () => {
    expect(detectImportKind('name,login_uri\na,b\n')).toBe('csv');
    expect(detectImportKind('{"a":1}')).toBe('unknown');
    expect(detectImportKind('')).toBe('unknown');
  });

  it('needs more than an items array before claiming a file', () => {
    expect(isBitwardenExport({ items: [] })).toBe(false);
    expect(isBitwardenExport({ items: [], encrypted: false })).toBe(true);
  });
});

describe('reading a Bitwarden JSON export', () => {
  it('reads a login with every uri, its totp and its password', () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: 'Example',
          login: {
            username: 'ann',
            password: 'hunter2',
            totp: 'otpauth://x',
            uris: [{ uri: 'https://example.com' }, { uri: 'https://alt.example' }],
          },
        },
      ])
    );
    expect(parsed.source).toBe('bitwarden');
    const item = parsed.items[0];
    expect(item.type).toBe('login');
    expect(item.login.username).toBe('ann');
    expect(item.login.password).toBe('hunter2');
    expect(item.login.totp).toBe('otpauth://x');
    // The CSV would have kept only the first.
    expect(item.login.uris.map((u) => u.uri)).toEqual([
      'https://example.com',
      'https://alt.example',
    ]);
  });

  it('maps the numeric uri match rules instead of assuming domain', () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: 'x',
          login: {
            uris: [
              { uri: 'https://a.test', match: 3 },
              { uri: 'https://b.test', match: 5 },
              { uri: 'https://c.test', match: null },
            ],
          },
        },
      ])
    );
    expect(parsed.items[0].login.uris).toEqual([
      { uri: 'https://a.test', match: 'exact' },
      { uri: 'https://b.test', match: 'never' },
      { uri: 'https://c.test', match: 'domain' },
    ]);
  });

  it('keeps Bitwarden ids, so importing the same file twice dedupes', () => {
    const id = '56126b05-485c-44c2-a6fc-acb70001e348';
    const parsed = parseBitwardenJson(exportOf([{ type: 1, id, name: 'x', login: {} }]));
    expect(parsed.items[0].id).toBe(id);
  });

  it('ignores an id that is not a uuid rather than trusting it', () => {
    const parsed = parseBitwardenJson(exportOf([{ type: 1, id: 'nope', name: 'x', login: {} }]));
    expect(parsed.items[0].id).not.toBe('nope');
  });

  it('keeps the original timestamps, the only record of a rotation', () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: 'x',
          login: {},
          creationDate: '2021-01-21T00:06:52.377Z',
          revisionDate: '2023-05-02T11:00:00.000Z',
        },
      ])
    );
    expect(parsed.items[0].createdAt).toBe('2021-01-21T00:06:52.377Z');
    expect(parsed.items[0].updatedAt).toBe('2023-05-02T11:00:00.000Z');
  });

  it('carries password history, newest first', () => {
    const parsed = parseBitwardenJson(
      exportOf([
        {
          type: 1,
          name: 'x',
          login: {},
          passwordHistory: [
            { password: 'older', lastUsedDate: '2024-01-01T00:00:00.000Z' },
            { password: 'newer', lastUsedDate: '2024-06-01T00:00:00.000Z' },
          ],
        },
      ])
    );
    expect(parsed.items[0].history.map((h) => h.password)).toEqual(['newer', 'older']);
  });

  it('reads cards, identities and secure notes', () => {
    const parsed = parseBitwardenJson(
      exportOf([
        { type: 3, name: 'amex', card: { number: '3782', code: '123' } },
        { type: 4, name: 'me', identity: { firstName: 'Ann' } },
        { type: 2, name: 'note', notes: 'remember' },
      ])
    );
    expect(parsed.items.map((i) => i.type)).toEqual(['card', 'identity', 'note']);
    expect(parsed.items[0].card.number).toBe('3782');
    expect(parsed.items[1].identity.firstName).toBe('Ann');
    expect(parsed.items[2].notes).toBe('remember');
  });

  it('refuses an encrypted export instead of storing ciphertext as passwords', () => {
    const parsed = parseBitwardenJson(
      JSON.stringify({ encrypted: true, folders: [], items: ['2.aBc|dEf'] })
    );
    expect(parsed.items).toEqual([]);
    expect(parsed.skipped[0].reason).toMatch(/encrypted/i);
  });

  it('skips an unreadable row and keeps the rest', () => {
    const parsed = parseBitwardenJson(
      exportOf([
        { type: 1, name: 'first', login: {} },
        { type: 99, name: 'weird' },
        { type: 1, name: 'third', login: {} },
      ])
    );
    expect(parsed.items.map((i) => i.name)).toEqual(['first', 'third']);
    expect(parsed.skipped).toEqual([{ row: 2, reason: 'Unknown Bitwarden item type 99' }]);
  });

  it('reports bad JSON rather than throwing', () => {
    const parsed = parseBitwardenJson('{not json');
    expect(parsed.source).toBeNull();
    expect(parsed.skipped[0].reason).toBe('Not valid JSON');
  });
});
