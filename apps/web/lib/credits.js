/**
 * Redeemable credit codes and scarce invites (server only).
 *
 * - A credit code (@profullstack/redeem-credits, `CR-XXXX-XXXX-XXXX-XXXX`)
 *   grants days of a paid plan. The unit names the plan: `pro_days` (the
 *   default) or `team_days`. Codes are minted with scripts/credit-codes.mjs
 *   (service role) and redeemed on /dashboard/settings ("Have a code?") or
 *   via POST /api/credits/redeem.
 * - An invite (@profullstack/affiliates, `INV-XXXX-XXXX-XXXX`) is scarce:
 *   INVITE_QUOTA per account. When a NEW account joins on one, both people get
 *   INVITE_BONUS_PRO_DAYS of Pro once the new account has confirmed its email,
 *   unless the two addresses are the same mailbox, either one is a throwaway
 *   mail service, or the inviter has had
 *   INVITE_BONUS_MONTHLY_CAP bonuses in the last 30 days.
 *
 * The plan lives in one place: every grant goes through the
 * subscription_grant_days RPC, which extends public.subscriptions exactly like
 * a CoinPay payment does, so the dashboard, the extension (/api/auth/session,
 * /api/subscription) and the hourly expiry job see it with no change. The
 * credit_ledger table is the audit trail of grants; invite_bonuses records each
 * bonus decision once (claimed before the grant).
 *
 * The open affiliate link is `?ref=<code>`; the middleware keeps it in the
 * `referral_code` cookie (@profullstack/referrals' name) and sign-in records it
 * with aff.attribute(). MarkSyncr has no other referral program.
 *
 * Account ages and emails come from auth.users (GoTrue admin API), never from
 * public.users, which the "Users can update own profile" policy lets a user edit.
 *
 * Clients are built lazily and env is read with a non-literal key, so runtime
 * secrets are never inlined at build time.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { Credits, supabaseStore as creditStore } from '@profullstack/redeem-credits';
import { Affiliates, supabaseStore as affiliateStore } from '@profullstack/affiliates';

export { REF_COOKIE, refFromRequest } from '@profullstack/affiliates';

/** Unit a code grants: `<plan>_days`. pro_days is the default. */
export const PLAN_DAY_UNITS = { pro: 'pro_days', team: 'team_days' };
export const PRO_DAYS_UNIT = PLAN_DAY_UNITS.pro;
export const PLAN_LABELS = { free: 'Free', pro: 'Pro', team: 'Team' };

/** Invites every account may create. */
export const INVITE_QUOTA = 3;
/** Pro days each side gets when an invited account qualifies. */
export const INVITE_BONUS_PRO_DAYS = 7;
/** An account can hand out invites once it is this old (stops sock-puppet chains). */
export const INVITE_MIN_INVITER_AGE_DAYS = 7;
/** Only accounts at most this old can accept an invite: invites are for new people. */
export const INVITE_ACCEPT_MAX_ACCOUNT_AGE_DAYS = 7;
/** Most inviter-side bonuses one account gets in 30 days. */
export const INVITE_BONUS_MONTHLY_CAP = 10;
/** Invite codes expire after this many days. */
export const INVITE_TTL_DAYS = 30;
/** Cookie /i/<code> sets so the code survives the trip through signup. */
export const INVITE_COOKIE = 'marksyncr_invite';

const DAY_MS = 24 * 60 * 60 * 1000;
const env = (name) => process.env[name] ?? '';

/** A service-role supabase-js client, built on first use. */
let adminClient;
export function serviceClient() {
  if (!adminClient) {
    const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Supabase service role is not configured');
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}

/** Build the services over a supabase-js service-role client. */
export function buildCreditDeps(db, now = Date.now) {
  const credits = new Credits(creditStore(db), {
    now,
    onGrant: async (userId, grant, source) => {
      await applyGrant(db, userId, grant, source);
    },
  });
  const affiliates = new Affiliates(affiliateStore(db), {
    now,
    defaultQuota: INVITE_QUOTA,
    inviteTtlMs: INVITE_TTL_DAYS * DAY_MS,
  });
  return { db, credits, affiliates, now };
}

let deps;
export function getCreditDeps() {
  return (deps ??= buildCreditDeps(serviceClient()));
}

/** Test hook. */
export function setCreditDepsForTest(next) {
  deps = next;
}

export function planForUnit(unit) {
  for (const [plan, u] of Object.entries(PLAN_DAY_UNITS)) if (u === unit) return plan;
  return null;
}

/** Mirror one committed grant into public.subscriptions. */
export async function applyGrant(db, userId, grant, source) {
  const plan = planForUnit(grant.unit);
  if (!plan) {
    console.error('[credits] grant with an unknown unit ignored', { userId, unit: grant.unit, source });
    return;
  }
  const { error } = await db.rpc('subscription_grant_days', {
    p_user_id: userId,
    p_plan: plan,
    p_days: Math.round(grant.amount),
  });
  if (error) throw new Error(`subscription_grant_days: ${error.message}`);
}

// ── Plan view ─────────────────────────────────────────────────────────

export async function planView(db, userId) {
  const { data } = await db
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  const active = data?.status === 'active' && data?.plan && data.plan !== 'free';
  return {
    plan: active ? data.plan : 'free',
    status: data?.status ?? 'active',
    currentPeriodEnd: data?.current_period_end ?? null,
  };
}

// ── Credit codes ──────────────────────────────────────────────────────

export const REDEEM_MESSAGES = {
  invalid: 'That code is not valid. Check it and try again.',
  expired: 'That code has expired.',
  used_up: 'That code has already been used.',
  already_redeemed: 'You have already redeemed that code.',
  revoked: 'That code is no longer valid.',
};

export async function redeemCreditCode(userId, code, d = getCreditDeps()) {
  const r = await d.credits.redeem(String(code ?? ''), userId);
  if (!r.ok) return { ok: false, reason: r.reason, message: REDEEM_MESSAGES[r.reason] ?? r.reason };
  return {
    ok: true,
    plan: planForUnit(r.grant.unit) ?? 'pro',
    days: r.grant.amount,
    view: await planView(d.db, userId),
  };
}

export async function mintCreditCode(o, d = getCreditDeps()) {
  const plan = o.plan ?? 'pro';
  if (!(plan in PLAN_DAY_UNITS)) throw new TypeError('plan must be pro or team');
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 3660) {
    throw new TypeError('days must be a whole number from 1 to 3660');
  }
  const max = o.maxRedemptions ?? 1;
  if (!Number.isInteger(max) || max < 1 || max > 10_000) {
    throw new TypeError('maxRedemptions must be a whole number from 1 to 10000');
  }
  const label = o.label?.trim() ? o.label.trim().slice(0, 200) : undefined;
  return d.credits.mint({
    grant: { unit: PLAN_DAY_UNITS[plan], amount: o.days },
    label: label ?? `${o.days} days of MarkSyncr ${PLAN_LABELS[plan]}`,
    maxRedemptions: max,
    expiresAt: o.expiresAt ?? null,
    ...(o.createdBy ? { createdBy: o.createdBy } : {}),
  });
}

// ── Invites ───────────────────────────────────────────────────────────

/** The auth.users facts the gates need: email, confirmation, account age. */
async function authUser(db, userId) {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const u = data.user;
  return {
    id: u.id,
    email: u.email ?? null,
    confirmed: Boolean(u.email_confirmed_at),
    createdAt: u.created_at ?? null,
  };
}

function ageDays(createdAt, now) {
  if (!createdAt) return 0;
  return (now - new Date(createdAt).getTime()) / DAY_MS;
}

/** Throwaway mail services: an invite bonus is never paid to one (from ugig's spam check). */
export const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'guerrillamail.net',
  'mailinator.com', 'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com',
  'grr.la', 'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
  'tempail.com', 'tempr.email', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
  'trashmail.net', 'trashmail.me', 'mohmal.com', 'getnada.com', 'emailondeck.com',
  '10minutemail.com', 'minutemail.com', 'tempinbox.com', 'binkmail.com',
  'mailcatch.com', 'mailexpire.com', 'mailmoat.com', 'mailnull.com',
  'mytrashmail.com', 'spamfree24.org', 'spamgourmet.com', 'spamhereplease.com',
  'throwam.com', 'trash-mail.at', 'trashymail.com', 'yopmail.fr', 'yopmail.net',
  'jetable.org', 'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.org', 'harakirimail.com', 'mailforspam.com',
]);

export function isDisposableEmail(email) {
  const domain = String(email ?? '').trim().toLowerCase().split('@')[1];
  return Boolean(domain && DISPOSABLE_DOMAINS.has(domain));
}

/**
 * One mailbox, however it is spelled: lowercased, `+tag` dropped, and for
 * Gmail the dots too (googlemail.com is gmail.com).
 */
export function mailboxKey(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return null;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

async function bonusRows(db, inviteIds) {
  if (!inviteIds.length) return [];
  const { data } = await db
    .from('invite_bonuses')
    .select('invite_id, side, user_id, outcome, reason, created_at')
    .in('invite_id', inviteIds);
  return data ?? [];
}

export async function inviteOverview(userId, d = getCreditDeps()) {
  const now = d.now();
  const [quota, raw, me] = await Promise.all([
    d.affiliates.quota(userId),
    d.affiliates.invites(userId),
    authUser(d.db, userId),
  ]);
  const usedIds = raw.map((i) => i.usedBy).filter(Boolean);
  const names = new Map();
  if (usedIds.length) {
    const { data } = await d.db.from('users').select('id, name, email').in('id', usedIds);
    for (const p of data ?? []) names.set(p.id, p.name || maskEmail(p.email));
  }
  const bonuses = await bonusRows(
    d.db,
    raw.filter((i) => i.usedBy).map((i) => i.id)
  );
  const invites = raw.map((i) => {
    const mine = bonuses.find((b) => b.invite_id === i.id && b.side === 'inviter');
    return {
      id: i.id,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt,
      note: i.note,
      revokedAt: i.revokedAt ?? null,
      status: i.usedBy
        ? 'used'
        : i.revokedAt
          ? 'revoked'
          : i.expiresAt !== null && now >= i.expiresAt
            ? 'expired'
            : 'open',
      ...(i.usedBy
        ? { usedByName: names.get(i.usedBy) ?? null, bonus: mine ? mine.outcome : 'pending' }
        : {}),
    };
  });
  const canInvite = ageDays(me?.createdAt, now) >= INVITE_MIN_INVITER_AGE_DAYS;
  return {
    quota,
    invites,
    canInvite,
    unlocksAt:
      !canInvite && me?.createdAt
        ? new Date(new Date(me.createdAt).getTime() + INVITE_MIN_INVITER_AGE_DAYS * DAY_MS).toISOString()
        : null,
    bonusDays: INVITE_BONUS_PRO_DAYS,
    affiliateCode: await d.affiliates.affiliateCode(userId),
  };
}

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = String(email).split('@');
  if (!domain) return null;
  return `${local.slice(0, 2)}***@${domain}`;
}

export class InviteError extends Error {
  constructor(message, status, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export async function createInvite(userId, note = '', d = getCreditDeps()) {
  const me = await authUser(d.db, userId);
  if (!me) throw new InviteError('Account not found.', 404, 'no_account');
  if (ageDays(me.createdAt, d.now()) < INVITE_MIN_INVITER_AGE_DAYS) {
    throw new InviteError(
      `Invites unlock once your account is ${INVITE_MIN_INVITER_AGE_DAYS} days old.`,
      403,
      'too_new'
    );
  }
  try {
    return await d.affiliates.createInvite(userId, String(note ?? '').slice(0, 200));
  } catch (err) {
    if (/no invites left/i.test(err?.message ?? '')) {
      throw new InviteError('You have no invites left.', 409, 'no_invites_left');
    }
    throw err;
  }
}

export async function revokeInvite(userId, inviteId, d = getCreditDeps()) {
  const mine = (await d.affiliates.invites(userId)).find((i) => i.id === inviteId);
  if (!mine) throw new InviteError('Invite not found.', 404, 'not_found');
  if (mine.usedBy) throw new InviteError('That invite has already been used.', 409, 'used');
  await d.affiliates.revokeInvite(inviteId);
}

export const ACCEPT_MESSAGES = {
  invalid: 'That invite code is not valid.',
  expired: 'That invite has expired.',
  used: 'That invite has already been used.',
  self: 'You cannot use your own invite.',
  revoked: 'That invite was withdrawn.',
  already_invited: 'Your account has already joined on an invite.',
  not_new: `Invites are for new accounts (${INVITE_ACCEPT_MAX_ACCOUNT_AGE_DAYS} days old or less).`,
  no_account: 'Account not found.',
};

/**
 * Spend an invite on a new account and record who invited whom, then settle
 * the bonus (granted now if the email is confirmed, otherwise later).
 */
export async function acceptInvite(userId, code, d = getCreditDeps()) {
  const fail = (reason) => ({ ok: false, reason, message: ACCEPT_MESSAGES[reason] ?? reason });
  const me = await authUser(d.db, userId);
  if (!me) return fail('no_account');
  if (ageDays(me.createdAt, d.now()) > INVITE_ACCEPT_MAX_ACCOUNT_AGE_DAYS) return fail('not_new');
  if (await d.affiliates.invitedBy(userId)) return fail('already_invited');

  const r = await d.affiliates.redeemInvite(String(code ?? ''), userId);
  if (!r.ok) return fail(r.reason);

  const settled = await settleInviteBonus(userId, d);
  return {
    ok: true,
    inviterId: r.inviterId,
    inviteId: r.inviteId,
    bonus:
      settled.status === 'granted' || settled.status === 'already'
        ? 'granted'
        : settled.status === 'denied'
          ? 'denied'
          : 'pending',
  };
}

/** Claim a (invite, side) decision; false when one was already recorded. */
async function claim(db, row) {
  const { data, error } = await db
    .from('invite_bonuses')
    .upsert(row, { onConflict: 'invite_id,side', ignoreDuplicates: true })
    .select('invite_id');
  if (error) throw new Error(`invite_bonuses: ${error.message}`);
  return (data ?? []).length > 0;
}

async function unclaim(db, inviteId, side) {
  await db.from('invite_bonuses').delete().eq('invite_id', inviteId).eq('side', side);
}

async function grantSide(d, inviteId, side, userId) {
  const won = await claim(d.db, {
    invite_id: inviteId,
    side,
    user_id: userId,
    outcome: 'granted',
    reason: null,
    days: INVITE_BONUS_PRO_DAYS,
  });
  if (!won) return false;
  try {
    await d.credits.grant(
      userId,
      { unit: PRO_DAYS_UNIT, amount: INVITE_BONUS_PRO_DAYS },
      `invite:${inviteId}:${side}`
    );
  } catch (err) {
    // Let a later settle retry: nothing was granted.
    await unclaim(d.db, inviteId, side);
    throw err;
  }
  return true;
}

async function inviterBonusesLast30Days(d, inviterId) {
  const since = new Date(d.now() - 30 * DAY_MS).toISOString();
  const { data } = await d.db
    .from('invite_bonuses')
    .select('invite_id')
    .eq('user_id', inviterId)
    .eq('side', 'inviter')
    .eq('outcome', 'granted')
    .gte('created_at', since);
  return (data ?? []).length;
}

/**
 * Grant the invite bonus to both sides if the invited account qualifies now.
 * Idempotent: each side is decided once per invite. Safe to call often.
 */
export async function settleInviteBonus(inviteeId, d = getCreditDeps()) {
  const inviterId = await d.affiliates.invitedBy(inviteeId);
  if (!inviterId) return { status: 'none' };
  const invite = (await d.affiliates.invites(inviterId)).find((i) => i.usedBy === inviteeId);
  if (!invite) return { status: 'none' };

  const existing = await bonusRows(d.db, [invite.id]);
  if (existing.length >= 2) {
    const denied = existing.find((b) => b.outcome === 'denied');
    return denied
      ? { status: 'denied', reason: denied.reason ?? 'denied' }
      : { status: 'already', inviteId: invite.id, inviterId };
  }

  const [invitee, inviter] = await Promise.all([authUser(d.db, inviteeId), authUser(d.db, inviterId)]);
  if (!invitee?.confirmed) return { status: 'pending', reason: 'email not confirmed' };

  let deny = null;
  const a = mailboxKey(invitee.email);
  if (!inviter) deny = 'inviter_gone';
  else if (isDisposableEmail(invitee.email) || isDisposableEmail(inviter.email)) deny = 'disposable_email';
  else if (a && a === mailboxKey(inviter.email)) deny = 'same_mailbox';
  else if ((await inviterBonusesLast30Days(d, inviterId)) >= INVITE_BONUS_MONTHLY_CAP) deny = 'monthly_cap';
  if (deny) {
    for (const [side, uid] of [
      ['invitee', inviteeId],
      ['inviter', inviterId],
    ]) {
      await claim(d.db, { invite_id: invite.id, side, user_id: uid, outcome: 'denied', reason: deny, days: 0 });
    }
    console.warn('[invites] bonus denied', { inviteId: invite.id, inviteeId, inviterId, deny });
    return { status: 'denied', reason: deny };
  }

  const gotInvitee = await grantSide(d, invite.id, 'invitee', inviteeId);
  const gotInviter = await grantSide(d, invite.id, 'inviter', inviterId);
  return { status: gotInvitee || gotInviter ? 'granted' : 'already', inviteId: invite.id, inviterId };
}

/** Settle every used invite this user sent (cheap: at most the quota). */
export async function settleInvitesSentBy(inviterId, d = getCreditDeps()) {
  for (const inv of await d.affiliates.invites(inviterId)) {
    if (!inv.usedBy) continue;
    try {
      await settleInviteBonus(inv.usedBy, d);
    } catch (err) {
      console.error('[invites] settle failed', { inviteId: inv.id, err });
    }
  }
}

/**
 * After a sign-in, signup confirmation or dashboard visit: record a ?ref=
 * attribution, accept a pending invite (from the /i/<code> cookie or the
 * invite_code stored in the account's metadata at signup, so another browser
 * still counts), then settle any bonus. Never throws: signing in must not fail
 * on an invite.
 */
export async function onSignedIn(user, opts = {}, d) {
  const out = {};
  if (!user?.id) return out;
  try {
    d ??= getCreditDeps();
  } catch (err) {
    console.error('[credits] not configured', err?.message);
    return out;
  }
  const meta = user.user_metadata ?? {};
  const inviteCode = opts.inviteCode || meta.invite_code || null;
  const refCode = opts.refCode || meta.ref_code || null;
  try {
    if (refCode) await d.affiliates.attribute(String(refCode), user.id);
  } catch (err) {
    console.error('[affiliates] attribute failed', err?.message);
  }
  try {
    if (inviteCode && !(await d.affiliates.invitedBy(user.id))) {
      out.invite = await acceptInvite(user.id, inviteCode, d);
    } else {
      out.settled = await settleInviteBonus(user.id, d);
    }
  } catch (err) {
    console.error('[invites] sign-in settle failed', err?.message);
  }
  return out;
}

/** The public origin for links: NEXT_PUBLIC_APP_URL, else the request's host. */
export function publicOrigin(request) {
  const configured = env('NEXT_PUBLIC_APP_URL');
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured.replace(/\/$/, '');
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host && !/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? `${proto}://${host}` : 'https://marksyncr.com';
}

export function inviteUrl(origin, code) {
  return `${origin.replace(/\/$/, '')}/i/${encodeURIComponent(code)}`;
}

export function refUrl(origin, code) {
  return `${origin.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
}

/** Read one cookie from a raw Cookie header. */
export function cookieFrom(request, name) {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return v.join('=');
      }
    }
  }
  return null;
}
