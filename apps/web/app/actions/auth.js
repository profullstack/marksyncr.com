'use server';

import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

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

  // Log successful signup for debugging
  console.log('Signup successful for:', email, 'User ID:', data?.user?.id);

  return {
    success: true,
    message: 'Check your email for the confirmation link',
  };
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
