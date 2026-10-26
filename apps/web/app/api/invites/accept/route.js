/**
 * POST /api/invites/accept  { code }
 * Join on an invite. Only new accounts (7 days old or less) can, once each.
 * Both people get the bonus once this account's email is confirmed.
 */
import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { INVITE_COOKIE, acceptInvite } from '@/lib/credits';

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
    // missing code below
  }
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code || code.length > 64) {
    return NextResponse.json({ error: 'Enter an invite code.', reason: 'invalid' }, { status: 400, headers });
  }
  try {
    const r = await acceptInvite(user.id, code);
    const res = r.ok
      ? NextResponse.json({ ok: true, bonus: r.bonus }, { headers })
      : NextResponse.json({ error: r.message, reason: r.reason }, { status: 400, headers });
    res.cookies.set(INVITE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[invites] accept failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
