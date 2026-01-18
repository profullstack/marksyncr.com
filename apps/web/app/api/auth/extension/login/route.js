/**
 * POST /api/auth/extension/login
 * Sign in from browser extension with long-lived session token
 *
 * This endpoint is specifically designed for browser extensions where:
 * 1. Users expect to stay logged in for extended periods (months/years)
 * 2. The extension stores tokens in browser.storage.local
 * 3. Frequent re-authentication is a poor user experience
 *
 * Security model:
 * - Authenticates user with email/password via Supabase
 * - Creates a long-lived extension session (2 years by default)
 * - Returns an extension_token that the extension stores
 * - The extension uses this token to get fresh access tokens
 *
 * The extension_token is:
 * - Cryptographically secure (256 bits of entropy)
 * - Stored as a hash in the database
 * - Can be revoked by the user from the dashboard
 */

import { NextResponse } from 'next/server';
import { createStatelessClient, createAdminClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';

// Extension session duration: 2 years in milliseconds
// Extensions need long-lived sessions to avoid frequent re-authentication
const EXTENSION_SESSION_DURATION_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure token
 * @returns {string} 64-character hex string (256 bits)
 */
function generateSecureToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage
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
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('Extension login error: Missing Supabase environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Extension login error: Missing service role key');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json();
    const { email, password, device_id, device_name, browser } = body || {};

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Step 1: Authenticate user with Supabase
    const supabase = createStatelessClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Handle Supabase connectivity issues
      if (authError.message && authError.message.includes('Unexpected token')) {
        console.error('Extension login error: Supabase returned non-JSON response');
        return NextResponse.json(
          { error: 'Unable to connect to authentication service' },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    const { user, session } = authData;

    // Step 2: Generate extension token
    const extensionToken = generateSecureToken();
    const extensionTokenHash = hashToken(extensionToken);

    // Step 3: Calculate expiration (1 year from now)
    const expiresAt = new Date(Date.now() + EXTENSION_SESSION_DURATION_MS);

    // Step 4: Store extension session in database using admin client
    const adminClient = createAdminClient();

    const { data: sessionData, error: dbError } = await adminClient
      .from('extension_sessions')
      .insert({
        user_id: user.id,
        extension_token_hash: extensionTokenHash,
        supabase_refresh_token: session.refresh_token,
        device_id: device_id || null,
        device_name: device_name || null,
        browser: browser || null,
        expires_at: expiresAt.toISOString(),
        last_used_at: new Date().toISOString(),
      })
      .select('id, expires_at, created_at')
      .single();

    if (dbError) {
      console.error('Extension login error: Failed to create session:', dbError);
      return NextResponse.json({ error: 'Failed to create extension session' }, { status: 500 });
    }

    // Step 5: Return user info and extension session
    // Note: We return the plain extension_token (not the hash) - this is the only time it's available
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        email_confirmed_at: user.email_confirmed_at,
      },
      session: {
        // The extension stores this token and uses it for all future requests
        extension_token: extensionToken,
        // Also provide the initial access token for immediate use
        access_token: session.access_token,
        // Expiration of the extension session (not the access token)
        expires_at: sessionData.expires_at,
        // Session metadata
        session_id: sessionData.id,
        created_at: sessionData.created_at,
      },
    });
  } catch (error) {
    console.error('Extension login error:', error);

    // Don't expose internal error details
    if (error.message && error.message.includes('Unexpected token')) {
      return NextResponse.json(
        { error: 'Unable to connect to authentication service' },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
