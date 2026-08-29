/**
 * Tests for the interstitial warning page's URL handling.
 *
 * The blocked URL arrives in the page fragment straight from a site the user
 * was warned about, so it is hostile input: it must never become a javascript:
 * navigation target or reach the DOM as markup.
 * @module __tests__/blocked-page.test
 */

import { describe, it, expect } from 'vitest';
import { blockedUrlFromHash, hostnameOf } from '../src/blocked/main.js';

describe('blockedUrlFromHash', () => {
  it('reads the blocked URL the redirect rule put in the fragment', () => {
    expect(blockedUrlFromHash('#https://evil.example/login')).toBe('https://evil.example/login');
  });

  it('accepts a percent-encoded URL', () => {
    expect(blockedUrlFromHash('#https%3A%2F%2Fevil.example%2Fa%3Fb%3D1')).toBe(
      'https://evil.example/a?b=1'
    );
  });

  it('accepts http as well as https', () => {
    expect(blockedUrlFromHash('#http://evil.example/')).toBe('http://evil.example/');
  });

  it.each([
    ['javascript:', '#javascript:alert(1)'],
    ['data:', '#data:text/html,<script>alert(1)</script>'],
    ['file:', '#file:///etc/passwd'],
    ['a bare word', '#notaurl'],
    ['empty', '#'],
    ['nothing at all', ''],
  ])('refuses %s', (_label, hash) => {
    expect(blockedUrlFromHash(hash)).toBe('');
  });
});

describe('hostnameOf', () => {
  it('names the site, without www', () => {
    expect(hostnameOf('https://www.evil.example/login')).toBe('evil.example');
  });

  it('keeps a meaningful subdomain', () => {
    expect(hostnameOf('https://login.evil.example/')).toBe('login.evil.example');
  });

  it('is empty for junk, so the page offers no bypass', () => {
    expect(hostnameOf('')).toBe('');
    expect(hostnameOf('notaurl')).toBe('');
  });
});
