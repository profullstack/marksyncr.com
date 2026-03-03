/**
 * POST /api/account/delete - Delete user account and all associated data
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 * This action is irreversible.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { createAdminClient } from '@/lib/supabase/server';

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

    const body = await request.json();

    // Require explicit confirmation
    if (body.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Must send { "confirm": "DELETE" } to confirm account deletion' },
        { status: 400, headers }
      );
    }

    const userId = user.id;
    const adminClient = createAdminClient();

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
