/**
 * Credit codes and invites (lib/credits.js): codes grant plan days through
 * subscription_grant_days, invites pay both sides once, gates refuse the
 * same mailbox, throwaway domains, old accounts and the monthly cap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { Credits, memoryStore as creditMemory } from '@profullstack/redeem-credits';
import { Affiliates, memoryStore as affMemory } from '@profullstack/affiliates';
import {
  INVITE_BONUS_PRO_DAYS,
  INVITE_BONUS_MONTHLY_CAP,
  acceptInvite,
  applyGrant,
  createInvite,
  isDisposableEmail,
  mailboxKey,
  mintCreditCode,
  onSignedIn,
  publicOrigin,
  redeemCreditCode,
  settleInviteBonus,
} from '@/lib/credits';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-26T12:00:00Z');

/** Chainable in-memory stand-in for the parts of supabase-js lib/credits uses. */
function fakeDb({ users = {} } = {}) {
  const tables = { invite_bonuses: [], subscriptions: [], users: [] };
  const grants = [];

  function builder(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let opts = {};
    const rows = () => (tables[table] ||= []);
    const match = (r) => filters.every((f) => f(r));
    const run = () => {
      if (op === 'upsert') {
        const keys = opts.onConflict.split(',');
        const hit = rows().find((r) => keys.every((k) => r[k] === payload[k]));
        if (hit) return { data: opts.ignoreDuplicates ? [] : [hit], error: null };
        const row = { created_at: new Date(NOW).toISOString(), ...payload };
        rows().push(row);
        return { data: [row], error: null };
      }
      if (op === 'delete') {
        tables[table] = rows().filter((r) => !match(r));
        return { data: null, error: null };
      }
      return { data: rows().filter(match), error: null };
    };
    const b = {
      select: () => b,
      eq: (c, v) => (filters.push((r) => r[c] === v), b),
      in: (c, vs) => (filters.push((r) => vs.includes(r[c])), b),
      gte: (c, v) => (filters.push((r) => r[c] >= v), b),
      upsert: (row, o) => ((op = 'upsert'), (payload = row), (opts = o), b),
      delete: () => ((op = 'delete'), b),
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  }

  return {
    tables,
    grants,
    from: builder,
    rpc: async (fn, args) => {
      if (fn !== 'subscription_grant_days') return { data: null, error: { message: 'no such fn' } };
      grants.push(args);
      return { data: null, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id) =>
          users[id] ? { data: { user: { id, ...users[id] } }, error: null } : { data: { user: null }, error: { message: 'not found' } },
      },
    },
  };
}

function deps(db, now = () => NOW) {
  const credits = new Credits(creditMemory(), {
    now,
    onGrant: (userId, grant, source) => applyGrant(db, userId, grant, source),
  });
  const affiliates = new Affiliates(affMemory(), { now, defaultQuota: 3, inviteTtlMs: 30 * DAY });
  return { db, credits, affiliates, now };
}

const old = new Date(NOW - 60 * DAY).toISOString();
const fresh = new Date(NOW - 1 * DAY).toISOString();
const confirmed = new Date(NOW - DAY).toISOString();

describe('helpers', () => {
  it('mailboxKey folds case, +tags and gmail dots', () => {
    expect(mailboxKey('A.B+x@GoogleMail.com')).toBe('ab@gmail.com');
    expect(mailboxKey('a.b+x@example.com')).toBe('a.b@example.com');
    expect(mailboxKey('nope')).toBeNull();
  });
  it('flags throwaway domains', () => {
    expect(isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@example.com')).toBe(false);
  });
  it('publicOrigin never returns localhost', () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    const req = new Request('http://localhost:3000/api/invites', { headers: { host: 'localhost:3000' } });
    expect(publicOrigin(req)).toBe('https://marksyncr.com');
    const req2 = new Request('http://x/api', { headers: { host: 'marksyncr.com', 'x-forwarded-proto': 'https' } });
    expect(publicOrigin(req2)).toBe('https://marksyncr.com');
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});

describe('credit codes', () => {
  let db;
  let d;
  beforeEach(() => {
    db = fakeDb();
    d = deps(db);
  });

  it('a Pro code grants its days once through subscription_grant_days', async () => {
    const { code } = await mintCreditCode({ days: 30 }, d);
    const r = await redeemCreditCode('u1', code.toLowerCase().replace(/-/g, ' '), d);
    expect(r).toMatchObject({ ok: true, plan: 'pro', days: 30 });
    expect(db.grants).toEqual([{ p_user_id: 'u1', p_plan: 'pro', p_days: 30 }]);

    const again = await redeemCreditCode('u1', code, d);
    expect(again).toMatchObject({ ok: false, reason: 'already_redeemed' });
    const other = await redeemCreditCode('u2', code, d);
    expect(other).toMatchObject({ ok: false, reason: 'used_up' });
    expect(db.grants).toHaveLength(1);
  });

  it('a Team code grants team days', async () => {
    const { code } = await mintCreditCode({ days: 7, plan: 'team' }, d);
    await redeemCreditCode('u1', code, d);
    expect(db.grants[0]).toMatchObject({ p_plan: 'team', p_days: 7 });
  });

  it('refuses bad codes and bad mints', async () => {
    expect(await redeemCreditCode('u1', 'CR-0000-0000-0000-0000', d)).toMatchObject({ ok: false, reason: 'invalid' });
    await expect(mintCreditCode({ days: 0 }, d)).rejects.toThrow(/days/);
    await expect(mintCreditCode({ days: 5, plan: 'gold' }, d)).rejects.toThrow(/plan/);
  });
});

describe('invites', () => {
  const users = {
    alice: { email: 'alice@example.com', email_confirmed_at: confirmed, created_at: old },
    bob: { email: 'bob@example.com', email_confirmed_at: confirmed, created_at: fresh },
    carol: { email: 'carol@example.com', email_confirmed_at: null, created_at: fresh },
    dave: { email: 'dave@example.com', email_confirmed_at: confirmed, created_at: old },
    alias: { email: 'Alice+2@example.com', email_confirmed_at: confirmed, created_at: fresh },
    temp: { email: 't@mailinator.com', email_confirmed_at: confirmed, created_at: fresh },
    newbie: { email: 'n@example.com', email_confirmed_at: confirmed, created_at: fresh },
  };
  let db;
  let d;
  beforeEach(() => {
    db = fakeDb({ users });
    d = deps(db);
  });

  it('a new confirmed account pays both sides once', async () => {
    const inv = await createInvite('alice', 'for Bob', d);
    const r = await acceptInvite('bob', inv.code, d);
    expect(r).toMatchObject({ ok: true, bonus: 'granted' });
    expect(db.grants).toEqual([
      { p_user_id: 'bob', p_plan: 'pro', p_days: INVITE_BONUS_PRO_DAYS },
      { p_user_id: 'alice', p_plan: 'pro', p_days: INVITE_BONUS_PRO_DAYS },
    ]);
    expect(await settleInviteBonus('bob', d)).toMatchObject({ status: 'already' });
    expect(db.grants).toHaveLength(2);

    // A second invite for the same account is refused and stays unused.
    const inv2 = await createInvite('dave', '', d);
    expect(await acceptInvite('bob', inv2.code, d)).toMatchObject({ ok: false, reason: 'already_invited' });
    expect(db.grants).toHaveLength(2);
  });

  it('waits for email confirmation, then pays on a later sign-in', async () => {
    const inv = await createInvite('alice', '', d);
    expect(await acceptInvite('carol', inv.code, d)).toMatchObject({ ok: true, bonus: 'pending' });
    expect(db.grants).toHaveLength(0);
    users.carol.email_confirmed_at = confirmed;
    await onSignedIn({ id: 'carol', user_metadata: {} }, {}, d);
    expect(db.grants.map((g) => g.p_user_id)).toEqual(['carol', 'alice']);
    users.carol.email_confirmed_at = null;
  });

  it('accepts the invite stored in user metadata at signup (another browser)', async () => {
    const inv = await createInvite('alice', '', d);
    const out = await onSignedIn({ id: 'newbie', user_metadata: { invite_code: inv.code } }, {}, d);
    expect(out.invite).toMatchObject({ ok: true, bonus: 'granted' });
  });

  it('denies the same mailbox and throwaway domains', async () => {
    const a = await createInvite('alice', '', d);
    expect(await acceptInvite('alias', a.code, d)).toMatchObject({ ok: true, bonus: 'denied' });
    const b = await createInvite('alice', '', d);
    expect(await acceptInvite('temp', b.code, d)).toMatchObject({ ok: true, bonus: 'denied' });
    expect(db.grants).toHaveLength(0);
    expect(db.tables.invite_bonuses.map((r) => r.reason).sort()).toEqual([
      'disposable_email',
      'disposable_email',
      'same_mailbox',
      'same_mailbox',
    ]);
  });

  it('refuses old accounts, too-new inviters and self-invites', async () => {
    const inv = await createInvite('alice', '', d);
    expect(await acceptInvite('dave', inv.code, d)).toMatchObject({ ok: false, reason: 'not_new' });
    await expect(createInvite('bob', '', d)).rejects.toMatchObject({ reason: 'too_new' });
    expect(await acceptInvite('alice', inv.code, d)).toMatchObject({ ok: false, reason: 'not_new' });
  });

  it('stops inviter bonuses at the monthly cap', async () => {
    for (let i = 0; i < INVITE_BONUS_MONTHLY_CAP; i++) {
      db.tables.invite_bonuses.push({
        invite_id: `old${i}`,
        side: 'inviter',
        user_id: 'alice',
        outcome: 'granted',
        created_at: new Date(NOW - DAY).toISOString(),
      });
    }
    const inv = await createInvite('alice', '', d);
    expect(await acceptInvite('bob', inv.code, d)).toMatchObject({ ok: true, bonus: 'denied' });
    expect(db.grants).toHaveLength(0);
  });

  it('onSignedIn never throws', async () => {
    const broken = { ...d, affiliates: { invitedBy: () => Promise.reject(new Error('down')), attribute: () => Promise.reject(new Error('down')) } };
    await expect(onSignedIn({ id: 'x', user_metadata: { ref_code: 'ABCD1234' } }, {}, broken)).resolves.toEqual({});
  });
});
