import pkg from '../package.json';

/**
 * Names marksyncr.com on every server-side call to CoinPay (checkout sessions,
 * payment lookups, OAuth token + userinfo), so CoinPay's logs and throttle can
 * tell the fleet's apps (all on one IP) apart instead of seeing `node`.
 * The crawl gate's x402 calls are named by @profullstack/x402-gateway itself.
 */
export const COINPAY_UA = `marksyncr.com/${pkg.version} (+https://marksyncr.com)`;

/** fetch with our User-Agent added (kept if the caller already set one). */
export function coinpayFetch(input, init = {}) {
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has('user-agent')) headers.set('user-agent', COINPAY_UA);
  return fetch(input, { ...init, headers });
}
