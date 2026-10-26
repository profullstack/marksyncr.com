import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../lib/safe-redirect.js';

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/dashboard/settings#code', '/dashboard/settings#code'],
    ['/invites?tab=sent', '/invites?tab=sent'],
    ['/', '/'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    'https://evil.example',
    'http://evil.example/dashboard',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\/evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    ' /dashboard',
    'javascript:alert(1)',
    'data:text/html,hi',
    'dashboard',
    'evil.example',
    '',
    null,
    undefined,
    '/a'.repeat(2000),
  ])('falls back for %j', (input) => {
    expect(safeNextPath(input)).toBe('/dashboard');
  });

  it('uses the given fallback', () => {
    expect(safeNextPath('https://evil.example', '/login')).toBe('/login');
  });
});
