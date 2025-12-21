/**
 * Dropbox OAuth Connection Route
 *
 * Initiates Dropbox OAuth flow for connecting Dropbox as a sync source.
 */

import { NextResponse } from 'next/server';
import { getUser } from '../../../../lib/supabase/server';
import { buildAuthorizationUrl } from '@marksyncr/sources/oauth/dropbox-oauth';

/**
 * Generate a random state string for CSRF protection
 * @param {number} length
 * @returns {string}
 */
function generateState(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

export async function GET() {
  try {
    // Verify user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL));
    }

    const clientId = process.env.DROPBOX_CLIENT_ID;
    if (!clientId) {
      console.error('DROPBOX_CLIENT_ID not configured');
      return NextResponse.redirect(
        new URL('/dashboard?error=dropbox_not_configured', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connect/dropbox/callback`;
    const state = generateState();

    // Build authorization URL
    const authUrl = buildAuthorizationUrl(clientId, redirectUri, state);

    // Store state in cookie for verification
    const response = NextResponse.redirect(authUrl);
    response.cookies.set('dropbox_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Dropbox OAuth initiation error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=oauth_failed', process.env.NEXT_PUBLIC_APP_URL)
    );
  }
}
