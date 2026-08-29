/**
 * Tests for importing from other password managers.
 *
 * The CSV cases matter more than they look: notes fields in real exports
 * contain commas, quotes and newlines, and a parser that mishandles any of them
 * silently imports the wrong password against the wrong site.
 * @module __tests__/import.test
 */

import { describe, it, expect } from 'vitest';
import { parseCsv, rowsToObjects, detectSource, parseImport } from '../src/import.js';

describe('parseCsv', () => {
  it('reads a simple file', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('name,notes\nBank,"one, two, three"\n')).toEqual([
      ['name', 'notes'],
      ['Bank', 'one, two, three'],
    ]);
  });

  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"He said ""hi"""\n')).toEqual([['a'], ['He said "hi"']]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('name,notes\nBank,"line one\nline two"\n')).toEqual([
      ['name', 'notes'],
      ['Bank', 'line one\nline two'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM so the first header still matches', () => {
    const [headers] = parseCsv('\uFEFFname,url\nx,y\n');
    expect(headers[0]).toBe('name');
  });

  it('reads a final row with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('preserves empty fields', () => {
    expect(parseCsv('a,b,c\n1,,3\n')[1]).toEqual(['1', '', '3']);
  });
});

describe('rowsToObjects', () => {
  it('keys by lowercased header', () => {
    const objects = rowsToObjects([
      ['Name', 'URL'],
      ['GitHub', 'https://github.com'],
    ]);
    expect(objects).toEqual([{ name: 'GitHub', url: 'https://github.com' }]);
  });

  it('returns nothing for a header-only file', () => {
    expect(rowsToObjects([['name']])).toEqual([]);
  });
});

describe('detectSource', () => {
  it('spots a Bitwarden export', () => {
    expect(detectSource(['name', 'login_uri', 'login_username', 'login_password'])).toBe(
      'bitwarden'
    );
  });

  it('spots a 1Password export before falling through to Chrome', () => {
    // 1Password's columns are a superset of Chrome's, so order of checks matters.
    expect(detectSource(['title', 'url', 'username', 'password', 'type'])).toBe('onepassword');
  });

  it('spots a Chrome export', () => {
    expect(detectSource(['name', 'url', 'username', 'password', 'note'])).toBe('chrome');
  });

  it('returns null for something unrecognised', () => {
    expect(detectSource(['foo', 'bar'])).toBeNull();
  });
});

describe('parseImport — Chrome', () => {
  const csv = [
    'name,url,username,password,note',
    'GitHub,https://github.com/login,anthony,s3cret,',
    'Bank,https://bank.example/,me@example.com,"pa,ss""word","note, with comma"',
    '',
  ].join('\n');

  it('imports every row as a login', () => {
    const { source, items, skipped } = parseImport(csv);
    expect(source).toBe('chrome');
    expect(items).toHaveLength(2);
    expect(skipped).toHaveLength(0);
    expect(items.every((i) => i.type === 'login')).toBe(true);
  });

  it('maps the fields', () => {
    const { items } = parseImport(csv);
    expect(items[0].name).toBe('GitHub');
    expect(items[0].login.username).toBe('anthony');
    expect(items[0].login.password).toBe('s3cret');
    expect(items[0].login.uris[0].uri).toBe('https://github.com/login');
  });

  it('survives commas and quotes in the password and note', () => {
    const { items } = parseImport(csv);
    expect(items[1].login.password).toBe('pa,ss"word');
    expect(items[1].notes).toBe('note, with comma');
  });

  it('gives every imported item its own id', () => {
    const { items } = parseImport(csv);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});

describe('parseImport — Bitwarden', () => {
  const csv = [
    'folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp',
    ',,login,GitHub,,,https://github.com,anthony,s3cret,otpauth://totp/x',
    ',,note,Wifi code,the code is 1234,,,,,',
    '',
  ].join('\n');

  it('detects the source and maps by type', () => {
    const { source, items } = parseImport(csv);
    expect(source).toBe('bitwarden');
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('login');
    expect(items[1].type).toBe('note');
  });

  it('carries the TOTP secret across', () => {
    const { items } = parseImport(csv);
    expect(items[0].login.totp).toBe('otpauth://totp/x');
  });

  it('imports a card with its fields', () => {
    const cardCsv = [
      'type,name,card_cardholdername,card_brand,card_number,card_expmonth,card_expyear,card_code,login_password',
      'card,My Visa,A Ettinger,Visa,4242424242424242,12,2030,123,',
      '',
    ].join('\n');

    const { items } = parseImport(cardCsv, { source: 'bitwarden' });
    expect(items[0].type).toBe('card');
    expect(items[0].card.number).toBe('4242424242424242');
    expect(items[0].card.cardholderName).toBe('A Ettinger');
  });
});

describe('parseImport — 1Password', () => {
  const csv = [
    'title,url,username,password,otpauth,notes,type',
    'GitHub,https://github.com,anthony,s3cret,,,Login',
    '',
  ].join('\n');

  it('maps title to name', () => {
    const { source, items } = parseImport(csv);
    expect(source).toBe('onepassword');
    expect(items[0].name).toBe('GitHub');
    expect(items[0].login.username).toBe('anthony');
  });
});

describe('parseImport — failure handling', () => {
  it('names an item after its host when the export had no title', () => {
    const csv = 'name,url,username,password,note\n,https://www.example.com/login,me,pw,\n';
    const { items } = parseImport(csv);
    expect(items[0].name).toBe('example.com');
  });

  it('skips blank rows rather than importing empty logins', () => {
    const csv = 'name,url,username,password,note\nGitHub,https://x,me,pw,\n,,,,\n';
    const { items, skipped } = parseImport(csv);
    expect(items).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('Empty row');
  });

  it('reports an unrecognised format instead of importing nothing silently', () => {
    const { source, items, skipped } = parseImport('foo,bar\n1,2\n');
    expect(source).toBeNull();
    expect(items).toEqual([]);
    expect(skipped[0].reason).toMatch(/Unrecognised/);
  });

  it('reports an empty file', () => {
    const { items, skipped } = parseImport('');
    expect(items).toEqual([]);
    expect(skipped[0].reason).toMatch(/No rows/);
  });
});
