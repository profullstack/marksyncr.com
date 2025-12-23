/**
 * GitHub OAuth Callback Route
 *
 * Handles the OAuth callback from GitHub and stores the connection.
 * Auto-creates a bookmark repository for the user.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUser, createClient } from '../../../../../lib/supabase/server';
import { exchangeCodeForToken, validateToken } from '@marksyncr/sources/oauth/github-oauth';
import { getOrCreateRepository } from '@marksyncr/sources/oauth/github-repo';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('GitHub OAuth error:', error, errorDescription);
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
    const storedState = cookieStore.get('github_oauth_state')?.value;

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
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connect/github/callback`;

    const tokenData = await exchangeCodeForToken(code, clientId, clientSecret, redirectUri);

    // Validate token and get user info
    const validation = await validateToken(tokenData.access_token);

    if (!validation.valid) {
      return NextResponse.redirect(
        new URL('/dashboard?error=invalid_token', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Auto-create or get existing bookmark repository
    let repoConfig;
    try {
      repoConfig = await getOrCreateRepository(tokenData.access_token);
      console.log('GitHub repository setup:', repoConfig);
    } catch (repoError) {
      console.error('Failed to setup GitHub repository:', repoError);
      return NextResponse.redirect(
        new URL('/dashboard?error=repo_setup_failed', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Store connection in database with repository configuration
    const supabase = await createClient();

    const { error: dbError } = await supabase.from('sync_sources').upsert(
      {
        user_id: user.id,
        provider: 'github',
        provider_user_id: String(validation.user.id),
        provider_username: validation.user.login,
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
        repository: repoConfig.repository,
        branch: repoConfig.branch,
        file_path: repoConfig.filePath,
        config: {
          repoCreated: repoConfig.created,
          setupAt: new Date().toISOString(),
        },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,provider',
      }
    );

    if (dbError) {
      console.error('Database error storing GitHub connection:', dbError);
      return NextResponse.redirect(
        new URL('/dashboard?error=db_error', process.env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Clear state cookie and redirect to dashboard
    const response = NextResponse.redirect(
      new URL('/dashboard?connected=github', process.env.NEXT_PUBLIC_APP_URL)
    );
    response.cookies.delete('github_oauth_state');

    return response;
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=callback_failed', process.env.NEXT_PUBLIC_APP_URL)
    );
  }
}
