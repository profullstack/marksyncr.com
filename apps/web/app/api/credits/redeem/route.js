/**
 * POST /api/credits/redeem  { code }
 * Redeem a credit code (CR-XXXX-XXXX-XXXX-XXXX) for days of Pro (or Team).
 * The days go onto the account's subscription, the same row a CoinPay payment
 * extends. Session cookie (web) or Bearer token (extension).
 */
import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { redeemCreditCode } from '@/lib/credits';

export const dynamic = 'force-dynamic';
const METHODS = ['POST', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, METHODS) });
}

export async function POST(request) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });

  let body = {};
  try {
    body = await request.json();
  } catch {
    // fall through to the missing-code answer
  }
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code || code.length > 64) {
    return NextResponse.json(
      { error: 'Enter a code.', reason: 'invalid' },
      { status: 400, headers }
    );
  }

  try {
    const r = await redeemCreditCode(user.id, code);
    if (!r.ok) {
      return NextResponse.json({ error: r.message, reason: r.reason }, { status: 400, headers });
    }
    return NextResponse.json(
      { ok: true, plan: r.plan, days: r.days, subscription: r.view },
      { headers }
    );
  } catch (err) {
    console.error('[credits] redeem failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
