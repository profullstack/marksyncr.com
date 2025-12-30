/**
 * Tests for refreshConnectedSources function
 *
 * These tests verify that:
 * 1. supabase-cloud is marked as connected when user is authenticated
 * 2. browser-bookmarks is always marked as connected
 * 3. OAuth sources (github, dropbox, google-drive) are connected based on server response
 * 4. OAuth sources not in server response are marked as disconnected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock browser storage
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
  },
};

// Mock browser API
global.browser = {
  storage: mockStorage,
};

// Default sources (same as in background/index.js)
const DEFAULT_SOURCES = [
  { id: 'browser-bookmarks', name: 'Browser Bookmarks', type: 'browser-bookmarks', connected: true, description: 'Sync your browser bookmarks' },
  { id: 'supabase-cloud', name: 'MarkSyncr Cloud', type: 'supabase-cloud', connected: false, description: 'Sync to cloud (requires login)' },
  { id: 'github', name: 'GitHub', type: 'github', connected: false, description: 'Sync to GitHub repository' },
  { id: 'dropbox', name: 'Dropbox', type: 'dropbox', connected: false, description: 'Sync to Dropbox' },
  { id: 'google-drive', name: 'Google Drive', type: 'google-drive', connected: false, description: 'Sync to Google Drive' },
];

/**
 * Simulates the refreshConnectedSources logic from background/index.js
 * This is extracted for testing purposes
 */
async function refreshConnectedSources(getAccessToken, getApiBaseUrl) {
  const baseUrl = getApiBaseUrl();
  const token = await getAccessToken();
  
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }
  
  const response = await fetch(`${baseUrl}/api/sources`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    return { success: false, error: 'Failed to fetch sources' };
  }
  
  const data = await response.json();
  const serverSources = data.sources || [];
  
  // Get current local sources
  const storageData = await browser.storage.local.get('sources');
  const localSources = storageData.sources || DEFAULT_SOURCES;
  
  // Merge server sources with local sources
  const updatedSources = localSources.map((localSource) => {
    // browser-bookmarks is always connected (it's a local source)
    if (localSource.id === 'browser-bookmarks') {
      return { ...localSource, connected: true };
    }
    
    // supabase-cloud is connected when user is authenticated
    if (localSource.id === 'supabase-cloud') {
      return { ...localSource, connected: true };
    }
    
    // For OAuth sources, check server response
    const serverSource = serverSources.find(s => s.id === localSource.id);
    if (serverSource) {
      return {
        ...localSource,
        connected: true,
        providerUsername: serverSource.providerUsername,
        repository: serverSource.repository,
        branch: serverSource.branch,
        filePath: serverSource.filePath,
        connectedAt: serverSource.connectedAt,
      };
    }
    
    // OAuth source not found on server - mark as disconnected
    return { ...localSource, connected: false };
  });
  
  await browser.storage.local.set({ sources: updatedSources });
  
  return { success: true, sources: updatedSources };
}

describe('refreshConnectedSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.local.get.mockResolvedValue({ sources: [...DEFAULT_SOURCES] });
    mockStorage.local.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return error when not authenticated', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(null);
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not authenticated');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should mark supabase-cloud as connected when user is authenticated', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    // Server returns no OAuth sources (user hasn't connected any)
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sources: [] }),
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(true);
    
    const supabaseCloud = result.sources.find(s => s.id === 'supabase-cloud');
    expect(supabaseCloud.connected).toBe(true);
  });

  it('should always mark browser-bookmarks as connected', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sources: [] }),
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(true);
    
    const browserBookmarks = result.sources.find(s => s.id === 'browser-bookmarks');
    expect(browserBookmarks.connected).toBe(true);
  });

  it('should mark OAuth sources as connected when returned by server', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    // Server returns GitHub as connected
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        sources: [
          {
            id: 'github',
            provider: 'github',
            providerUsername: 'testuser',
            repository: 'bookmarks',
            branch: 'main',
            filePath: 'bookmarks.json',
            connectedAt: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(true);
    
    const github = result.sources.find(s => s.id === 'github');
    expect(github.connected).toBe(true);
    expect(github.providerUsername).toBe('testuser');
    expect(github.repository).toBe('bookmarks');
  });

  it('should mark OAuth sources as disconnected when not returned by server', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    // Server returns only GitHub, not Dropbox or Google Drive
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        sources: [
          { id: 'github', provider: 'github', providerUsername: 'testuser' },
        ],
      }),
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(true);
    
    const dropbox = result.sources.find(s => s.id === 'dropbox');
    expect(dropbox.connected).toBe(false);
    
    const googleDrive = result.sources.find(s => s.id === 'google-drive');
    expect(googleDrive.connected).toBe(false);
  });

  it('should handle multiple OAuth sources connected', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    // Server returns GitHub and Dropbox as connected
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        sources: [
          { id: 'github', provider: 'github', providerUsername: 'testuser' },
          { id: 'dropbox', provider: 'dropbox', providerUsername: 'dropboxuser' },
        ],
      }),
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(true);
    
    const github = result.sources.find(s => s.id === 'github');
    expect(github.connected).toBe(true);
    
    const dropbox = result.sources.find(s => s.id === 'dropbox');
    expect(dropbox.connected).toBe(true);
    
    const googleDrive = result.sources.find(s => s.id === 'google-drive');
    expect(googleDrive.connected).toBe(false);
  });

  it('should return error when API request fails', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to fetch sources');
  });

  it('should persist updated sources to browser storage', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sources: [] }),
    });

    await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(mockStorage.local.set).toHaveBeenCalledWith({
      sources: expect.arrayContaining([
        expect.objectContaining({ id: 'supabase-cloud', connected: true }),
        expect.objectContaining({ id: 'browser-bookmarks', connected: true }),
      ]),
    });
  });

  it('should use default sources when local storage is empty', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('valid-token');
    const getApiBaseUrl = vi.fn().mockReturnValue('https://marksyncr.com');

    // Empty storage
    mockStorage.local.get.mockResolvedValue({});

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sources: [] }),
    });

    const result = await refreshConnectedSources(getAccessToken, getApiBaseUrl);

    expect(result.success).toBe(true);
    expect(result.sources).toHaveLength(5); // All default sources
  });
});

describe('logout source disconnection', () => {
  /**
   * Simulates the logout source update logic from store/index.js
   */
  function updateSourcesOnLogout(sources) {
    return sources.map((source) => {
      if (source.id === 'supabase-cloud') {
        return { ...source, connected: false };
      }
      if (['github', 'dropbox', 'google-drive'].includes(source.id)) {
        return { ...source, connected: false };
      }
      return source;
    });
  }

  it('should mark supabase-cloud as disconnected on logout', () => {
    const sources = [
      { id: 'browser-bookmarks', connected: true },
      { id: 'supabase-cloud', connected: true },
      { id: 'github', connected: true },
    ];

    const updated = updateSourcesOnLogout(sources);

    const supabaseCloud = updated.find(s => s.id === 'supabase-cloud');
    expect(supabaseCloud.connected).toBe(false);
  });

  it('should mark OAuth sources as disconnected on logout', () => {
    const sources = [
      { id: 'browser-bookmarks', connected: true },
      { id: 'supabase-cloud', connected: true },
      { id: 'github', connected: true },
      { id: 'dropbox', connected: true },
      { id: 'google-drive', connected: true },
    ];

    const updated = updateSourcesOnLogout(sources);

    expect(updated.find(s => s.id === 'github').connected).toBe(false);
    expect(updated.find(s => s.id === 'dropbox').connected).toBe(false);
    expect(updated.find(s => s.id === 'google-drive').connected).toBe(false);
  });

  it('should keep browser-bookmarks connected on logout', () => {
    const sources = [
      { id: 'browser-bookmarks', connected: true },
      { id: 'supabase-cloud', connected: true },
    ];

    const updated = updateSourcesOnLogout(sources);

    const browserBookmarks = updated.find(s => s.id === 'browser-bookmarks');
    expect(browserBookmarks.connected).toBe(true);
  });
});
