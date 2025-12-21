/**
 * Google Drive OAuth Callback Route
 *
 * Handles the OAuth callback from Google and stores the connection.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser, createClient } from '../../../../../lib/supabase/server';
import { exchangeCodeForToken, getTokenInfo } from '@marksyncr/sources/oauth/google-oauth';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(
          `/dashboard?error=${encodeURIComponent(errorDescription || error)}`,
          process.env.NEXT_PUBLIC_APP_URL
        )
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/dashboard?error=no_code', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Verify state
    const cookieStore = await cookies();
    const storedState = cookieStore.get('google_oauth_state')?.value;

    if (!storedState || storedState !== state) {
      console.error('State mismatch:', { storedState, state });
      return NextResponse.redirect(
        new URL('/dashboard?error=state_mismatch', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Verify user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL));
    }

    // Exchange code for token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connect/google/callback`;

    const tokenData = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);

    // Get user info from token
    const tokenInfo = await getTokenInfo(tokenData.access_token);

    if (!tokenInfo.valid) {
      return NextResponse.redirect(
        new URL('/dashboard?error=invalid_token', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Store connection in database
    const supabase = await createClient();

    const { error: dbError } = await supabase.from('sync_sources').upsert(
      {
        user_id: user.id,
        provider: 'google-drive',
        provider_user_id: tokenInfo.user_id || tokenInfo.email,
        provider_username: tokenInfo.email,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,provider',
      }
    );

    if (dbError) {
      console.error('Database error storing Google connection:', dbError);
      return NextResponse.redirect(
        new URL('/dashboard?error=db_error', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Clear state cookie and redirect to dashboard
    const response = NextResponse.redirect(
      new URL('/dashboard?connected=google', process.env.NEXT_PUBLIC_APP_URL)
    );
    response.cookies.delete('google_oauth_state');

    return response;
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=callback_failed', process.env.NEXT_PUBLIC_APP_URL)
    );
  }
}
