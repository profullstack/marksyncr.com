/**
 * GET /api/credits
 * The signed-in user's plan as codes and invites see it: plan, status and the
 * date it runs to. Session cookie (web) or Bearer token (extension).
 */
import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { getCreditDeps, planView } from '@/lib/credits';

export const dynamic = 'force-dynamic';
const METHODS = ['GET', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, METHODS) });
}

export async function GET(request) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  try {
    const view = await planView(getCreditDeps().db, user.id);
    return NextResponse.json(view, { headers });
  } catch (err) {
    console.error('[credits] view failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
