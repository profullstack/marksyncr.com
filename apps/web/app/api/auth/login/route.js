/**
 * POST /api/auth/login
 * Sign in with email and password
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
    // Validate environment variables first
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('Login error: Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error: Supabase not configured' },
        { status: 500 }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Use stateless client to avoid cookie-based session management
    // This allows multiple devices to have independent sessions
    const supabase = createStatelessClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Check if the error is a JSON parsing error (indicates Supabase connectivity issue)
      if (error.message && error.message.includes('Unexpected token')) {
        console.error('Login error: Supabase returned non-JSON response. Check NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
        return NextResponse.json(
          { error: 'Unable to connect to authentication service. Please try again later.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: data.user,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    // Check if the error is a JSON parsing error (indicates Supabase connectivity issue)
    if (error.message && error.message.includes('Unexpected token')) {
      console.error('Supabase URL configured:', process.env.NEXT_PUBLIC_SUPABASE_URL);
      return NextResponse.json(
        { error: 'Unable to connect to authentication service. Please try again later.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
