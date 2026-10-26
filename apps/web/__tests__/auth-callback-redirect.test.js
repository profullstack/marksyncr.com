import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/credits', () => ({
  INVITE_COOKIE: 'marksyncr_invite',
  REF_COOKIE: 'marksyncr_ref',
  onSignedIn: vi.fn(),
}));

const { GET } = await import('../app/auth/callback/route.js');

const callback = (qs) => GET(new Request(`https://marksyncr.com/auth/callback${qs}`));

describe('/auth/callback next=', () => {
  it.each([
    '?next=https://evil.example',
    '?next=//evil.example',
    '?next=/%5Cevil.example',
    '?next=%2F%09%2Fevil.example',
  ])('ignores an off-site target (%s)', async (qs) => {
    const res = await callback(qs);
    const loc = new URL(res.headers.get('location'));
    expect(loc.host).not.toBe('evil.example');
    expect(loc.pathname).toBe('/dashboard');
  });

  it('keeps a same-origin path', async () => {
    const res = await callback('?next=/invites');
    expect(new URL(res.headers.get('location')).pathname).toBe('/invites');
  });

  it('defaults to /dashboard', async () => {
    const res = await callback('');
    expect(new URL(res.headers.get('location')).pathname).toBe('/dashboard');
  });
});
