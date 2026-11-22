/**
 * POST /api/checkout
 *
 * Opens a CoinPay hosted checkout session for Pro or Team (one month or one
 * year) and hands back its URL; the buyer picks a coin or PayPal there.
 * JSON callers (the extension, scripts) get { sessionId, url }; a plain HTML
 * form post is redirected straight to it.
 *
 * The site's own buy buttons now go through the checkout page instead:
 * /checkout/<tier>, which posts to /api/checkout/<tier> (lib/checkout.js).
 */

import { getAuthenticatedUser } from '@/lib/auth-helper';
import { INTERVALS, PLANS, createCheckout } from '@/lib/coinpay';

export const dynamic = 'force-dynamic';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readInput(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return { form: false, ...(await request.json().catch(() => ({}))) };
  }
  const data = await request.formData().catch(() => null);
  return {
    form: true,
    plan: data?.get('plan') || undefined,
    interval: data?.get('interval') || undefined,
  };
}

export async function POST(request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marksyncr.com';
  let input;
  try {
    input = await readInput(request);
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const plan = String(input.plan || '').toLowerCase();
  const interval = String(input.interval || 'monthly').toLowerCase();

  if (!PLANS.includes(plan)) return json({ error: 'Invalid plan' }, 400);
  if (!INTERVALS.includes(interval)) return json({ error: 'Invalid interval' }, 400);

  const { user } = await getAuthenticatedUser(request);
  if (!user) {
    if (input.form) return Response.redirect(`${appUrl}/login`, 303);
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const session = await createCheckout({ user, plan, interval, appUrl });
    if (input.form) return Response.redirect(session.url, 303);
    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return json({ error: 'Could not start checkout. Please try again.' }, 502);
  }
}
