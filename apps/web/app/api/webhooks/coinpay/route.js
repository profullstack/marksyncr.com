/**
 * CoinPay webhook: POST /api/webhooks/coinpay
 *
 * Verifies X-CoinPay-Signature over the raw body, then on a paid event
 * (payment.confirmed, including a PayPal capture with status 'completed', or
 * payment.forwarded) grants the plan term the checkout session bought.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { PROPERTY, readWebhook, settleCheckout, verifySignature } from '@/lib/coinpay';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-coinpay-signature');

  if (!verifySignature(rawBody, signature)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const event = readWebhook(payload);
  if (!event.paid) {
    return json({ received: true, handled: false, type: event.type, status: event.status });
  }
  if (event.property && event.property !== PROPERTY) {
    return json({ received: true, handled: false, reason: 'other property' });
  }

  const meta = event.metadata || {};
  try {
    const result = await settleCheckout(createAdminClient(), {
      checkoutSessionId: event.checkoutSessionId,
      paymentId: event.paymentId,
      userId: meta.user_id || event.accountId,
      plan: meta.plan,
      interval: meta.interval || meta.billing_period,
      amountUsd: event.amountUsd,
      method: event.method,
    });
    console.log(`CoinPay webhook ${event.type}`, result);
    return json({ received: true, ...result });
  } catch (err) {
    console.error('CoinPay webhook settle failed:', err);
    return json({ error: 'Settle failed' }, 500);
  }
}
