/**
 * Server side of sync-token sealing (seal v2). The node:crypto twin of
 * packages/vault/src/sync-key.js — same bytes, so the extension opens what this
 * seals.
 *
 * The server can SEAL a provider token (OAuth callback, Dropbox refresh) to the
 * user's sync public key, and can never open one: the private key lives under
 * the user's vault key in their extension. A sync that needs a token gets it
 * from the extension, in that request only (`sourceTokens`).
 */

import {
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  createCipheriv,
  randomBytes,
} from 'node:crypto';

export const SEALED_PREFIX = 'v2:';

export const LOCKED_MESSAGE =
  'locked: unlock your MarkSyncr vault in the extension so it can hand this sync its token';
export const SEAL_REQUIRED_MESSAGE =
  'set up the MarkSyncr vault in the extension first (it holds the key that seals your provider tokens)';

export function isSealedToken(v) {
  return typeof v === 'string' && v.startsWith(SEALED_PREFIX);
}

/**
 * Until LEGACY_KEY_MIGRATION=off, a row still holding a PLAINTEXT token (written
 * before seal v2) keeps syncing; it is sealed the moment its owner's extension
 * registers a sync key. Off = plaintext rows are ignored (owner reconnects).
 */
export function plaintextFallbackEnabled() {
  const v = String(process.env.LEGACY_KEY_MIGRATION ?? 'on')
    .trim()
    .toLowerCase();
  return !(v === 'off' || v === '0' || v === 'false');
}

function rawToPublicKey(raw) {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('bad P-256 public key');
  return createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: raw.subarray(1, 33).toString('base64url'),
      y: raw.subarray(33).toString('base64url'),
    },
    format: 'jwk',
  });
}

/** Seal a token to a user's sync public key (base64 raw P-256). */
export function sealToPublicKey(publicKeyB64, plaintext, userId, field) {
  const recipient = rawToPublicKey(Buffer.from(publicKeyB64, 'base64'));
  const eph = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
  const jwk = eph.publicKey.export({ format: 'jwk' });
  const epk = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  try {
    const key = Buffer.from(
      hkdfSync('sha256', shared, epk, `marksyncr/box/v2/${userId}/${field}`, 32)
    );
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    c.setAAD(Buffer.from(`marksyncr:v2:${userId}:${field}`, 'utf8'));
    const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
    const body = {
      e: epk.toString('base64'),
      c: ct.toString('base64'),
      i: iv.toString('base64'),
      t: c.getAuthTag().toString('base64'),
    };
    return SEALED_PREFIX + Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  } finally {
    shared.fill(0);
  }
}

/** The user's sync public key, or null when their extension has not registered one. */
export async function syncPublicKey(supabase, userId) {
  try {
    const { data } = await supabase
      .from('sync_source_keys')
      .select('public_key')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.public_key ?? null;
  } catch {
    return null;
  }
}

/**
 * The token a sync may use for this source: the one the extension sent with
 * this request (sealed rows), or the legacy plaintext column while the
 * fallback is on. null = locked; the caller skips this source.
 */
export function tokenForSync(source, sourceTokens, field = 'access_token') {
  const stored = source?.[field];
  if (!stored) return null;
  if (isSealedToken(stored)) {
    const sent = sourceTokens?.[source.provider]?.[field];
    return typeof sent === 'string' && sent ? sent : null;
  }
  return plaintextFallbackEnabled() ? stored : null;
}
