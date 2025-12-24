/**
 * GET /api/bookmarks - Get user's bookmarks
 * POST /api/bookmarks - Sync bookmarks from extension
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 *
 * The cloud_bookmarks table stores ALL bookmarks as a single JSONB blob per user:
 * - bookmark_data: JSONB containing array of bookmarks
 * - tombstones: JSONB containing array of deleted bookmark URLs with timestamps
 * - checksum: Hash of the bookmark data for change detection
 * - version: Incremented on each update
 *
 * Tombstone tracking:
 * - When a bookmark is deleted, a tombstone is created with the URL and deletion timestamp
 * - Tombstones are synced across browsers
 * - If a tombstone's deletedAt is newer than a bookmark's dateAdded, the bookmark is considered deleted
 * - This allows deletions to sync across browsers
 *
 * External sync:
 * - After saving to Supabase, bookmarks are synced to all connected external sources (GitHub, Dropbox, etc.)
 * - This happens asynchronously to not block the response
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import crypto from 'crypto';
import { syncBookmarksToGitHub } from '@marksyncr/sources/oauth/github-sync';
import { syncBookmarksToDropbox } from '@marksyncr/sources/oauth/dropbox-sync';

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

    // Extract bookmarks array from JSONB (handle both flat array and nested format)
    const rawBookmarks = cloudBookmarks?.bookmark_data;
    const bookmarksArray = extractBookmarksFromNested(rawBookmarks);
    
    // Extract tombstones (deleted bookmark URLs)
    const tombstones = Array.isArray(cloudBookmarks?.tombstones) ? cloudBookmarks.tombstones : [];
    
    console.log(`[Bookmarks API GET] User: ${user.id}`);
    console.log(`[Bookmarks API GET] Raw data type: ${Array.isArray(rawBookmarks) ? 'array' : typeof rawBookmarks}`);
    console.log(`[Bookmarks API GET] Returning ${bookmarksArray.length} bookmarks, ${tombstones.length} tombstones`);
    console.log(`[Bookmarks API GET] Version: ${cloudBookmarks?.version || 0}`);

    return NextResponse.json({
      bookmarks: bookmarksArray,
      tombstones,
      count: bookmarksArray.length,
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
 * Extract flat array of bookmarks from nested format
 * The database might have bookmarks in nested format: { roots: { toolbar: { children: [...] } } }
 * This function extracts all bookmarks into a flat array
 */
function extractBookmarksFromNested(data) {
  if (!data) return [];
  
  // If it's already an array, return it
  if (Array.isArray(data)) return data;
  
  // If it has a 'roots' property, extract from nested format
  if (data.roots) {
    const bookmarks = [];
    
    function extractFromNode(node, path = '') {
      if (!node) return;
      
      // If it's a bookmark (has url)
      if (node.url) {
        bookmarks.push({
          url: node.url,
          title: node.title ?? '',
          folderPath: path,
          dateAdded: node.dateAdded ? new Date(node.dateAdded).getTime() : Date.now(),
        });
        return;
      }
      
      // If it has children, recurse
      if (node.children && Array.isArray(node.children)) {
        const newPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;
        for (const child of node.children) {
          extractFromNode(child, newPath);
        }
      }
    }
    
    // Extract from each root
    for (const [rootKey, rootNode] of Object.entries(data.roots)) {
      if (rootNode && rootNode.children) {
        const rootPath = rootNode.title || rootKey;
        for (const child of rootNode.children) {
          extractFromNode(child, rootPath);
        }
      }
    }
    
    return bookmarks;
  }
  
  return [];
}

/**
 * Merge tombstones (deleted bookmark records)
 * Uses URL as unique identifier
 * Newer deletions (by deletedAt) win
 */
function mergeTombstones(existingTombstones, incomingTombstones) {
  const tombstoneMap = new Map();
  
  // Ensure arrays
  const existingArray = Array.isArray(existingTombstones) ? existingTombstones : [];
  const incomingArray = Array.isArray(incomingTombstones) ? incomingTombstones : [];
  
  // Add existing tombstones
  for (const tombstone of existingArray) {
    if (tombstone && tombstone.url) {
      tombstoneMap.set(tombstone.url, tombstone);
    }
  }
  
  // Merge incoming tombstones (newer wins)
  for (const incoming of incomingArray) {
    if (!incoming || !incoming.url) continue;
    
    const existing = tombstoneMap.get(incoming.url);
    if (!existing || (incoming.deletedAt > existing.deletedAt)) {
      tombstoneMap.set(incoming.url, incoming);
    }
  }
  
  return Array.from(tombstoneMap.values());
}

/**
 * Apply tombstones to bookmarks - remove bookmarks that have been deleted
 * A bookmark is considered deleted if there's a tombstone with deletedAt > bookmark.dateAdded
 */
function applyTombstones(bookmarks, tombstones) {
  if (!tombstones || tombstones.length === 0) {
    return bookmarks;
  }
  
  // Create a map of tombstones by URL for quick lookup
  const tombstoneMap = new Map();
  for (const tombstone of tombstones) {
    if (tombstone && tombstone.url) {
      tombstoneMap.set(tombstone.url, tombstone);
    }
  }
  
  // Filter out bookmarks that have been deleted
  return bookmarks.filter(bookmark => {
    const tombstone = tombstoneMap.get(bookmark.url);
    if (!tombstone) {
      return true; // No tombstone, keep the bookmark
    }
    
    // If tombstone is newer than bookmark, the bookmark was deleted
    const bookmarkDate = bookmark.dateAdded || 0;
    const tombstoneDate = tombstone.deletedAt || 0;
    
    return bookmarkDate > tombstoneDate; // Keep if bookmark is newer (re-added after deletion)
  });
}

/**
 * Merge incoming bookmarks with existing cloud bookmarks
 * Uses URL as unique identifier
 * Newer bookmarks (by dateAdded) win conflicts
 */
function mergeBookmarks(existingBookmarks, incomingBookmarks) {
  // Create a map of existing bookmarks by URL
  const bookmarkMap = new Map();
  
  // Extract bookmarks from nested format if needed
  const existingArray = extractBookmarksFromNested(existingBookmarks);
  
  // Ensure incomingBookmarks is an array
  const incomingArray = Array.isArray(incomingBookmarks) ? incomingBookmarks : [];
  
  console.log(`[Bookmarks API] Extracted ${existingArray.length} bookmarks from existing data`);
  
  // Add existing bookmarks to map
  for (const bookmark of existingArray) {
    if (bookmark && bookmark.url) {
      bookmarkMap.set(bookmark.url, bookmark);
    }
  }
  
  let added = 0;
  let updated = 0;
  
  // Merge incoming bookmarks
  for (const incoming of incomingArray) {
    if (!incoming || !incoming.url) {
      continue; // Skip invalid bookmarks
    }
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

/**
 * Sync bookmarks to all connected external sources (GitHub, Dropbox, etc.)
 * This runs asynchronously after saving to Supabase
 * @param {object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {Array} bookmarks - Bookmarks to sync
 * @param {Array} tombstones - Tombstones for deleted bookmarks
 * @param {string} checksum - Checksum of the bookmark data
 */
async function syncToExternalSources(supabase, userId, bookmarks, tombstones, checksum) {
  try {
    // Get all connected sync sources for this user
    // A source is considered connected if it has an access_token and connected_at timestamp
    const { data: sources, error: sourcesError } = await supabase
      .from('sync_sources')
      .select('*')
      .eq('user_id', userId)
      .not('access_token', 'is', null);

    if (sourcesError) {
      console.error('[External Sync] Failed to fetch sync sources:', sourcesError);
      return;
    }

    if (!sources || sources.length === 0) {
      console.log('[External Sync] No connected external sources found');
      return;
    }

    console.log(`[External Sync] Found ${sources.length} connected sources`);

    // Sync to each connected source
    for (const source of sources) {
      try {
        // Use 'provider' column (not 'source_type')
        if (source.provider === 'github') {
          await syncToGitHub(source, bookmarks, tombstones, checksum);
        } else if (source.provider === 'dropbox') {
          await syncToDropbox(source, bookmarks, tombstones, checksum);
        } else if (source.provider === 'google-drive') {
          // TODO: Implement Google Drive sync
          console.log('[External Sync] Google Drive sync not yet implemented');
        }
      } catch (sourceError) {
        console.error(`[External Sync] Failed to sync to ${source.provider}:`, sourceError);
        // Continue with other sources even if one fails
      }
    }
  } catch (error) {
    console.error('[External Sync] Error syncing to external sources:', error);
  }
}

/**
 * Sync bookmarks to a GitHub repository
 * @param {object} source - Sync source configuration from database
 * @param {Array} bookmarks - Bookmarks to sync
 * @param {Array} tombstones - Tombstones for deleted bookmarks
 * @param {string} checksum - Checksum of the bookmark data
 */
async function syncToGitHub(source, bookmarks, tombstones, checksum) {
  const { access_token, repository, branch, file_path } = source;

  if (!access_token) {
    console.error('[GitHub Sync] No access token found for GitHub source');
    return;
  }

  if (!repository) {
    console.error('[GitHub Sync] No repository configured for GitHub source');
    return;
  }

  console.log(`[GitHub Sync] Syncing ${bookmarks.length} bookmarks to ${repository}`);

  try {
    const result = await syncBookmarksToGitHub(
      access_token,
      repository,
      branch || 'main',
      file_path || 'bookmarks.json',
      bookmarks,
      tombstones,
      checksum
    );

    console.log(`[GitHub Sync] Successfully synced to ${repository}:`, {
      created: result.created,
      bookmarkCount: result.bookmarkCount,
      sha: result.sha,
    });
  } catch (error) {
    console.error(`[GitHub Sync] Failed to sync to ${repository}:`, error);
    throw error;
  }
}

/**
 * Sync bookmarks to Dropbox
 * @param {object} source - Sync source configuration from database
 * @param {Array} bookmarks - Bookmarks to sync
 * @param {Array} tombstones - Tombstones for deleted bookmarks
 * @param {string} checksum - Checksum of the bookmark data
 */
async function syncToDropbox(source, bookmarks, tombstones, checksum) {
  const { access_token, file_path } = source;

  if (!access_token) {
    console.error('[Dropbox Sync] No access token found for Dropbox source');
    return;
  }

  const dropboxPath = file_path || '/Apps/MarkSyncr/bookmarks.json';
  console.log(`[Dropbox Sync] Syncing ${bookmarks.length} bookmarks to ${dropboxPath}`);

  try {
    const result = await syncBookmarksToDropbox(
      access_token,
      dropboxPath,
      bookmarks,
      tombstones,
      checksum
    );

    console.log(`[Dropbox Sync] Successfully synced to ${dropboxPath}:`, {
      updated: result.updated,
      bookmarkCount: result.bookmarkCount,
      rev: result.rev,
    });
  } catch (error) {
    console.error(`[Dropbox Sync] Failed to sync to ${dropboxPath}:`, error);
    throw error;
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

    const { bookmarks, tombstones: incomingTombstones = [], source = 'browser' } = await request.json();

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

    // Debug: log the raw existingData to see what's in the database
    console.log(`[Bookmarks API] Raw existingData:`, JSON.stringify(existingData, null, 2)?.substring(0, 500));
    
    const existingBookmarks = existingData?.bookmark_data || [];
    const existingTombstones = existingData?.tombstones || [];
    const existingVersion = existingData?.version || 0;

    // Debug logging
    console.log(`[Bookmarks API] Source: ${source}`);
    console.log(`[Bookmarks API] Incoming bookmarks: ${normalizedBookmarks.length}`);
    console.log(`[Bookmarks API] Incoming tombstones: ${incomingTombstones.length}`);
    console.log(`[Bookmarks API] Existing cloud bookmarks: ${Array.isArray(existingBookmarks) ? existingBookmarks.length : 'NOT AN ARRAY: ' + typeof existingBookmarks}`);
    console.log(`[Bookmarks API] Existing tombstones: ${existingTombstones.length}`);
    console.log(`[Bookmarks API] Existing version: ${existingVersion}`);

    // Merge tombstones first
    const mergedTombstones = mergeTombstones(existingTombstones, incomingTombstones);
    console.log(`[Bookmarks API] Merged tombstones: ${mergedTombstones.length}`);

    // Merge incoming bookmarks with existing
    const { merged, added, updated } = mergeBookmarks(existingBookmarks, normalizedBookmarks);
    
    // Apply tombstones to remove deleted bookmarks
    const finalBookmarks = applyTombstones(merged, mergedTombstones);
    const deleted = merged.length - finalBookmarks.length;
    
    console.log(`[Bookmarks API] After merge: ${merged.length} total, ${added} added, ${updated} updated`);
    console.log(`[Bookmarks API] After applying tombstones: ${finalBookmarks.length} (${deleted} deleted)`);

    // Generate checksum for the final bookmark data
    const checksum = generateChecksum(finalBookmarks);

    const newVersion = existingVersion + 1;

    // Upsert merged bookmarks and tombstones (single row per user with JSONB data)
    const { data, error: upsertError } = await supabase
      .from('cloud_bookmarks')
      .upsert({
        user_id: user.id,
        bookmark_data: finalBookmarks,
        tombstones: mergedTombstones,
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

    // Sync to external sources (GitHub, Dropbox, etc.) asynchronously
    // This runs in the background and doesn't block the response
    syncToExternalSources(supabase, user.id, finalBookmarks, mergedTombstones, checksum)
      .catch(err => console.error('[External Sync] Background sync failed:', err));

    return NextResponse.json({
      synced: normalizedBookmarks.length,
      merged: finalBookmarks.length,
      added,
      updated,
      deleted,
      tombstones: mergedTombstones.length,
      total: finalBookmarks.length,
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
