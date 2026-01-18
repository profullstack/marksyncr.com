/**
 * POST /api/auth/logout
 * Sign out the current user
 *
 * For extension clients that use Bearer tokens, this endpoint simply
 * acknowledges the logout. The actual session invalidation happens
 * client-side by clearing the stored tokens.
 *
 * For web clients that use cookies, we use the cookie-based client
 * to properly clear the session.
 */

import { NextResponse } from 'next/server';
import { createClient, createStatelessClient } from '@/lib/supabase/server';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');

    // If request has Bearer token (from extension), use stateless approach
    // The extension will clear its local tokens, we just acknowledge
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // For stateless clients, we can optionally revoke the token
      // but Supabase doesn't have a direct token revocation API
      // The token will naturally expire
      return NextResponse.json({
        message: 'Logged out successfully',
      });
    }

    // For cookie-based clients (web app), use the cookie-based client
    const supabase = await createClient();

    // Use scope: 'local' to only sign out the current session
    // This allows users to stay logged in on other devices/browsers
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
