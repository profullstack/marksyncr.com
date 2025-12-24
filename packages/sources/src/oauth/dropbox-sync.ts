/**
 * Dropbox Sync Helper
 *
 * Provides functions for syncing bookmarks to Dropbox.
 * This module handles reading and writing the bookmarks.json file.
 * Sync happens via Dropbox API - only updates when checksum differs.
 */

const DROPBOX_CONTENT_BASE = 'https://content.dropboxapi.com/2';
const DEFAULT_PATH = '/Apps/MarkSyncr/bookmarks.json';

/**
 * Bookmark data structure for sync
 */
export interface BookmarkSyncData {
  bookmarks: Array<{
    url: string;
    title?: string;
    folderPath?: string;
    dateAdded?: number | string;
    id?: string;
  }>;
  tombstones?: Array<{
    url: string;
    deletedAt: number;
  }>;
  checksum?: string;
}

/**
 * Bookmark file structure stored in Dropbox
 */
export interface BookmarkFile {
  version: string;
  metadata: {
    createdAt: string;
    lastModified: string;
    source: string;
    checksum?: string;
  };
  bookmarks: Array<{
    url: string;
    title?: string;
    folderPath?: string;
    dateAdded?: number | string;
    id?: string;
  }>;
  tombstones?: Array<{
    url: string;
    deletedAt: number;
  }>;
}

/**
 * Result of getting a bookmark file
 */
export interface GetBookmarkFileResult {
  content: BookmarkFile;
  rev: string;
  contentHash: string;
}

/**
 * Result of a Dropbox sync operation
 */
export interface DropboxSyncResult {
  success: boolean;
  rev: string;
  created: boolean;
  skipped: boolean;
  bookmarkCount: number;
  error?: string;
}

/**
 * Dropbox API metadata from response header
 */
interface DropboxApiResult {
  rev: string;
  content_hash: string;
}

/**
 * Get the bookmark file from Dropbox
 * @param accessToken - Dropbox access token
 * @param path - Path to the bookmark file in Dropbox
 * @returns File content, revision, and content hash, or null if file doesn't exist
 */
export async function getBookmarkFile(
  accessToken: string,
  path: string = DEFAULT_PATH
): Promise<GetBookmarkFileResult | null> {
  const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });

  if (!response.ok) {
    // Try to get error details from response
    const errorText = await response.text().catch(() => '');
    let errorSummary = `HTTP ${response.status}`;
    
    try {
      const errorJson = JSON.parse(errorText) as { error_summary?: string; error?: { '.tag'?: string } };
      if (errorJson.error_summary) {
        errorSummary = errorJson.error_summary;
      }
      // Check for path/not_found error (file doesn't exist)
      if (errorJson.error?.['.tag'] === 'path' || errorSummary.includes('path/not_found')) {
        return null;
      }
    } catch {
      // Not JSON, use text if available
      if (errorText) {
        errorSummary = errorText.substring(0, 200);
      }
    }
    
    // 409 Conflict often means path not found
    if (response.status === 409) {
      return null;
    }
    
    throw new Error(`Failed to get bookmark file: ${errorSummary}`);
  }

  // Get metadata from response header
  const apiResultHeader = response.headers.get('dropbox-api-result');
  const metadata: DropboxApiResult = apiResultHeader 
    ? JSON.parse(apiResultHeader) as DropboxApiResult
    : { rev: '', content_hash: '' };

  const contentString = await response.text();
  const content = JSON.parse(contentString) as BookmarkFile;

  return {
    content,
    rev: metadata.rev,
    contentHash: metadata.content_hash,
  };
}

/**
 * Update the bookmark file in Dropbox
 * Only updates if checksum differs from existing file
 * @param accessToken - Dropbox access token
 * @param path - Path to the bookmark file in Dropbox
 * @param data - Bookmark data to sync
 * @returns Sync result
 */
export async function updateBookmarkFile(
  accessToken: string,
  path: string = DEFAULT_PATH,
  data: BookmarkSyncData
): Promise<DropboxSyncResult> {
  if (!accessToken) {
    throw new Error('Access token is required');
  }

  // Try to get existing file to check checksum and get revision
  const existing = await getBookmarkFile(accessToken, path);

  const bookmarkCount = data.bookmarks.length;

  // Check if checksum matches - skip update if data hasn't changed
  // Only skip if both checksums exist and match
  if (existing && data.checksum && existing.content.metadata.checksum === data.checksum) {
    return {
      success: true,
      rev: existing.rev,
      created: false,
      skipped: true,
      bookmarkCount,
    };
  }

  const now = new Date().toISOString();

  // Build the file content
  const fileContent: BookmarkFile = {
    version: '1.0',
    metadata: {
      createdAt: existing?.content.metadata.createdAt ?? now,
      lastModified: now,
      source: 'marksyncr',
      checksum: data.checksum,
    },
    bookmarks: data.bookmarks,
    tombstones: data.tombstones,
  };

  const contentString = JSON.stringify(fileContent, null, 2);

  // Build Dropbox-API-Arg header
  // Use 'update' mode with rev for existing files, 'add' for new files
  const dropboxArg: Record<string, unknown> = {
    path,
    mode: existing ? { '.tag': 'update', update: existing.rev } : 'add',
    autorename: false,
    mute: true, // Don't trigger notifications
  };

  const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify(dropboxArg),
      'Content-Type': 'application/octet-stream',
    },
    body: contentString,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error_summary: 'Unknown error' })) as { error_summary: string };
    throw new Error(`Failed to update bookmark file: ${error.error_summary}`);
  }

  const result = await response.json() as { rev: string };

  return {
    success: true,
    rev: result.rev,
    created: !existing,
    skipped: false,
    bookmarkCount,
  };
}

/**
 * Sync bookmarks to Dropbox
 * This is a convenience function that handles the full sync flow
 * @param accessToken - Dropbox access token
 * @param path - Path to the bookmark file in Dropbox
 * @param bookmarks - Array of bookmarks to sync
 * @param tombstones - Array of tombstones for deleted bookmarks
 * @param checksum - Optional checksum for verification
 * @returns Sync result
 */
export async function syncBookmarksToDropbox(
  accessToken: string,
  path: string,
  bookmarks: BookmarkSyncData['bookmarks'],
  tombstones: BookmarkSyncData['tombstones'] = [],
  checksum?: string
): Promise<DropboxSyncResult> {
  return updateBookmarkFile(accessToken, path, {
    bookmarks,
    tombstones,
    checksum,
  });
}

export default {
  getBookmarkFile,
  updateBookmarkFile,
  syncBookmarksToDropbox,
};
