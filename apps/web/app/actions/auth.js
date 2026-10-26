'use server';

import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { validateProfile, saveSignupProfile } from '@profullstack/profile';
import { profileStore } from '../../lib/profile';

/**
 * Sign in with email and password
 * @param {FormData} formData
 */
export async function signInWithEmail(formData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/dashboard');
}

/**
 * Sign up with email and password
 * @param {FormData} formData
 */
export async function signUpWithEmail(formData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  // The @profullstack/profile fields (first/last name required; company
  // domain, job title, LinkedIn optional) are checked before the user exists.
  const check = validateProfile(formData);
  if (!check.ok) {
    return { error: 'Some fields need fixing.', fieldErrors: check.errors };
  }
  const p = check.profile;

  const supabase = await createClient();
  const headersList = await headers();

  // Use NEXT_PUBLIC_APP_URL if available, otherwise construct from headers
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    headersList.get('origin') ||
    `https://${headersList.get('host')}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        name: [p.first_name, p.last_name].filter(Boolean).join(' '),
        first_name: p.first_name,
        last_name: p.last_name,
        company_domain: p.company_domain ?? null,
        job_title: p.job_title ?? null,
        linkedin_url: p.linkedin_url ?? null,
      },
    },
  });

  if (error) {
    console.error('Signup error:', error.message);
    return { error: error.message };
  }

  // Check if user already exists (Supabase returns a user with identities: [] for existing users)
  if (data?.user?.identities?.length === 0) {
    return { error: 'An account with this email already exists. Please sign in instead.' };
  }

  // The auth trigger has created the public.users row; store the profile on it.
  // The fields are also in user metadata, so a failed save never fails signup.
  if (data?.user?.id) {
    try {
      await saveSignupProfile(profileStore(), data.user.id, formData, { email: data.user.email });
    } catch (e) {
      console.error('[signup] profile save failed', e);
    }
  }

  // Log successful signup for debugging
  console.log('Signup successful for:', email, 'User ID:', data?.user?.id);

  return {
    success: true,
    message: 'Check your email for the confirmation link',
  };
}

const OAUTH_PROVIDERS = ['github', 'google'];

/**
 * OAuth providers the auth server has enabled, so the UI never offers a button
 * that ends on GoTrue's "Unsupported provider: provider is not enabled" JSON.
 * Fails closed: if the settings endpoint is unreachable, no OAuth buttons show.
 * @returns {Promise<Array<'github' | 'google'>>}
 */
export async function getEnabledOAuthProviders() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const { external = {} } = await res.json();
    return OAUTH_PROVIDERS.filter((provider) => external[provider] === true);
  } catch {
    return [];
  }
}

/**
 * Sign in with OAuth provider
 * @param {'github' | 'google'} provider
 */
export async function signInWithOAuth(provider) {
  const supabase = await createClient();
  const headersList = await headers();

  // Use NEXT_PUBLIC_APP_URL if available, otherwise construct from headers
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    headersList.get('origin') ||
    `https://${headersList.get('host')}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error('OAuth error:', error.message);
    return { error: error.message };
  }

  if (data?.url) {
    redirect(data.url);
  }

  return { error: 'Failed to get OAuth URL' };
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: error.message };
  }

  redirect('/');
}

/**
 * Reset password
 * @param {FormData} formData
 */
export async function resetPassword(formData) {
  const email = formData.get('email');

  if (!email) {
    return { error: 'Email is required' };
  }

  const supabase = await createClient();
  const headersList = await headers();

  // Use NEXT_PUBLIC_APP_URL if available, otherwise construct from headers
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    headersList.get('origin') ||
    `https://${headersList.get('host')}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    console.error('Password reset error:', error.message);
    return { error: error.message };
  }

  console.log('Password reset email sent to:', email);

  return {
    success: true,
    message: 'Check your email for the password reset link',
  };
}

/**
 * Update password
 * @param {FormData} formData
 */
export async function updatePassword(formData) {
  const password = formData.get('password');

  if (!password) {
    return { error: 'Password is required' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/dashboard');
}
