/**
 * @fileoverview Tests for extension API client
 * Tests all API functions in apps/extension/src/lib/api.js
 * Uses Vitest with mocked fetch and browser APIs
 * 
 * Authentication: Session cookies only (credentials: 'include')
 * The server sets HttpOnly cookies on login, which are automatically
 * sent with all subsequent requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser storage API
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockStorageRemove = vi.fn();
const mockBookmarksGetTree = vi.fn();

// Mock browser API
const mockBrowserAPI = {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
      remove: mockStorageRemove,
    },
  },
  bookmarks: {
    getTree: mockBookmarksGetTree,
  },
};

// Set up global chrome/browser mock
global.chrome = mockBrowserAPI;
global.browser = undefined;

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock import.meta.env
vi.stubEnv('VITE_APP_URL', 'https://marksyncr.com');

// Import after mocks
const api = await import('../src/lib/api.js');

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
    mockStorageSet.mockResolvedValue(undefined);
    mockStorageRemove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('signInWithEmail', () => {
    it('should call login API with email and password', async () => {
      const mockResponse = {
        user: { id: 'user-123', email: 'test@example.com' },
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await api.signInWithEmail('test@example.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should store user data on successful login', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockResponse = {
        user: mockUser,
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await api.signInWithEmail('test@example.com', 'password123');

      expect(mockStorageSet).toHaveBeenCalledWith({
        user: mockUser,
        isLoggedIn: true,
      });
    });

    it('should throw error on failed login', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      });

      await expect(api.signInWithEmail('test@example.com', 'wrong')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should throw generic error when no error message provided', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });

      await expect(api.signInWithEmail('test@example.com', 'wrong')).rejects.toThrow(
        'Login failed'
      );
    });
  });

  describe('signUpWithEmail', () => {
    it('should call signup API with email and password', async () => {
      const mockResponse = {
        user: { id: 'user-123' },
        message: 'Check your email',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await api.signUpWithEmail('test@example.com', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/auth/signup',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw error on failed signup', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Email already exists' }),
      });

      await expect(api.signUpWithEmail('test@example.com', 'password123')).rejects.toThrow(
        'Email already exists'
      );
    });
  });

  describe('signOut', () => {
    it('should call logout API and clear user data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Logged out' }),
      });

      await api.signOut();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
      expect(mockStorageRemove).toHaveBeenCalledWith(['user', 'isLoggedIn']);
    });

    it('should clear user data even if API call fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await api.signOut();

      expect(mockStorageRemove).toHaveBeenCalledWith(['user', 'isLoggedIn']);
    });
  });

  describe('getSession', () => {
    it('should call session API with credentials', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ session: { user: { id: 'user-123' } } }),
      });

      const result = await api.getSession();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/auth/session',
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(result).toEqual({ user: { id: 'user-123' } });
    });

    it('should return null when session API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Not authenticated' }),
      });

      const result = await api.getSession();

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await api.getSession();

      expect(result).toBeNull();
    });
  });

  describe('getUser', () => {
    it('should return cached user from storage', async () => {
      const cachedUser = { id: 'user-123', email: 'test@example.com' };
      mockStorageGet.mockResolvedValue({ user: cachedUser, isLoggedIn: true });

      const result = await api.getUser();

      expect(result).toEqual(cachedUser);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch user from API when not cached', async () => {
      mockStorageGet.mockResolvedValue({});
      
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      const result = await api.getUser();

      expect(result).toEqual(mockUser);
    });

    it('should cache user after fetching from API', async () => {
      mockStorageGet.mockResolvedValue({});
      
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ user: mockUser }),
      });

      await api.getUser();

      expect(mockStorageSet).toHaveBeenCalledWith({
        user: mockUser,
        isLoggedIn: true,
      });
    });

    it('should return null when not logged in and API fails', async () => {
      mockStorageGet.mockResolvedValue({});
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await api.getUser();

      expect(result).toBeNull();
    });
  });

  describe('isLoggedIn', () => {
    it('should return false when not logged in locally', async () => {
      mockStorageGet.mockResolvedValue({});

      const result = await api.isLoggedIn();

      expect(result).toBe(false);
    });

    it('should verify with server when logged in locally', async () => {
      mockStorageGet.mockResolvedValue({ isLoggedIn: true });
      mockFetch.mockResolvedValue({ ok: true });

      const result = await api.isLoggedIn();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should return false when server verification fails', async () => {
      mockStorageGet.mockResolvedValue({ isLoggedIn: true });
      mockFetch.mockResolvedValue({ ok: false });

      const result = await api.isLoggedIn();

      expect(result).toBe(false);
    });
  });

  describe('fetchSubscription', () => {
    it('should fetch subscription with credentials', async () => {
      const mockSubscription = {
        subscription: { tier: 'pro', status: 'active' },
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSubscription,
      });

      const result = await api.fetchSubscription();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/subscription',
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockSubscription);
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await api.fetchSubscription();

      expect(result).toBeNull();
    });
  });

  describe('fetchCloudSettings', () => {
    it('should fetch settings with credentials', async () => {
      const mockSettings = {
        settings: { syncEnabled: true, theme: 'dark' },
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSettings,
      });

      const result = await api.fetchCloudSettings();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/settings',
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockSettings);
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Failed' }),
      });

      const result = await api.fetchCloudSettings();

      expect(result).toBeNull();
    });
  });

  describe('saveCloudSettings', () => {
    it('should save settings with PUT request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ settings: { theme: 'dark' } }),
      });

      const result = await api.saveCloudSettings({ theme: 'dark' });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/settings',
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ theme: 'dark' }),
        })
      );
    });

    it('should return false on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await api.saveCloudSettings({ theme: 'dark' });

      expect(result).toBe(false);
    });
  });

  describe('fetchBookmarks', () => {
    it('should fetch bookmarks with credentials', async () => {
      const mockBookmarks = {
        bookmarks: [{ id: '1', url: 'https://example.com' }],
        count: 1,
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockBookmarks,
      });

      const result = await api.fetchBookmarks();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/bookmarks',
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockBookmarks);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await api.fetchBookmarks();

      expect(result).toEqual({ bookmarks: [], count: 0 });
    });
  });

  describe('syncBookmarks', () => {
    it('should sync bookmarks with POST request', async () => {
      const bookmarks = [
        { url: 'https://example.com', title: 'Example' },
      ];
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ synced: 1, total: 1 }),
      });

      const result = await api.syncBookmarks(bookmarks, 'browser');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/bookmarks',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ bookmarks, source: 'browser' }),
        })
      );
      expect(result.synced).toBe(1);
    });

    it('should throw error on failed sync', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Sync failed' }),
      });

      await expect(api.syncBookmarks([], 'browser')).rejects.toThrow('Sync failed');
    });
  });

  describe('deleteBookmark', () => {
    it('should delete bookmark by URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await api.deleteBookmark('https://example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/bookmarks',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
          body: JSON.stringify({ url: 'https://example.com' }),
        })
      );
      expect(result).toBe(true);
    });

    it('should delete bookmark by ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await api.deleteBookmark('bookmark-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/bookmarks',
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
          body: JSON.stringify({ id: 'bookmark-123' }),
        })
      );
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await api.deleteBookmark('https://example.com');

      expect(result).toBe(false);
    });
  });

  describe('getBrowserBookmarks', () => {
    it('should return flattened bookmark tree', async () => {
      const mockTree = [
        {
          id: 'root',
          children: [
            {
              id: 'folder1',
              title: 'Bookmarks Bar',
              children: [
                { id: '1', url: 'https://example.com', title: 'Example' },
                { id: '2', url: 'https://test.com', title: 'Test' },
              ],
            },
          ],
        },
      ];

      mockBookmarksGetTree.mockResolvedValue(mockTree);

      const result = await api.getBrowserBookmarks();

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://example.com');
      expect(result[1].url).toBe('https://test.com');
    });

    it('should include folder path in bookmarks', async () => {
      const mockTree = [
        {
          id: 'root',
          children: [
            {
              id: 'folder1',
              title: 'Work',
              children: [
                {
                  id: 'folder2',
                  title: 'Projects',
                  children: [
                    { id: '1', url: 'https://example.com', title: 'Example' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      mockBookmarksGetTree.mockResolvedValue(mockTree);

      const result = await api.getBrowserBookmarks();

      expect(result[0].folderPath).toBe('Work/Projects');
    });

    it('should return empty array when bookmarks API is not available', async () => {
      // Temporarily remove bookmarks API
      const originalBookmarks = global.chrome.bookmarks;
      global.chrome.bookmarks = undefined;

      // Re-import to get fresh module
      vi.resetModules();
      const freshApi = await import('../src/lib/api.js');

      const result = await freshApi.getBrowserBookmarks();

      expect(result).toEqual([]);

      // Restore
      global.chrome.bookmarks = originalBookmarks;
    });

    it('should return empty array on error', async () => {
      mockBookmarksGetTree.mockRejectedValue(new Error('Permission denied'));

      const result = await api.getBrowserBookmarks();

      expect(result).toEqual([]);
    });
  });

  describe('fetchVersionHistory', () => {
    it('should fetch version history with pagination', async () => {
      const mockVersions = {
        versions: [{ id: '1', created_at: '2024-01-01' }],
        retentionLimit: 10,
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockVersions,
      });

      const result = await api.fetchVersionHistory(10, 0);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/versions?limit=10&offset=0',
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockVersions);
    });

    it('should return empty versions on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await api.fetchVersionHistory();

      expect(result).toEqual({ versions: [], retentionLimit: 5 });
    });
  });

  describe('fetchTags', () => {
    it('should fetch tags with credentials', async () => {
      const mockTags = {
        tags: [{ id: '1', name: 'work', color: '#ff0000' }],
      };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTags,
      });

      const result = await api.fetchTags();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/tags',
        expect.objectContaining({
          credentials: 'include',
        })
      );
      expect(result).toEqual([{ id: '1', name: 'work', color: '#ff0000' }]);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const result = await api.fetchTags();

      expect(result).toEqual([]);
    });
  });

  describe('saveBookmarkVersion', () => {
    it('should save bookmark version with POST request', async () => {
      const bookmarkData = { bookmarks: [{ url: 'https://example.com' }] };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ version: { id: 'v1' } }),
      });

      const result = await api.saveBookmarkVersion(bookmarkData, 'browser', 'My Device');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://marksyncr.com/api/versions',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({
            bookmarkData,
            sourceType: 'browser',
            deviceName: 'My Device',
          }),
        })
      );
      expect(result).toEqual({ version: { id: 'v1' } });
    });

    it('should throw error on failed save', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Failed to save version' }),
      });

      await expect(
        api.saveBookmarkVersion({}, 'browser', 'Device')
      ).rejects.toThrow('Failed to save version');
    });
  });
});

describe('API Client Session Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
    mockStorageSet.mockResolvedValue(undefined);
    mockStorageRemove.mockResolvedValue(undefined);
  });

  it('should clear user data on 401 response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Not authenticated' }),
    });

    await api.fetchCloudSettings();

    expect(mockStorageRemove).toHaveBeenCalledWith(['user', 'isLoggedIn']);
  });

  it('should not clear user data on other errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    await api.fetchCloudSettings();

    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});
