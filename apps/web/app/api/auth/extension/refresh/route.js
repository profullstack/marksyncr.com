/**
 * POST /api/auth/extension/refresh
 * Refresh access token using extension session token
 *
 * This endpoint allows the browser extension to get a fresh access token
 * using its long-lived extension_token. This is the key to maintaining
 * persistent sessions in the extension.
 *
 * Flow:
 * 1. Extension sends its extension_token
 * 2. Server looks up the session by token hash
 * 3. If valid and not expired, server uses stored refresh_token to get new access_token
 * 4. Returns new access_token to extension
 *
 * The extension_token itself doesn't expire for 1 year, but the access_token
 * it returns is short-lived (1 hour) for security.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

/**
 * Hash a token for lookup
 * @param {string} token - The token to hash
 * @returns {string} SHA-256 hash of the token
 */
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

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
    // Validate environment variables
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Extension refresh error: Missing service role key');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { extension_token } = body || {};

    if (!extension_token) {
      return NextResponse.json(
        { error: 'Extension token is required' },
        { status: 400 }
      );
    }

    // Step 1: Hash the token for lookup
    const tokenHash = hashToken(extension_token);

    // Step 2: Look up the session in the database
    const adminClient = createAdminClient();
    
    const { data: session, error: lookupError } = await adminClient
      .from('extension_sessions')
      .select('id, user_id, supabase_refresh_token, expires_at, revoked_at')
      .eq('extension_token_hash', tokenHash)
      .maybeSingle();

    if (lookupError) {
      console.error('Extension refresh error: Database lookup failed:', lookupError);
      return NextResponse.json(
        { error: 'Failed to validate session' },
        { status: 500 }
      );
    }

    // Step 3: Validate session exists
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired extension token' },
        { status: 401 }
      );
    }

    // Step 4: Check if session is revoked
    if (session.revoked_at) {
      return NextResponse.json(
        { error: 'Extension session has been revoked. Please log in again.' },
        { status: 401 }
      );
    }

    // Step 5: Check if session is expired
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Extension session expired. Please log in again.' },
        { status: 401 }
      );
    }

    // Step 6: Use the stored refresh token to get a new access token
    const { data: refreshData, error: refreshError } = await adminClient.auth.refreshSession({
      refresh_token: session.supabase_refresh_token,
    });

    if (refreshError) {
      console.error('Extension refresh error: Supabase refresh failed:', refreshError);
      
      // If the Supabase refresh token is invalid, the session is effectively dead
      // Mark it as revoked so we don't keep trying
      await adminClient
        .from('extension_sessions')
        .update({
          revoked_at: new Date().toISOString(),
          revoked_reason: 'Supabase refresh token expired',
        })
        .eq('id', session.id);

      return NextResponse.json(
        { error: 'Session refresh failed. Please log in again.' },
        { status: 401 }
      );
    }

    // Step 7: Update the session with the new refresh token and last_used_at
    // Supabase may rotate the refresh token on each use
    const { error: updateError } = await adminClient
      .from('extension_sessions')
      .update({
        supabase_refresh_token: refreshData.session.refresh_token,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (updateError) {
      // Log but don't fail - the access token is still valid
      console.warn('Extension refresh warning: Failed to update session:', updateError);
    }

    // Step 8: Get user info
    const { data: userData, error: userError } = await adminClient.auth.getUser(
      refreshData.session.access_token
    );

    if (userError) {
      console.warn('Extension refresh warning: Failed to get user:', userError);
    }

    // Step 9: Return the new access token and user info
    return NextResponse.json({
      session: {
        access_token: refreshData.session.access_token,
        // Don't return the refresh token - the extension uses extension_token instead
        expires_at: session.expires_at, // Extension session expiration
        access_token_expires_at: refreshData.session.expires_at, // Access token expiration
      },
      user: userData?.user ? {
        id: userData.user.id,
        email: userData.user.email,
        created_at: userData.user.created_at,
        email_confirmed_at: userData.user.email_confirmed_at,
      } : null,
    });
  } catch (error) {
    console.error('Extension refresh error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
