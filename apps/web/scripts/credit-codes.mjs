#!/usr/bin/env node
/**
 * Mint, list and revoke MarkSyncr credit codes (service role).
 *
 *   node --env-file=/home/anthony/www/marksyncr.com/app.env apps/web/scripts/credit-codes.mjs mint --days 30 [--plan pro|team] [--max 1] [--label "For Preshy"] [--expires 2026-12-31]
 *   ... list
 *   ... revoke <codeId>
 *
 * A code adds that many days of the plan to whoever redeems it, through the
 * same subscription_grant_days path as invite bonuses (see lib/credits.js).
 * The plaintext code is printed once; only its sha256 is stored.
 */
import { createClient } from '@supabase/supabase-js';
import { Credits, supabaseStore } from '@profullstack/redeem-credits';

const UNITS = { pro: 'pro_days', team: 'team_days' };
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file app.env).');
  process.exit(2);
}
const credits = new Credits(
  supabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }))
);

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};

if (cmd === 'mint') {
  const plan = opt('plan', 'pro');
  const days = Number(opt('days'));
  const max = Number(opt('max', '1'));
  const expires = opt('expires');
  if (!UNITS[plan]) throw new Error('--plan must be pro or team');
  if (!Number.isInteger(days) || days < 1 || days > 3660) throw new Error('--days must be 1..3660');
  const minted = await credits.mint({
    grant: { unit: UNITS[plan], amount: days },
    label: opt('label', `${days} days of MarkSyncr ${plan === 'team' ? 'Team' : 'Pro'}`),
    maxRedemptions: max,
    expiresAt: expires ? new Date(expires).getTime() : null,
    createdBy: opt('by', 'cli'),
  });
  console.log(JSON.stringify(minted, null, 2));
  console.log(`\nRedeem at https://marksyncr.com/dashboard/settings#code`);
} else if (cmd === 'list') {
  for (const c of await credits.list()) {
    console.log(
      [c.id, c.grant.unit, c.grant.amount, `${c.redemptions}/${c.maxRedemptions}`, c.revokedAt ? 'revoked' : '', c.label].join('\t')
    );
  }
} else if (cmd === 'revoke' && rest[0]) {
  await credits.revoke(rest[0]);
  console.log('revoked', rest[0]);
} else {
  console.error('usage: credit-codes.mjs mint --days N [--plan pro|team] [--max N] [--label TEXT] [--expires DATE] | list | revoke <id>');
  process.exit(2);
}
