import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { authorizeUrl, pkce, randomToken, SIGN_IN_SCOPES } from '@profullstack/coinpay-onboard/oauth';

export const COINPAY_STATE_COOKIE = 'marksyncr_coinpay_state';
export const COINPAY_STATE_PATH = '/api/coinpay';
export const COINPAY_CALLBACK_PATH = '/api/coinpay/callback';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function coinpayConfig(env = process.env) {
  const clientId = env['COINPAY_OAUTH_CLIENT_ID'];
  const clientSecret = env['COINPAY_OAUTH_CLIENT_SECRET'];
  if (!clientId || !clientSecret) return null;
  const appUrl = (env['NEXT_PUBLIC_APP_URL'] || 'https://marksyncr.com').replace(/\/$/, '');
  return { clientId, clientSecret, appUrl, redirectUri: `${appUrl}${COINPAY_CALLBACK_PATH}` };
}

function mac(secret, payload) {
  return createHmac('sha256', `marksyncr-coinpay-state:${secret}`).update(payload).digest('base64url');
}

export function beginCoinpayLink(config, userId, now = Date.now()) {
  const { verifier, challenge } = pkce();
  const pending = {
    state: randomToken(),
    nonce: randomToken(),
    verifier,
    userId,
    exp: now + STATE_MAX_AGE_MS,
  };
  const payload = Buffer.from(JSON.stringify(pending)).toString('base64url');
  return {
    url: authorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state: pending.state,
      nonce: pending.nonce,
      challenge,
      scopes: SIGN_IN_SCOPES,
    }),
    cookie: `${payload}.${mac(config.clientSecret, payload)}`,
  };
}

export function openCoinpayPending(value, secret, now = Date.now()) {
  if (!value || value.length > 4000) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(mac(secret, payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const pending = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof pending.userId !== 'string' ||
      typeof pending.state !== 'string' ||
      typeof pending.nonce !== 'string' ||
      typeof pending.verifier !== 'string' ||
      typeof pending.exp !== 'number' ||
      pending.exp < now
    )
      return null;
    return pending;
  } catch {
    return null;
  }
}

export function sameCoinpayState(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function coinpayStateCookieOptions(secure, maxAge = 600) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: COINPAY_STATE_PATH,
    maxAge,
  };
}
