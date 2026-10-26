import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

const { pinAccountEmail } = await import('../lib/profile.js');

function fakeStore(initial = {}) {
  const rows = { ...initial };
  return {
    rows,
    get: vi.fn(async (id) => rows[id] ?? null),
    save: vi.fn(async (id, p) => (rows[id] = { ...(rows[id] ?? {}), ...p, user_id: id })),
  };
}

describe('pinAccountEmail', () => {
  it('replaces a caller-supplied email with the account email', async () => {
    const inner = fakeStore({ u1: { email: 'me@example.com' } });
    const store = pinAccountEmail(inner, async () => 'me@example.com');
    const out = await store.save('u1', { email: 'victim@example.com', job_title: 'QA' });
    expect(out.email).toBe('me@example.com');
    expect(out.job_title).toBe('QA');
    expect(inner.save).toHaveBeenCalledWith('u1', { job_title: 'QA', email: 'me@example.com' });
  });

  it('always sends email so the upsert satisfies NOT NULL', async () => {
    const inner = fakeStore();
    const store = pinAccountEmail(inner, async () => 'me@example.com');
    await store.save('u1', { first_name: 'Sec' });
    expect(inner.save.mock.calls[0][1].email).toBe('me@example.com');
  });

  it('fillBlanks only fills empty fields and never takes email', async () => {
    const inner = fakeStore({ u1: { email: 'me@example.com', first_name: 'Keep' } });
    const store = pinAccountEmail(inner, async () => 'me@example.com');
    await store.fillBlanks('u1', { email: 'x@evil.example', first_name: 'New', last_name: 'Fill' });
    expect(inner.rows.u1).toMatchObject({ email: 'me@example.com', first_name: 'Keep', last_name: 'Fill' });
  });

  it('refuses when no account email is known', async () => {
    const store = pinAccountEmail(fakeStore(), async () => null);
    await expect(store.save('u1', { first_name: 'x' })).rejects.toThrow(/no account email/);
  });
});
