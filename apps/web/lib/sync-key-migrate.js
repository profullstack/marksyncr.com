/**
 * One-shot migration of a user's PLAINTEXT sync-source tokens to sealed v2,
 * run inside the request in which their extension registers a sync key (the
 * public key is all sealing needs). Each value is sealed and written back in
 * the same update; rows already sealed are left alone.
 */
import { isSealedToken, sealToPublicKey } from './sealed-tokens.js';

export const TOKEN_FIELDS = ['access_token', 'refresh_token'];

/** Pure: the patch that seals one row's plaintext tokens, or null. */
export function sealRowPatch(row, userId, publicKey) {
  const patch = {};
  for (const f of TOKEN_FIELDS) {
    const v = row[f];
    if (typeof v === 'string' && v && !isSealedToken(v))
      patch[f] = sealToPublicKey(publicKey, v, userId, f);
  }
  return Object.keys(patch).length ? patch : null;
}

export async function migrateUserTokens(admin, userId, publicKey) {
  const { data: rows } = await admin
    .from('sync_sources')
    .select('id, access_token, refresh_token')
    .eq('user_id', userId);
  let migrated = 0;
  for (const row of rows ?? []) {
    const patch = sealRowPatch(row, userId, publicKey);
    if (!patch) continue;
    const { error } = await admin
      .from('sync_sources')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!error) migrated++;
  }
  return migrated;
}
