/**
 * Version History API Routes
 * GET /api/versions - Get version history
 * POST /api/versions - Save a new version
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 *
 * IMPORTANT: Version deduplication
 * - Before creating a new version, we check if the latest version has the same checksum
 * - If checksums match, we skip creating a new version to avoid cluttering history
 * - This prevents duplicate entries when auto-sync runs every 5 minutes with no changes
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import crypto from 'crypto';

const METHODS = ['GET', 'POST', 'OPTIONS'];

/**
 * Normalize bookmarks for checksum comparison
 * This MUST match the normalization in:
 * - apps/web/app/api/bookmarks/route.js
 * - apps/extension/src/background/index.js
 *
 * We extract only the fields that matter for content comparison,
 * excluding dateAdded (which changes when bookmarks are synced to a new browser)
 * and other metadata fields.
 */
/**
 * Normalize bookmarks for checksum comparison
 * This MUST match the normalization in:
 * - apps/web/app/api/bookmarks/route.js
 * - apps/extension/src/background/index.js
 *
 * We extract only the fields that matter for content comparison,
 * excluding dateAdded (which changes when bookmarks are synced to a new browser)
 * and other metadata fields.
 *
 * IMPORTANT: Do NOT sort by type - this would break the interleaved order
 * of folders and bookmarks. The sorting must match the other implementations
 * exactly to produce consistent checksums.
 */
function normalizeItemsForChecksum(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (item.type === 'folder') {
        return {
          type: 'folder',
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      } else {
        // Bookmark entry (default for backwards compatibility)
        return {
          type: 'bookmark',
          url: item.url,
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      }
    })
    .sort((a, b) => {
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
 * Extract flat array of bookmarks from nested format
 * The bookmarkData might be in nested format: { roots: { toolbar: { children: [...] } } }
 */
function extractBookmarksFromNested(data) {
  if (!data) return [];

  // If it's already an array, return it
  if (Array.isArray(data)) return data;

  // If it has a 'roots' property, extract from nested format
  if (data.roots) {
    const bookmarks = [];

    function extractFromNode(node, path = '', index = 0) {
      if (!node) return;

      // If it's a bookmark (has url)
      if (node.url) {
        bookmarks.push({
          type: 'bookmark',
          url: node.url,
          title: node.title ?? '',
          folderPath: path,
          index: node.index ?? index,
        });
        return;
      }

      // If it's a folder with children
      if (node.children && Array.isArray(node.children)) {
        const newPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;

        // Add folder entry if it has a title and is not a root
        if (node.title && path) {
          bookmarks.push({
            type: 'folder',
            title: node.title,
            folderPath: path,
            index: node.index ?? index,
          });
        }

        for (let i = 0; i < node.children.length; i++) {
          extractFromNode(node.children[i], newPath, i);
        }
      }
    }

    // Extract from each root
    for (const [rootKey, rootNode] of Object.entries(data.roots)) {
      if (rootNode && rootNode.children) {
        const rootPath = rootNode.title || rootKey;
        for (let i = 0; i < rootNode.children.length; i++) {
          extractFromNode(rootNode.children[i], rootPath, i);
        }
      }
    }

    return bookmarks;
  }

  return [];
}

/**
 * Generate checksum for bookmark data using normalized comparison
 * This ensures consistent checksums across extension and server
 */
function generateNormalizedChecksum(bookmarkData) {
  const items = extractBookmarksFromNested(bookmarkData);
  const normalized = normalizeItemsForChecksum(items);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, METHODS),
  });
}

/**
 * GET /api/versions
 * Get version history for the authenticated user
 */
export async function GET(request) {
  const headers = corsHeaders(request, METHODS);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { data, error } = await supabase.rpc('get_version_history', {
      p_user_id: user.id,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('Failed to get version history:', error);
      return NextResponse.json(
        { error: 'Failed to get version history' },
        { status: 500, headers }
      );
    }

    // Get retention limit for the user
    const { data: retentionLimit } = await supabase.rpc('get_version_retention_limit', {
      p_user_id: user.id,
    });

    return NextResponse.json(
      {
        versions: (data || []).map((v) => ({
          id: v.id,
          version: v.version,
          checksum: v.checksum,
          sourceType: v.source_type,
          sourceName: v.source_name,
          deviceName: v.device_name,
          changeSummary: v.change_summary,
          createdAt: v.created_at,
          bookmarkCount: v.bookmark_count,
          folderCount: v.folder_count,
        })),
        retentionLimit: retentionLimit || 5,
      },
      { headers }
    );
  } catch (error) {
    console.error('Version history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * POST /api/versions
 * Save a new version (called after sync)
 *
 * IMPORTANT: This endpoint now performs checksum deduplication:
 * - Before creating a new version, we check if the latest version has the same checksum
 * - If checksums match, we return the existing version without creating a new one
 * - This prevents duplicate entries when auto-sync runs every 5 minutes with no changes
 */
export async function POST(request) {
  const headers = corsHeaders(request, METHODS);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    const body = await request.json();
    const { bookmarkData, sourceType, sourceName, deviceId, deviceName, changeSummary } = body;

    if (!bookmarkData || !sourceType) {
      return NextResponse.json(
        { error: 'Missing required fields: bookmarkData, sourceType' },
        { status: 400, headers }
      );
    }

    // Compute checksum using normalized algorithm (matches extension and bookmarks API)
    // This ensures consistent checksums regardless of dateAdded, exportedAt, etc.
    const checksum = generateNormalizedChecksum(bookmarkData);

    console.log(`[Versions API] Computed normalized checksum: ${checksum}`);

    // Check if the latest version has the same checksum (deduplication)
    const { data: latestVersions, error: fetchError } = await supabase
      .from('bookmark_versions')
      .select('id, version, checksum, created_at')
      .eq('user_id', user.id)
      .order('version', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Failed to fetch latest version:', fetchError);
      // Continue anyway - we'll create a new version
    }

    const latestVersion = latestVersions?.[0];

    // If the latest version has the same checksum, skip creating a new version
    if (latestVersion && latestVersion.checksum === checksum) {
      console.log(
        `[Versions API] Checksum matches latest version ${latestVersion.version}, skipping duplicate`
      );

      return NextResponse.json(
        {
          version: {
            id: latestVersion.id,
            version: latestVersion.version,
            checksum: latestVersion.checksum,
            createdAt: latestVersion.created_at,
          },
          skipped: true,
          message: 'No changes detected - version already exists',
        },
        { headers }
      );
    }

    console.log(
      `[Versions API] Checksum differs from latest (${latestVersion?.checksum || 'none'}), creating new version`
    );

    const { data, error } = await supabase.rpc('save_bookmark_version', {
      p_user_id: user.id,
      p_bookmark_data: bookmarkData,
      p_checksum: checksum,
      p_source_type: sourceType,
      p_source_name: sourceName || null,
      p_device_id: deviceId || null,
      p_device_name: deviceName || null,
      p_change_summary: changeSummary || {},
    });

    if (error) {
      console.error('Failed to save version:', error);
      return NextResponse.json({ error: 'Failed to save version' }, { status: 500, headers });
    }

    return NextResponse.json(
      {
        version: {
          id: data?.id,
          version: data?.version,
          checksum: data?.checksum,
          createdAt: data?.created_at,
        },
      },
      { headers }
    );
  } catch (error) {
    console.error('Save version error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
