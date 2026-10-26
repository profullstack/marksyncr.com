/**
 * GET  /api/invites          your invites, quota left, bonus days and affiliate link
 * POST /api/invites { note } create an invite; the code is shown once
 * Session cookie (web) or Bearer token (extension).
 */
import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import {
  InviteError,
  createInvite,
  inviteOverview,
  inviteUrl,
  publicOrigin,
  refUrl,
  settleInvitesSentBy,
} from '@/lib/credits';

export const dynamic = 'force-dynamic';
const METHODS = ['GET', 'POST', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, METHODS) });
}

export async function GET(request) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  try {
    await settleInvitesSentBy(user.id);
    const o = await inviteOverview(user.id);
    return NextResponse.json(
      { ...o, affiliateUrl: refUrl(publicOrigin(request), o.affiliateCode) },
      { headers }
    );
  } catch (err) {
    console.error('[invites] overview failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

export async function POST(request) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  let body = {};
  try {
    body = await request.json();
  } catch {
    // no note
  }
  try {
    const invite = await createInvite(user.id, typeof body?.note === 'string' ? body.note : '');
    return NextResponse.json(
      {
        id: invite.id,
        code: invite.code,
        url: inviteUrl(publicOrigin(request), invite.code),
        expiresAt: invite.expiresAt,
      },
      { status: 201, headers }
    );
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status, headers });
    }
    console.error('[invites] create failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
