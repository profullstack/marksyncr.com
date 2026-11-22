/**
 * The checkout pages, /checkout/pro and /checkout/team (@profullstack/checkout).
 *
 * One page per plan; its options are the two terms that plan is sold for. The
 * page and the form handler come from the package. The prices are PLAN_PRICES
 * and the payment is opened by createCheckout() in lib/coinpay.js, the same
 * function POST /api/checkout calls, so CoinPay, the webhook and
 * settleCheckout() receive exactly what they always have.
 */

import { createCheckout as createCheckoutPage } from '@profullstack/checkout';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { PLANS, PLAN_NAMES, createCheckout as openCoinPayCheckout, planPrice } from '@/lib/coinpay';

/** The plans with a checkout page. */
export const TIERS = PLANS;

/**
 * The terms a plan is sold for. The option id is the `interval` lib/coinpay.js
 * knows, so `/checkout/pro?plan=yearly` preselects the year.
 */
export const TERMS = [
  { id: 'yearly', name: '1 year', months: 12, popular: true },
  { id: 'monthly', name: '1 month', months: 1 },
];

/** The public origin, read when called (as POST /api/checkout does). */
export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://marksyncr.com';
}

/** The option cards for a plan: each term, priced at its whole-term total. */
export function termOptions(tier) {
  return TERMS.map((term) => ({ ...term, price: planPrice(tier, term.id) }));
}

/**
 * pay(order) for one plan: opens the CoinPay hosted checkout through
 * createCheckout() in lib/coinpay.js. Refuses to open a payment when what
 * CoinPay would be asked to charge is not what the page priced.
 */
export function payFor(tier, { open = openCoinPayCheckout } = {}) {
  return async function pay(order) {
    const interval = order.option.id;
    const amount = planPrice(tier, interval);
    if (amount == null) throw new Error(`Invalid plan or interval: ${tier}/${interval}`);
    if (order.quantity !== 1 || Math.round(amount * 100) !== order.totalCents) {
      throw new Error(
        `Checkout amount mismatch for ${tier}/${interval}: priced ${order.totalCents} cents x ${order.quantity}, plan is ${Math.round(amount * 100)} cents`
      );
    }
    const session = await open({
      user: { id: order.account.id, email: order.account.email },
      plan: tier,
      interval,
      appUrl: appUrl(),
    });
    return { url: session.url, id: session.id };
  };
}

/** The signed-in buyer (session cookie, or the extension's Bearer token), or null. */
export async function checkoutAccount(request) {
  const { user } = await getAuthenticatedUser(request);
  return user ? { id: user.id, email: user.email || '' } : null;
}

/** The config for one plan's page. `open` is for tests. */
export function checkoutConfig(tier, { open } = {}) {
  return {
    site: 'marksyncr.com',
    title: `MarkSyncr ${PLAN_NAMES[tier]}`,
    subtitle: 'Each payment buys one month or one year. Nothing renews automatically.',
    action: `/api/checkout/${tier}`,
    page: `/checkout/${tier}`,
    optionsLabel: 'Term',
    options: termOptions(tier),
    requireAccount: true,
    signIn: '/login',
    // The app sits behind nginx: the browser's Origin is the public address.
    siteUrl: appUrl(),
    account: checkoutAccount,
    pay: payFor(tier, { open }),
  };
}

const built = new Map();

/**
 * The checkout for a plan, or null for anything that is not sold. Built on
 * first use, not at module load: appUrl() reads the environment.
 */
export function checkoutFor(tier) {
  if (!TIERS.includes(tier)) return null;
  if (!built.has(tier)) built.set(tier, createCheckoutPage(checkoutConfig(tier)));
  return built.get(tier);
}
