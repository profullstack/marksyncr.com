/**
 * GET /api/bookmarks - Get user's bookmarks
 * POST /api/bookmarks - Sync bookmarks from extension
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 * 
 * The cloud_bookmarks table stores ALL bookmarks as a single JSONB blob per user:
 * - bookmark_data: JSONB containing array of bookmarks
 * - checksum: Hash of the bookmark data for change detection
 * - version: Incremented on each update
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import crypto from 'crypto';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, ['GET', 'POST', 'DELETE', 'OPTIONS']),
  });
}

/**
 * Generate checksum for bookmark data
 */
function generateChecksum(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export async function GET(request) {
  const headers = corsHeaders(request, ['GET', 'POST', 'DELETE', 'OPTIONS']);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }

    // Get bookmarks from database (single row per user with JSONB data)
    const { data: cloudBookmarks, error: bookmarksError } = await supabase
      .from('cloud_bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (bookmarksError && bookmarksError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is fine for new users
      console.error('Bookmarks fetch error:', bookmarksError);
      return NextResponse.json(
        { error: 'Failed to fetch bookmarks' },
        { status: 500, headers }
      );
    }

    // Extract bookmarks array from JSONB
    const bookmarks = cloudBookmarks?.bookmark_data || [];

    return NextResponse.json({
      bookmarks: Array.isArray(bookmarks) ? bookmarks : [],
      count: Array.isArray(bookmarks) ? bookmarks.length : 0,
      version: cloudBookmarks?.version || 0,
      checksum: cloudBookmarks?.checksum || null,
      lastModified: cloudBookmarks?.last_modified || null,
    }, { headers });
  } catch (error) {
    console.error('Bookmarks GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}

export async function POST(request) {
  const headers = corsHeaders(request, ['GET', 'POST', 'DELETE', 'OPTIONS']);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }

    const { bookmarks, source = 'browser' } = await request.json();

    if (!Array.isArray(bookmarks)) {
      return NextResponse.json(
        { error: 'Bookmarks array is required' },
        { status: 400, headers }
      );
    }

    // Normalize bookmarks structure
    const normalizedBookmarks = bookmarks.map(bookmark => ({
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
      folderPath: bookmark.folderPath || bookmark.folder_path || '',
      dateAdded: bookmark.dateAdded || Date.now(),
      source,
    }));

    // Generate checksum for the bookmark data
    const checksum = generateChecksum(normalizedBookmarks);

    // Get current version
    const { data: existing } = await supabase
      .from('cloud_bookmarks')
      .select('version')
      .eq('user_id', user.id)
      .single();

    const newVersion = (existing?.version || 0) + 1;

    // Upsert bookmarks (single row per user with JSONB data)
    const { data, error: upsertError } = await supabase
      .from('cloud_bookmarks')
      .upsert({
        user_id: user.id,
        bookmark_data: normalizedBookmarks,
        checksum,
        version: newVersion,
        last_modified: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Bookmarks upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to sync bookmarks' },
        { status: 500, headers }
      );
    }

    return NextResponse.json({
      synced: normalizedBookmarks.length,
      total: normalizedBookmarks.length,
      version: data.version,
      checksum: data.checksum,
      message: 'Bookmarks synced successfully',
    }, { headers });
  } catch (error) {
    console.error('Bookmarks POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}

export async function DELETE(request) {
  const headers = corsHeaders(request, ['GET', 'POST', 'DELETE', 'OPTIONS']);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }

    const { url, id } = await request.json();

    if (!url && !id) {
      return NextResponse.json(
        { error: 'URL or ID is required' },
        { status: 400, headers }
      );
    }

    // Get current bookmarks
    const { data: existing, error: fetchError } = await supabase
      .from('cloud_bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      console.error('Bookmark fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch bookmarks' },
        { status: 500, headers }
      );
    }

    if (!existing || !existing.bookmark_data) {
      return NextResponse.json(
        { error: 'No bookmarks found' },
        { status: 404, headers }
      );
    }

    // Filter out the bookmark to delete
    const bookmarks = existing.bookmark_data;
    const filteredBookmarks = bookmarks.filter(b => {
      if (id) return b.id !== id;
      if (url) return b.url !== url;
      return true;
    });

    if (filteredBookmarks.length === bookmarks.length) {
      return NextResponse.json(
        { error: 'Bookmark not found' },
        { status: 404, headers }
      );
    }

    // Update with filtered bookmarks
    const checksum = generateChecksum(filteredBookmarks);
    const { error: updateError } = await supabase
      .from('cloud_bookmarks')
      .update({
        bookmark_data: filteredBookmarks,
        checksum,
        version: existing.version + 1,
        last_modified: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Bookmark delete error:', updateError);
      return NextResponse.json(
        { error: 'Failed to delete bookmark' },
        { status: 500, headers }
      );
    }

    return NextResponse.json({
      message: 'Bookmark deleted successfully',
    }, { headers });
  } catch (error) {
    console.error('Bookmarks DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}
