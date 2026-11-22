/**
 * POST /api/checkout/pro and /api/checkout/team
 *
 * The form on /checkout/<tier> (@profullstack/checkout). The term is priced on
 * the server, a CoinPay hosted checkout is opened for the signed-in buyer and
 * the answer is a 303 to it (JSON when asked for). A signed-out post goes to
 * /login; a post from another site is refused.
 */

import { checkoutFor } from '@/lib/checkout';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { tier } = await params;
  const checkout = checkoutFor(String(tier || '').toLowerCase());
  if (!checkout) {
    return new Response(JSON.stringify({ error: 'Invalid plan' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return checkout.POST(request);
}
