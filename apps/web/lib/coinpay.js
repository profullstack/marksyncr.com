/**
 * CoinPay hosted checkout for MarkSyncr Pro and Team.
 *
 * Crypto and PayPal payments are one-off, so a paid checkout session buys a
 * fixed term (one month or one year) of the plan. Paying again extends it.
 * The webhook and the dashboard's return check both settle through
 * settleCheckout(), which is idempotent on the checkout session id.
 */

import { CoinPay, readWebhook, verifyWebhook } from '@profullstack/coinpay-onboard';

export const PROPERTY = 'marksyncr.com';

/** USD prices per term, the same numbers the pricing page shows. */
export const PLAN_PRICES = {
  pro: { monthly: 5, yearly: 15 },
  team: { monthly: 12, yearly: 36 },
};

export const PLAN_NAMES = { pro: 'Pro', team: 'Team' };

export const PLANS = Object.keys(PLAN_PRICES);
export const INTERVALS = ['monthly', 'yearly'];

/** The USD price of a plan term, or null when the pair is not sold. */
export function planPrice(plan, interval) {
  return PLAN_PRICES[plan]?.[interval] ?? null;
}

/** The end of a term bought at `from`: one calendar month or one year later. */
export function addTerm(from, interval) {
  const end = new Date(from.getTime());
  if (interval === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

/** A CoinPay client on the site's business API key. */
export function coinpayClient(env = process.env) {
  const token = env.COINPAY_API_KEY;
  if (!token) throw new Error('COINPAY_API_KEY is not configured');
  return new CoinPay({ token, base: env.COINPAY_API_URL || undefined });
}

/**
 * Open a CoinPay hosted checkout session for a signed-in user.
 * @returns {Promise<{id: string, url: string, methods: string[]}>}
 */
export async function createCheckout({ user, plan, interval, appUrl, client = coinpayClient() }) {
  const amount = planPrice(plan, interval);
  if (amount == null) throw new Error(`Invalid plan or interval: ${plan}/${interval}`);
  if (!user?.id || !user?.email) throw new Error('A signed-in user with an email is required');

  const term = interval === 'yearly' ? '1 year' : '1 month';
  return client.createCheckoutSession({
    amount,
    currency: 'USD',
    description: `MarkSyncr ${PLAN_NAMES[plan]}, ${term}`,
    customerEmail: user.email,
    accountId: user.id,
    property: PROPERTY,
    metadata: { plan, interval, billing_period: interval, user_id: user.id },
    successUrl: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/pricing?checkout=canceled`,
    expiresInMinutes: 60,
  });
}

/** Verify the X-CoinPay-Signature header over the raw body. */
export function verifySignature(rawBody, header, secret = process.env.COINPAY_WEBHOOK_SECRET) {
  if (!secret) return false;
  try {
    return verifyWebhook(rawBody, header, secret);
  } catch {
    return false;
  }
}

export { readWebhook };

/**
 * Grant the plan a paid checkout bought. Idempotent: the first settle of a
 * checkout session records it in coinpay_payments and extends the plan; any
 * later one (confirmed then forwarded, a webhook retry, the dashboard return
 * check) changes nothing.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin service-role client
 * @param {{checkoutSessionId?: string|null, paymentId?: string|null, userId: string,
 *   plan: string, interval: string, amountUsd?: number, method?: string}} payment
 * @param {Date} [now]
 */
export async function settleCheckout(admin, payment, now = new Date()) {
  const { checkoutSessionId, paymentId, userId, plan, interval } = payment;
  if (!userId) return { handled: false, reason: 'no user_id' };
  if (planPrice(plan, interval) == null) return { handled: false, reason: 'unknown plan or interval' };
  const key = checkoutSessionId || paymentId;
  if (!key) return { handled: false, reason: 'no checkout session or payment id' };

  const { error: ledgerError } = await admin.from('coinpay_payments').insert({
    checkout_session_id: key,
    payment_id: paymentId || null,
    user_id: userId,
    plan,
    billing_period: interval,
    amount_usd: payment.amountUsd ?? null,
    method: payment.method || null,
  });
  if (ledgerError) {
    if (ledgerError.code === '23505') return { handled: true, duplicate: true, userId, plan };
    throw new Error(`coinpay_payments insert failed: ${ledgerError.message}`);
  }

  try {
    const { data: current, error: readError } = await admin
      .from('subscriptions')
      .select('plan, status, current_period_start, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    // A renewal of the same plan while it is still running extends it from its
    // current end; anything else starts a fresh term now.
    const runningEnd = current?.current_period_end ? new Date(current.current_period_end) : null;
    const extending =
      current?.plan === plan && current?.status === 'active' && runningEnd && runningEnd > now;
    const start = extending ? runningEnd : now;
    const end = addTerm(start, interval);

    const { error: upsertError } = await admin.from('subscriptions').upsert(
      {
        user_id: userId,
        plan,
        status: 'active',
        current_period_start: extending ? current.current_period_start : now.toISOString(),
        current_period_end: end.toISOString(),
        cancel_at_period_end: true,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (upsertError) throw new Error(upsertError.message);

    return { handled: true, action: extending ? 'extended' : 'activated', userId, plan, periodEnd: end.toISOString() };
  } catch (err) {
    // Let a retry settle it: drop the ledger row we just wrote.
    await admin.from('coinpay_payments').delete().eq('checkout_session_id', key);
    throw err;
  }
}

/**
 * The dashboard's return check: read the checkout session the buyer came back
 * from and, if CoinPay already marks it paid for this user, settle it now (the
 * webhook may still be on its way). Returns the session status, or null.
 */
export async function reconcileReturn(admin, sessionId, user, client = coinpayClient()) {
  if (!sessionId || !/^cs_[A-Za-z0-9_-]+$/.test(sessionId) || !user?.id) return null;
  const session = await client.checkoutSession(sessionId);
  const meta = session.metadata || {};
  const owner = meta.user_id || session.accountId;
  if (owner !== user.id) return null;
  if (session.status === 'paid') {
    await settleCheckout(admin, {
      checkoutSessionId: session.id,
      paymentId: session.paymentId || null,
      userId: user.id,
      plan: meta.plan,
      interval: meta.interval || meta.billing_period,
      amountUsd: session.amount,
      method: session.paidMethod || null,
    });
  }
  return session.status;
}
