/**
 * GET /api/bookmarks - Get user's bookmarks
 * POST /api/bookmarks - Sync bookmarks from extension
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, ['GET', 'POST', 'DELETE', 'OPTIONS']),
  });
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

    // Get bookmarks from database
    const { data: bookmarks, error: bookmarksError } = await supabase
      .from('cloud_bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (bookmarksError) {
      console.error('Bookmarks fetch error:', bookmarksError);
      return NextResponse.json(
        { error: 'Failed to fetch bookmarks' },
        { status: 500, headers }
      );
    }

    return NextResponse.json({
      bookmarks: bookmarks || [],
      count: bookmarks?.length || 0,
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
      .from('cloud_bookmarks')
      .upsert(processedBookmarks, {
        onConflict: 'user_id,url',
        ignoreDuplicates: false,
      })
      .select();

    if (upsertError) {
      console.error('Bookmarks upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to sync bookmarks' },
        { status: 500, headers }
      );
    }

    return NextResponse.json({
      synced: data?.length || 0,
      total: processedBookmarks.length,
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

    let query = supabase
      .from('cloud_bookmarks')
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
