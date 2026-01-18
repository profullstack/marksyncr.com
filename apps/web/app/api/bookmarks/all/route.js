/**
 * DELETE /api/bookmarks/all - Delete all cloud data for a user
 *
 * This endpoint deletes ALL cloud data for the authenticated user:
 * - cloud_bookmarks: All bookmarks and tombstones
 * - bookmark_versions: All version history
 * - sync_sources: All connected external sources (GitHub, Dropbox, etc.)
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 *
 * WARNING: This is a destructive operation that cannot be undone.
 * The user's browser bookmarks are NOT affected - only cloud data is deleted.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, ['DELETE', 'OPTIONS']),
  });
}

/**
 * DELETE /api/bookmarks/all - Delete all cloud data
 *
 * Deletes:
 * - cloud_bookmarks row (bookmarks, tombstones, checksum, version)
 * - bookmark_versions rows (version history)
 * - sync_sources rows (connected external services)
 *
 * Does NOT delete:
 * - User account
 * - Subscription
 * - Browser bookmarks (local to user's browser)
 */
export async function DELETE(request) {
  const headers = corsHeaders(request, ['DELETE', 'OPTIONS']);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    console.log(`[Delete Cloud Data] User ${user.id} requested deletion of all cloud data`);

    // Track what was deleted
    const deleted = {
      bookmarks: false,
      versions: false,
      sources: false,
    };

    // Delete cloud_bookmarks (bookmarks, tombstones, checksum, version)
    const { error: bookmarksError } = await supabase
      .from('cloud_bookmarks')
      .delete()
      .eq('user_id', user.id);

    if (bookmarksError) {
      console.error('[Delete Cloud Data] Failed to delete cloud_bookmarks:', bookmarksError);
      return NextResponse.json(
        { error: 'Failed to delete cloud data', details: bookmarksError.message },
        { status: 500, headers }
      );
    }
    deleted.bookmarks = true;
    console.log(`[Delete Cloud Data] Deleted cloud_bookmarks for user ${user.id}`);

    // Delete bookmark_versions (version history)
    const { error: versionsError } = await supabase
      .from('bookmark_versions')
      .delete()
      .eq('user_id', user.id);

    if (versionsError) {
      console.error('[Delete Cloud Data] Failed to delete bookmark_versions:', versionsError);
      return NextResponse.json(
        { error: 'Failed to delete cloud data', details: versionsError.message },
        { status: 500, headers }
      );
    }
    deleted.versions = true;
    console.log(`[Delete Cloud Data] Deleted bookmark_versions for user ${user.id}`);

    // Delete sync_sources (connected external services)
    const { error: sourcesError } = await supabase
      .from('sync_sources')
      .delete()
      .eq('user_id', user.id);

    if (sourcesError) {
      console.error('[Delete Cloud Data] Failed to delete sync_sources:', sourcesError);
      return NextResponse.json(
        { error: 'Failed to delete cloud data', details: sourcesError.message },
        { status: 500, headers }
      );
    }
    deleted.sources = true;
    console.log(`[Delete Cloud Data] Deleted sync_sources for user ${user.id}`);

    console.log(`[Delete Cloud Data] Successfully deleted all cloud data for user ${user.id}`);

    return NextResponse.json(
      {
        message: 'All cloud data deleted successfully',
        deleted,
      },
      { headers }
    );
  } catch (error) {
    console.error('[Delete Cloud Data] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
