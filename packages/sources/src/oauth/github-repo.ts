/**
 * GitHub Repository Helper
 *
 * Provides functions for creating and managing GitHub repositories
 * for bookmark storage.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_REPO_NAME = 'marksyncr-bookmarks';
const DEFAULT_BRANCH = 'main';
const DEFAULT_FILE_PATH = 'bookmarks.json';

/**
 * Repository creation options
 */
export interface CreateRepositoryOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
}

/**
 * Repository information returned from GitHub API
 */
export interface RepositoryInfo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

/**
 * Result of getOrCreateRepository operation
 */
export interface RepositorySetupResult {
  repository: string;
  branch: string;
  filePath: string;
  created: boolean;
}

/**
 * Bookmark file structure
 */
export interface BookmarkFile {
  version: string;
  metadata: {
    createdAt: string;
    lastModified: string;
    source: string;
    checksum?: string;
  };
  bookmarks: unknown[];
}

/**
 * Create a new GitHub repository
 * @param accessToken - GitHub access token
 * @param options - Repository creation options
 * @returns Repository information
 */
export async function createRepository(
  accessToken: string,
  options: CreateRepositoryOptions
): Promise<RepositoryInfo> {
  if (!accessToken) {
    throw new Error('Access token is required');
  }

  const response = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: options.name,
      description: options.description ?? 'MarkSyncr bookmark storage',
      private: options.private ?? true,
      auto_init: options.autoInit ?? true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create repository: ${error.message ?? response.status}`);
  }

  return response.json();
}

/**
 * Check if a repository exists
 * @param accessToken - GitHub access token
 * @param fullName - Full repository name (e.g., "username/repo")
 * @returns True if repository exists
 */
export async function checkRepositoryExists(
  accessToken: string,
  fullName: string
): Promise<boolean> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  return response.ok;
}

/**
 * Get repository information
 * @param accessToken - GitHub access token
 * @param fullName - Full repository name (e.g., "username/repo")
 * @returns Repository information or null if not found
 */
export async function getRepository(
  accessToken: string,
  fullName: string
): Promise<RepositoryInfo | null> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

/**
 * Get the default bookmark file content structure
 * @returns Default bookmark file content
 */
export function getDefaultBookmarkFileContent(): BookmarkFile {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    metadata: {
      createdAt: now,
      lastModified: now,
      source: 'marksyncr',
    },
    bookmarks: [],
  };
}

/**
 * Initialize the bookmark file in a repository
 * @param accessToken - GitHub access token
 * @param repository - Full repository name (e.g., "username/repo")
 * @param branch - Branch name
 * @param filePath - Path to the bookmark file
 * @returns File creation result or null if file already exists
 */
export async function initializeBookmarkFile(
  accessToken: string,
  repository: string,
  branch: string = DEFAULT_BRANCH,
  filePath: string = DEFAULT_FILE_PATH
): Promise<{ content: { name: string; sha: string }; commit: { sha: string } } | null> {
  // Check if file already exists
  const checkResponse = await fetch(
    `${GITHUB_API_BASE}/repos/${repository}/contents/${filePath}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (checkResponse.ok) {
    // File already exists, don't overwrite
    return null;
  }

  // Create the file with default content
  const content = getDefaultBookmarkFileContent();
  const encodedContent = btoa(JSON.stringify(content, null, 2));

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repository}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Initialize MarkSyncr bookmarks',
      content: encodedContent,
      branch,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create bookmark file: ${error.message ?? response.status}`);
  }

  return response.json();
}

/**
 * Get GitHub user information
 * @param accessToken - GitHub access token
 * @returns User information
 */
export async function getGitHubUser(
  accessToken: string
): Promise<{ login: string; id: number; name: string | null }> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get GitHub user info');
  }

  return response.json();
}

/**
 * Get or create the MarkSyncr bookmark repository
 * This is the main function to call during OAuth callback
 * @param accessToken - GitHub access token
 * @param repoName - Optional custom repository name
 * @returns Repository setup result
 */
export async function getOrCreateRepository(
  accessToken: string,
  repoName: string = DEFAULT_REPO_NAME
): Promise<RepositorySetupResult> {
  // Get user info to construct full repo name
  const user = await getGitHubUser(accessToken);
  const fullName = `${user.login}/${repoName}`;

  // Check if repository already exists
  const exists = await checkRepositoryExists(accessToken, fullName);

  if (exists) {
    const repo = await getRepository(accessToken, fullName);
    return {
      repository: fullName,
      branch: repo?.default_branch ?? DEFAULT_BRANCH,
      filePath: DEFAULT_FILE_PATH,
      created: false,
    };
  }

  // Create new repository
  const newRepo = await createRepository(accessToken, {
    name: repoName,
    description: 'MarkSyncr bookmark storage - automatically synced browser bookmarks',
    private: true,
    autoInit: true,
  });

  // Initialize bookmark file
  await initializeBookmarkFile(
    accessToken,
    newRepo.full_name,
    newRepo.default_branch,
    DEFAULT_FILE_PATH
  );

  return {
    repository: newRepo.full_name,
    branch: newRepo.default_branch,
    filePath: DEFAULT_FILE_PATH,
    created: true,
  };
}

export default {
  createRepository,
  checkRepositoryExists,
  getRepository,
  getDefaultBookmarkFileContent,
  initializeBookmarkFile,
  getGitHubUser,
  getOrCreateRepository,
};
