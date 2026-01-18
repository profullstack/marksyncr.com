/**
 * POST /api/auth/refresh
 * Refresh the access token using a refresh token
 *
 * Uses a stateless Supabase client to avoid cookie-based session management.
 * This allows multiple devices/browsers to maintain independent sessions.
 */

import { NextResponse } from 'next/server';
import { createStatelessClient } from '@/lib/supabase/server';

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
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json({ error: 'Refresh token is required' }, { status: 400 });
    }

    // Use stateless client to avoid cookie-based session management
    // This allows multiple devices to have independent sessions
    const supabase = createStatelessClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
