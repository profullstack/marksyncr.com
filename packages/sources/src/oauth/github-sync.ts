/**
 * GitHub Sync Helper
 *
 * Provides functions for syncing bookmarks to a GitHub repository.
 * This module handles reading and writing the bookmarks.json file.
 */

const GITHUB_API_BASE = 'https://api.github.com';

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
 * Bookmark file structure stored in GitHub
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
  sha: string;
}

/**
 * Result of a GitHub sync operation
 */
export interface GitHubSyncResult {
  success: boolean;
  sha: string;
  created: boolean;
  bookmarkCount: number;
  error?: string;
}

/**
 * Get the bookmark file from a GitHub repository
 * @param accessToken - GitHub access token
 * @param repository - Full repository name (e.g., "username/repo")
 * @param branch - Branch name
 * @param filePath - Path to the bookmark file
 * @returns File content and SHA, or null if file doesn't exist
 */
export async function getBookmarkFile(
  accessToken: string,
  repository: string,
  branch: string = 'main',
  filePath: string = 'bookmarks.json'
): Promise<GetBookmarkFileResult | null> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${repository}/contents/${filePath}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to get bookmark file: ${error.message ?? response.status}`);
  }

  const data = await response.json();
  
  // Decode base64 content
  const contentString = Buffer.from(data.content, 'base64').toString('utf-8');
  const content = JSON.parse(contentString) as BookmarkFile;

  return {
    content,
    sha: data.sha,
  };
}

/**
 * Update the bookmark file in a GitHub repository
 * @param accessToken - GitHub access token
 * @param repository - Full repository name (e.g., "username/repo")
 * @param branch - Branch name
 * @param filePath - Path to the bookmark file
 * @param data - Bookmark data to sync
 * @returns Sync result
 */
export async function updateBookmarkFile(
  accessToken: string,
  repository: string,
  branch: string = 'main',
  filePath: string = 'bookmarks.json',
  data: BookmarkSyncData
): Promise<GitHubSyncResult> {
  if (!accessToken) {
    throw new Error('Access token is required');
  }

  if (!repository) {
    throw new Error('Repository is required');
  }

  // Try to get existing file to get SHA and preserve metadata
  const existing = await getBookmarkFile(accessToken, repository, branch, filePath);
  
  const now = new Date().toISOString();
  const bookmarkCount = data.bookmarks.length;

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

  // Encode content as base64
  const encodedContent = Buffer.from(JSON.stringify(fileContent, null, 2)).toString('base64');

  // Build commit message
  const commitMessage = existing
    ? `Update bookmarks via MarkSyncr (${bookmarkCount} bookmarks)`
    : `Initialize bookmarks via MarkSyncr (${bookmarkCount} bookmarks)`;

  // Build request body
  const requestBody: Record<string, unknown> = {
    message: commitMessage,
    content: encodedContent,
    branch,
  };

  // Include SHA if updating existing file
  if (existing) {
    requestBody.sha = existing.sha;
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${repository}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to update bookmark file: ${error.message ?? response.status}`);
  }

  const result = await response.json();

  return {
    success: true,
    sha: result.content.sha,
    created: !existing,
    bookmarkCount,
  };
}

/**
 * Sync bookmarks to a GitHub repository
 * This is a convenience function that handles the full sync flow
 * @param accessToken - GitHub access token
 * @param repository - Full repository name (e.g., "username/repo")
 * @param branch - Branch name
 * @param filePath - Path to the bookmark file
 * @param bookmarks - Array of bookmarks to sync
 * @param tombstones - Array of tombstones for deleted bookmarks
 * @param checksum - Optional checksum for verification
 * @returns Sync result
 */
export async function syncBookmarksToGitHub(
  accessToken: string,
  repository: string,
  branch: string,
  filePath: string,
  bookmarks: BookmarkSyncData['bookmarks'],
  tombstones: BookmarkSyncData['tombstones'] = [],
  checksum?: string
): Promise<GitHubSyncResult> {
  return updateBookmarkFile(accessToken, repository, branch, filePath, {
    bookmarks,
    tombstones,
    checksum,
  });
}

export default {
  getBookmarkFile,
  updateBookmarkFile,
  syncBookmarksToGitHub,
};
