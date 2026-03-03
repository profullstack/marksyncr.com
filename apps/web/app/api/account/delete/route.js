/**
 * POST /api/account/delete - Delete user account and all associated data
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 * This action is irreversible.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { createAdminClient } from '@/lib/supabase/server';
import { cancelSubscription } from '@/lib/stripe';

const METHODS = ['POST', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, METHODS),
  });
}

export async function POST(request) {
  const headers = corsHeaders(request, METHODS);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    // Validate Content-Type to mitigate CSRF via cross-origin form posts
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415, headers }
      );
    }

    // Safe JSON parsing — don't let malformed body become a 500
    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400, headers }
      );
    }

    // Require explicit confirmation
    if (!body || typeof body !== 'object' || body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Must send { "confirm": "DELETE" } to confirm account deletion' },
        { status: 400, headers }
      );
    }

    const userId = user.id;
    const adminClient = createAdminClient();

    // Cancel active Stripe subscription before deleting data
    const { data: subscription } = await adminClient
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (subscription?.stripe_subscription_id) {
      try {
        await cancelSubscription(subscription.stripe_subscription_id);
      } catch (stripeError) {
        console.error('Failed to cancel Stripe subscription:', stripeError.message);
        return NextResponse.json(
          { error: 'Failed to cancel your subscription. Please cancel it manually in Stripe before deleting your account, or contact support.' },
          { status: 500, headers }
        );
      }
    }

    // Delete all user data from all tables (order matters for foreign keys)
    const tables = [
      'bookmark_versions',
      'cloud_bookmarks',
      'user_tags',
      'extension_sessions',
      'devices',
      'sync_sources',
      'user_settings',
      'subscriptions',
    ];

    const errors = [];

    for (const table of tables) {
      const { error } = await adminClient
        .from(table)
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error(`Failed to delete from ${table}:`, error.message);
        errors.push({ table, error: error.message });
      }
    }

    // If any table deletion failed, abort — don't delete auth user with orphaned data
    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Failed to delete all account data. Your sign-in account has not been removed. Please try again later or contact support.',
          details: errors,
        },
        { status: 500, headers }
      );
    }

    // Delete the auth user (this is irreversible)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Failed to delete auth user:', authError.message);
      return NextResponse.json(
        { error: 'Failed to delete account. Please contact support.' },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      { message: 'Account and all data deleted successfully' },
      { headers }
    );
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
