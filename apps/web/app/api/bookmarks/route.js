/**
 * GET /api/bookmarks - Get user's bookmarks
 * POST /api/bookmarks - Sync bookmarks from extension
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * Helper to get user from authorization header
 */
async function getUserFromAuth(request, supabase) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Authorization header required' };
  }

  const accessToken = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  return { user, error: null };
}

export async function GET(request) {
  try {
    const supabase = await createClient();
    const { user, error: authError } = await getUserFromAuth(request, supabase);

    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 }
      );
    }

    // Get bookmarks from database
    const { data: bookmarks, error: bookmarksError } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (bookmarksError) {
      console.error('Bookmarks fetch error:', bookmarksError);
      return NextResponse.json(
        { error: 'Failed to fetch bookmarks' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bookmarks: bookmarks || [],
      count: bookmarks?.length || 0,
    });
  } catch (error) {
    console.error('Bookmarks GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { user, error: authError } = await getUserFromAuth(request, supabase);

    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 }
      );
    }

    const { bookmarks, source = 'browser' } = await request.json();

    if (!Array.isArray(bookmarks)) {
      return NextResponse.json(
        { error: 'Bookmarks array is required' },
        { status: 400 }
      );
    }

    // Process bookmarks - add user_id and normalize structure
    const processedBookmarks = bookmarks.map(bookmark => ({
      user_id: user.id,
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
      description: bookmark.description || null,
      folder_path: bookmark.folderPath || bookmark.folder_path || '/',
      tags: bookmark.tags || [],
      favicon: bookmark.favicon || null,
      source,
      external_id: bookmark.id?.toString() || null,
      created_at: bookmark.dateAdded ? new Date(bookmark.dateAdded).toISOString() : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Upsert bookmarks (update if URL exists for user, insert if not)
    const { data, error: upsertError } = await supabase
      .from('bookmarks')
      .upsert(processedBookmarks, {
        onConflict: 'user_id,url',
        ignoreDuplicates: false,
      })
      .select();

    if (upsertError) {
      console.error('Bookmarks upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to sync bookmarks' },
        { status: 500 }
      );
    }

    // Create a version history entry for this sync
    const { error: versionError } = await supabase
      .from('bookmark_versions')
      .insert({
        user_id: user.id,
        source,
        bookmark_count: processedBookmarks.length,
        snapshot: processedBookmarks,
        created_at: new Date().toISOString(),
      });

    if (versionError) {
      console.error('Version history error:', versionError);
      // Don't fail the sync if version history fails
    }

    return NextResponse.json({
      synced: data?.length || 0,
      total: processedBookmarks.length,
      message: 'Bookmarks synced successfully',
    });
  } catch (error) {
    console.error('Bookmarks POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createClient();
    const { user, error: authError } = await getUserFromAuth(request, supabase);

    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 }
      );
    }

    const { url, id } = await request.json();

    if (!url && !id) {
      return NextResponse.json(
        { error: 'URL or ID is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('bookmarks')
      .delete()
      .eq('user_id', user.id);

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('url', url);
    }

    const { error: deleteError } = await query;

    if (deleteError) {
      console.error('Bookmark delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete bookmark' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Bookmark deleted successfully',
    });
  } catch (error) {
    console.error('Bookmarks DELETE error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
