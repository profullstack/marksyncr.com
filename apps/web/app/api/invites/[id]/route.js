/**
 * DELETE /api/invites/{id}
 * Withdraw one of your unused invites; the slot comes back.
 */
import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { InviteError, revokeInvite } from '@/lib/credits';

export const dynamic = 'force-dynamic';
const METHODS = ['DELETE', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, METHODS) });
}

export async function DELETE(request, { params }) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  const { id } = await params;
  try {
    await revokeInvite(user.id, String(id));
    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: err.status, headers });
    }
    console.error('[invites] revoke failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
