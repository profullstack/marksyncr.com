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

/**
 * Ensure user exists in public.users table
 * This is needed because cloud_bookmarks has a foreign key to users
 * The trigger should create users on signup, but this handles edge cases
 */
async function ensureUserExists(supabase, user) {
  // First check if user exists
  const { data: existingUser, error: checkError } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (existingUser) {
    return true; // User already exists
  }

  // User doesn't exist, create them
  const { error: insertError } = await supabase
    .from('users')
    .insert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
      created_at: new Date().toISOString(),
    });

  if (insertError && insertError.code !== '23505') {
    // 23505 = unique violation (user already exists, race condition)
    console.error('Error creating user:', insertError);
    return false;
  }

  // Also create a free subscription for the user
  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: user.id,
      plan: 'free',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (subError && subError.code !== '23505') {
    console.error('Error creating subscription:', subError);
    // Don't fail - user was created, subscription is optional
  }

  return true;
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

/**
 * Merge incoming bookmarks with existing cloud bookmarks
 * Uses URL as unique identifier
 * Newer bookmarks (by dateAdded) win conflicts
 */
function mergeBookmarks(existingBookmarks, incomingBookmarks) {
  // Create a map of existing bookmarks by URL
  const bookmarkMap = new Map();
  
  // Add existing bookmarks to map
  for (const bookmark of existingBookmarks) {
    bookmarkMap.set(bookmark.url, bookmark);
  }
  
  let added = 0;
  let updated = 0;
  
  // Merge incoming bookmarks
  for (const incoming of incomingBookmarks) {
    const existing = bookmarkMap.get(incoming.url);
    
    if (!existing) {
      // New bookmark - add it
      bookmarkMap.set(incoming.url, incoming);
      added++;
    } else {
      // Existing bookmark - check if incoming is newer
      const existingDate = existing.dateAdded || 0;
      const incomingDate = incoming.dateAdded || 0;
      
      if (incomingDate > existingDate) {
        // Incoming is newer - update
        bookmarkMap.set(incoming.url, {
          ...incoming,
          // Preserve the original id if it exists
          id: existing.id || incoming.id,
        });
        updated++;
      }
      // If existing is newer or same, keep existing (do nothing)
    }
  }
  
  return {
    merged: Array.from(bookmarkMap.values()),
    added,
    updated,
  };
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

    // Ensure user exists in public.users table (required for foreign key)
    const userCreated = await ensureUserExists(supabase, user);
    if (!userCreated) {
      return NextResponse.json(
        { error: 'Failed to create user record' },
        { status: 500, headers }
      );
    }

    // Normalize bookmarks structure
    // Preserve empty titles - don't replace with URL
    const normalizedBookmarks = bookmarks.map(bookmark => ({
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title ?? '',
      folderPath: bookmark.folderPath || bookmark.folder_path || '',
      dateAdded: bookmark.dateAdded || Date.now(),
      source,
    }));

    // Get existing bookmarks from cloud
    const { data: existingData, error: fetchError } = await supabase
      .from('cloud_bookmarks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // PGRST116 = no rows found, which is fine for new users
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Bookmarks fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch existing bookmarks' },
        { status: 500, headers }
      );
    }

    const existingBookmarks = existingData?.bookmark_data || [];
    const existingVersion = existingData?.version || 0;

    // Merge incoming bookmarks with existing
    const { merged, added, updated } = mergeBookmarks(existingBookmarks, normalizedBookmarks);

    // Generate checksum for the merged bookmark data
    const checksum = generateChecksum(merged);

    const newVersion = existingVersion + 1;

    // Upsert merged bookmarks (single row per user with JSONB data)
    const { data, error: upsertError } = await supabase
      .from('cloud_bookmarks')
      .upsert({
        user_id: user.id,
        bookmark_data: merged,
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
      merged: merged.length,
      added,
      updated,
      total: merged.length,
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
