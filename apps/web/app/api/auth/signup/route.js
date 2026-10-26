/**
 * POST /api/auth/signup
 * Sign up with email and password
 *
 * Uses a stateless Supabase client to avoid cookie-based session management.
 */

import { NextResponse } from 'next/server';
import { createStatelessClient } from '@/lib/supabase/server';
import { validateProfile, saveSignupProfile } from '@profullstack/profile';
import { profileStore } from '@/lib/profile';

const PROFILE_KEYS = ['first_name', 'last_name', 'company_domain', 'job_title', 'linkedin_url'];

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
    const body = await request.json();
    const { email, password } = body;
    // The extension signs up with email + password only; when a client sends
    // the @profullstack/profile fields they are validated and stored.
    const withProfile = PROFILE_KEYS.some((k) => body?.[k] != null && body[k] !== '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    if (withProfile) {
      const check = validateProfile({ ...body, email });
      if (!check.ok) {
        return NextResponse.json(
          { error: 'Some fields need fixing.', errors: check.errors },
          { status: 400 }
        );
      }
    }

    // Use stateless client to avoid cookie-based session management
    const supabase = createStatelessClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://marksyncr.com'}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if user already exists (identities will be empty)
    if (data?.user?.identities?.length === 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 400 }
      );
    }

    if (withProfile && data?.user?.id) {
      try {
        await saveSignupProfile(
          profileStore(),
          data.user.id,
          { ...body, email },
          {
            email: data.user.email,
          }
        );
      } catch (e) {
        console.error('[signup] profile save failed', e);
      }
    }

    return NextResponse.json({
      user: data.user,
      message: 'Please check your email to confirm your account',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
