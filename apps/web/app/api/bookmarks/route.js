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
 * Normalize bookmarks AND folders for checksum comparison
 * Extracts only the fields that matter for content comparison,
 * matching the extension-side normalization
 *
 * IMPORTANT: We include both bookmarks and folders with their index
 * to detect order changes. Folders need index tracking too because
 * their position within their parent folder matters for preserving
 * the complete bookmark structure across browsers.
 *
 * NOTE: We intentionally EXCLUDE dateAdded from the checksum because:
 * 1. When bookmarks are synced from cloud to local browser, the browser
 *    assigns the CURRENT time as dateAdded (we can't set it via API)
 * 2. This causes the local dateAdded to differ from cloud dateAdded
 * 3. Which causes checksums to never match, triggering unnecessary syncs
 * 4. dateAdded is not user-editable, so changes to it don't represent
 *    meaningful user changes that need to be synced
 *
 * @param {Array} items - Array of bookmarks and folders to normalize
 * @returns {Array} - Normalized items with only comparable fields
 */
function normalizeItemsForChecksum(items) {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => {
    if (item.type === 'folder') {
      // Folder entry
      return {
        type: 'folder',
        title: item.title ?? '',
        folderPath: item.folderPath || item.folder_path || '',
        index: item.index ?? 0,
      };
    } else {
      // Bookmark entry (default for backwards compatibility)
      // NOTE: dateAdded is intentionally excluded - see function comment
      return {
        type: 'bookmark',
        url: item.url,
        title: item.title ?? '',
        folderPath: item.folderPath || item.folder_path || '',
        index: item.index ?? 0,
      };
    }
  }).sort((a, b) => {
    // Sort by folderPath first, then by index within the folder
    // IMPORTANT: Do NOT sort by type - this would break the interleaved order
    // of folders and bookmarks. When a user moves a folder from position 3 to
    // the last position, the index should be preserved, not reset based on type.
    const folderCompare = a.folderPath.localeCompare(b.folderPath);
    if (folderCompare !== 0) return folderCompare;
    // Then by index within the folder to preserve original order
    return (a.index ?? 0) - (b.index ?? 0);
  });
}

/**
 * @deprecated Use normalizeItemsForChecksum instead
 * Kept for backwards compatibility during transition
 */
function normalizeBookmarksForChecksum(bookmarks) {
  return normalizeItemsForChecksum(bookmarks);
}

/**
 * Generate checksum for bookmark data
 * Uses normalized data to ensure consistent checksums across extension and server
 */
function generateChecksum(data) {
  const normalized = normalizeBookmarksForChecksum(data);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
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
    
    // Debug: Log sample tombstones to verify they're being returned correctly
    if (tombstones.length > 0) {
      console.log(`[Bookmarks API GET] Sample tombstones:`, JSON.stringify(tombstones.slice(0, 5)));
    }

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
 * Merge incoming bookmarks and folders with existing cloud data
 *
 * For bookmarks: Uses URL as unique identifier, newer bookmarks (by dateAdded) win conflicts
 * For folders: Uses folderPath + title as unique identifier, incoming always wins (to preserve order changes)
 *
 * IMPORTANT: This function handles BOTH bookmarks and folders.
 * Folders are identified by type='folder' and don't have URLs.
 * Folders use folderPath + title as their unique key.
 */
function mergeBookmarks(existingBookmarks, incomingBookmarks) {
  // Create separate maps for bookmarks (by URL) and folders (by path+title)
  const bookmarkMap = new Map();
  const folderMap = new Map();
  
  // Extract bookmarks from nested format if needed
  const existingArray = extractBookmarksFromNested(existingBookmarks);
  
  // Ensure incomingBookmarks is an array
  const incomingArray = Array.isArray(incomingBookmarks) ? incomingBookmarks : [];
  
  console.log(`[Bookmarks API] Extracted ${existingArray.length} items from existing data`);
  
  // Helper to generate folder key
  const getFolderKey = (item) => `${item.folderPath || ''}::${item.title || ''}`;
  
  // Add existing items to maps
  for (const item of existingArray) {
    if (!item) continue;
    
    if (item.type === 'folder') {
      // It's a folder - use folderPath + title as key
      const key = getFolderKey(item);
      folderMap.set(key, item);
    } else if (item.url) {
      // It's a bookmark - use URL as key
      bookmarkMap.set(item.url, item);
    }
  }
  
  let added = 0;
  let updated = 0;
  
  // Merge incoming items
  for (const incoming of incomingArray) {
    if (!incoming) continue;
    
    if (incoming.type === 'folder') {
      // It's a folder
      const key = getFolderKey(incoming);
      const existing = folderMap.get(key);
      
      if (!existing) {
        // New folder - add it
        folderMap.set(key, incoming);
        added++;
      } else {
        // Existing folder - always update to preserve order changes
        // Folders don't have dateAdded for comparison, so incoming always wins
        folderMap.set(key, {
          ...incoming,
          id: existing.id || incoming.id,
        });
        updated++;
      }
    } else if (incoming.url) {
      // It's a bookmark
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
            id: existing.id || incoming.id,
          });
          updated++;
        }
        // If existing is newer or same, keep existing (do nothing)
      }
    }
    // Skip items that are neither folders nor valid bookmarks
  }
  
  // Combine bookmarks and folders into a single array
  // IMPORTANT: We must NOT put all bookmarks before all folders, as this
  // would break the interleaved order when items have the same folderPath.
  // Instead, we combine them and sort purely by folderPath and index.
  const allItems = [
    ...Array.from(bookmarkMap.values()),
    ...Array.from(folderMap.values()),
  ];
  
  // Sort by folderPath first, then by index within each folder
  // This ensures folders and bookmarks are interleaved correctly based on their index
  const merged = allItems.sort((a, b) => {
    // Sort by folderPath first
    const aPath = a.folderPath || '';
    const bPath = b.folderPath || '';
    const pathCompare = aPath.localeCompare(bPath);
    if (pathCompare !== 0) return pathCompare;
    // Then by index within the folder to preserve original order
    // This is the key: items with the same folderPath are sorted by index,
    // regardless of whether they are bookmarks or folders
    return (a.index ?? 0) - (b.index ?? 0);
  });
  
  return {
    merged,
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
      created: result.created,
      skipped: result.skipped,
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
    // IMPORTANT: Preserve type and index fields for proper checksum comparison
    const normalizedBookmarks = bookmarks.map(bookmark => ({
      id: bookmark.id,
      type: bookmark.type || 'bookmark', // Preserve type (bookmark or folder)
      url: bookmark.url,
      title: bookmark.title ?? '',
      folderPath: bookmark.folderPath || bookmark.folder_path || '',
      dateAdded: bookmark.dateAdded || Date.now(),
      index: bookmark.index ?? 0, // Preserve index for ordering
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
    
    // Debug: Log sample incoming and merged tombstones
    if (incomingTombstones.length > 0) {
      console.log(`[Bookmarks API] Sample incoming tombstones:`, JSON.stringify(incomingTombstones.slice(0, 3)));
    }
    if (mergedTombstones.length > 0) {
      console.log(`[Bookmarks API] Sample merged tombstones:`, JSON.stringify(mergedTombstones.slice(0, 3)));
    }

    // Merge incoming bookmarks with existing
    const { merged, added, updated } = mergeBookmarks(existingBookmarks, normalizedBookmarks);
    
    // IMPORTANT: Do NOT apply tombstones on the server side!
    // The server should store ALL bookmarks and tombstones.
    // Each browser extension applies tombstones locally when it receives them.
    // This prevents the race condition where:
    // 1. Browser A has bookmark X, Browser B deletes it
    // 2. Browser B syncs, creating tombstone
    // 3. Browser A syncs, sending bookmark X
    // 4. If server applied tombstones, X would be deleted from cloud
    // 5. But Browser A still has X locally, causing sync issues
    //
    // Instead, the extension's applyTombstonesToLocal() handles deletion
    // when it receives tombstones from the cloud.
    const finalBookmarks = merged;
    const deleted = 0; // Server doesn't delete, extensions do
    
    console.log(`[Bookmarks API] After merge: ${merged.length} total, ${added} added, ${updated} updated`);
    console.log(`[Bookmarks API] Tombstones stored: ${mergedTombstones.length} (applied by extensions, not server)`);

    // Generate checksum for the final bookmark data
    const checksum = generateChecksum(finalBookmarks);
    const existingChecksum = existingData?.checksum || null;

    // Check if there are any actual changes by comparing checksums
    // Also check if tombstones have changed
    const existingTombstonesJson = JSON.stringify(existingTombstones.sort((a, b) => a.url.localeCompare(b.url)));
    const mergedTombstonesJson = JSON.stringify(mergedTombstones.sort((a, b) => a.url.localeCompare(b.url)));
    const tombstonesChanged = existingTombstonesJson !== mergedTombstonesJson;
    
    const checksumMatches = existingChecksum && checksum === existingChecksum;
    const noChanges = checksumMatches && !tombstonesChanged;

    console.log(`[Bookmarks API] Existing checksum: ${existingChecksum}`);
    console.log(`[Bookmarks API] New checksum: ${checksum}`);
    console.log(`[Bookmarks API] Checksums match: ${checksumMatches}`);
    console.log(`[Bookmarks API] Tombstones changed: ${tombstonesChanged}`);
    console.log(`[Bookmarks API] No changes (skip write): ${noChanges}`);

    // If no changes, skip the database write and return early
    if (noChanges) {
      console.log(`[Bookmarks API] Skipping database write - no changes detected`);
      return NextResponse.json({
        synced: normalizedBookmarks.length,
        merged: finalBookmarks.length,
        added: 0,
        updated: 0,
        deleted: 0,
        tombstones: mergedTombstones.length,
        total: finalBookmarks.length,
        version: existingVersion,
        checksum: existingChecksum,
        skipped: true,
        message: 'No changes detected - sync skipped',
      }, { headers });
    }

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
