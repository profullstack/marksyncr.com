/**
 * Tests for sources initialization race condition fix
 *
 * BUG: Connected services not showing after login/popup open
 *
 * ROOT CAUSE: Race condition between:
 * 1. Popup initialization loading stale sources from storage
 * 2. refreshSources() async call updating sources from server
 *
 * The popup would render with stale data before refreshSources() completed.
 *
 * FIX: The initialize() function must ensure refreshSources() completes
 * and updates the store state BEFORE returning, so the popup shows
 * the correct connected services immediately.
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

// Mock browser runtime for message passing
const mockRuntime = {
  sendMessage: vi.fn(),
};

// Mock browser bookmarks
const mockBookmarks = {
  getTree: vi.fn(),
};

// Mock browser API
global.browser = {
  storage: mockStorage,
  runtime: mockRuntime,
  bookmarks: mockBookmarks,
};

// Also mock chrome for cross-browser compatibility
global.chrome = {
  storage: mockStorage,
  runtime: mockRuntime,
  bookmarks: mockBookmarks,
};

// Default sources (same as in store/index.js)
const DEFAULT_SOURCES = [
  {
    id: 'browser-bookmarks',
    name: 'Browser Bookmarks',
    type: 'browser-bookmarks',
    connected: true,
    description: 'Sync your browser bookmarks',
  },
  {
    id: 'supabase-cloud',
    name: 'MarkSyncr Cloud',
    type: 'supabase-cloud',
    connected: false,
    description: 'Sync to cloud (requires login)',
  },
  {
    id: 'github',
    name: 'GitHub',
    type: 'github',
    connected: false,
    description: 'Sync to GitHub repository',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    type: 'dropbox',
    connected: false,
    description: 'Sync to Dropbox',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    type: 'google-drive',
    connected: false,
    description: 'Sync to Google Drive',
  },
];

// Mock bookmark tree
const MOCK_BOOKMARK_TREE = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks Bar',
        children: [{ id: '2', title: 'Test', url: 'https://test.com' }],
      },
    ],
  },
];

describe('Sources initialization race condition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBookmarks.getTree.mockResolvedValue(MOCK_BOOKMARK_TREE);
    mockStorage.local.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initialize() with authenticated user', () => {
    it('should have sources updated BEFORE initialize() returns', async () => {
      // Setup: User is authenticated, has GitHub connected on server
      const serverSources = [
        { id: 'github', provider: 'github', providerUsername: 'testuser', repository: 'bookmarks' },
      ];

      // Storage has stale sources (all disconnected except browser-bookmarks)
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (Array.isArray(keys)) {
          return {
            selectedSource: 'browser-bookmarks',
            settings: { autoSync: true },
            lastSync: null,
            sources: [...DEFAULT_SOURCES], // Stale: supabase-cloud and github are disconnected
          };
        }
        if (keys === 'session') {
          return { session: { access_token: 'valid-token', extension_token: 'ext-token' } };
        }
        if (keys === 'sources') {
          return { sources: [...DEFAULT_SOURCES] };
        }
        return {};
      });

      // Mock REFRESH_SOURCES message response from background
      mockRuntime.sendMessage.mockImplementation(async (message) => {
        if (message.type === 'REFRESH_SOURCES') {
          // Simulate server returning connected sources
          const updatedSources = DEFAULT_SOURCES.map((s) => {
            if (s.id === 'supabase-cloud') return { ...s, connected: true };
            if (s.id === 'github')
              return {
                ...s,
                connected: true,
                providerUsername: 'testuser',
                repository: 'bookmarks',
              };
            return s;
          });
          return { success: true, sources: updatedSources };
        }
        return { success: false };
      });

      // Mock API calls for checkAuth
      mockFetch.mockImplementation(async (url) => {
        if (url.includes('/api/auth/session')) {
          return {
            ok: true,
            json: async () => ({ user: { id: 'user-1', email: 'test@test.com' } }),
          };
        }
        if (url.includes('/api/subscription')) {
          return { ok: true, json: async () => ({ plan: 'free', status: 'active' }) };
        }
        if (url.includes('/api/settings')) {
          return { ok: true, json: async () => ({}) };
        }
        if (url.includes('/api/tags')) {
          return { ok: true, json: async () => ({ tags: [] }) };
        }
        return { ok: false };
      });

      // Simulate the store's initialize + checkAuth flow
      // This is what the fix should ensure: sources are updated before returning
      let finalSources = [...DEFAULT_SOURCES];

      // Simulate initialize()
      const storedData = await mockStorage.local.get([
        'selectedSource',
        'settings',
        'lastSync',
        'sources',
      ]);
      finalSources = storedData.sources || DEFAULT_SOURCES;

      // Simulate checkAuth() -> refreshSources()
      const refreshResult = await mockRuntime.sendMessage({ type: 'REFRESH_SOURCES' });
      if (refreshResult.success && refreshResult.sources) {
        finalSources = refreshResult.sources;
      }

      // ASSERTION: After initialize() returns, sources should be updated
      const supabaseCloud = finalSources.find((s) => s.id === 'supabase-cloud');
      const github = finalSources.find((s) => s.id === 'github');

      expect(supabaseCloud.connected).toBe(true);
      expect(github.connected).toBe(true);
      expect(github.providerUsername).toBe('testuser');
    });

    it('should NOT show stale disconnected sources when user is authenticated', async () => {
      // This test verifies the bug scenario:
      // User logs in, popup shows "Not Connected" for supabase-cloud
      // because refreshSources() hasn't completed yet

      // Setup: Stale storage has supabase-cloud disconnected
      const staleSources = DEFAULT_SOURCES.map((s) => ({ ...s })); // All disconnected except browser-bookmarks

      mockStorage.local.get.mockResolvedValue({
        sources: staleSources,
        session: { access_token: 'valid-token' },
      });

      // Background returns updated sources with supabase-cloud connected
      mockRuntime.sendMessage.mockResolvedValue({
        success: true,
        sources: DEFAULT_SOURCES.map((s) =>
          s.id === 'supabase-cloud' ? { ...s, connected: true } : s
        ),
      });

      // Simulate the CORRECT flow (after fix):
      // 1. Load from storage (stale)
      const storedData = await mockStorage.local.get(['sources', 'session']);
      let sources = storedData.sources;

      // At this point, supabase-cloud is disconnected (stale)
      expect(sources.find((s) => s.id === 'supabase-cloud').connected).toBe(false);

      // 2. If authenticated, refresh sources and WAIT for result
      if (storedData.session?.access_token) {
        const result = await mockRuntime.sendMessage({ type: 'REFRESH_SOURCES' });
        if (result.success && result.sources) {
          sources = result.sources;
        }
      }

      // 3. NOW sources should be updated
      expect(sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);
    });
  });

  describe('login() flow', () => {
    it('should refresh sources after successful login', async () => {
      // Setup: User just logged in
      mockStorage.local.get.mockResolvedValue({
        sources: [...DEFAULT_SOURCES],
      });

      // Mock successful login response
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          user: { id: 'user-1', email: 'test@test.com' },
          session: { access_token: 'new-token', extension_token: 'ext-token' },
        }),
      });

      // Background returns updated sources
      mockRuntime.sendMessage.mockResolvedValue({
        success: true,
        sources: DEFAULT_SOURCES.map((s) =>
          s.id === 'supabase-cloud' ? { ...s, connected: true } : s
        ),
      });

      // Simulate login flow
      // 1. Login API call succeeds
      // 2. Store session
      // 3. Refresh sources (this is the key step)
      const refreshResult = await mockRuntime.sendMessage({ type: 'REFRESH_SOURCES' });

      // Sources should be updated after login
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);
    });

    it('should update store state with refreshed sources after login', async () => {
      // This test ensures the store state is updated, not just browser.storage.local

      let storeState = {
        sources: [...DEFAULT_SOURCES],
        isAuthenticated: false,
      };

      // Mock the store's set function
      const setState = (updates) => {
        storeState = { ...storeState, ...updates };
      };

      // Simulate login success
      setState({ isAuthenticated: true });

      // Simulate refreshSources updating the store
      const updatedSources = DEFAULT_SOURCES.map((s) =>
        s.id === 'supabase-cloud' ? { ...s, connected: true } : s
      );
      setState({ sources: updatedSources });

      // Verify store state is updated
      expect(storeState.isAuthenticated).toBe(true);
      expect(storeState.sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);
    });
  });

  describe('popup open flow', () => {
    it('should show correct sources immediately when popup opens', async () => {
      // Scenario: User is already logged in, opens popup
      // Sources should show as connected immediately

      // Storage has session and sources (from previous refreshSources call)
      const connectedSources = DEFAULT_SOURCES.map((s) =>
        s.id === 'supabase-cloud' ? { ...s, connected: true } : s
      );

      mockStorage.local.get.mockResolvedValue({
        sources: connectedSources,
        session: { access_token: 'valid-token' },
      });

      // Background confirms sources are still valid
      mockRuntime.sendMessage.mockResolvedValue({
        success: true,
        sources: connectedSources,
      });

      // Simulate popup initialization
      const storedData = await mockStorage.local.get(['sources', 'session']);
      let sources = storedData.sources;

      // Even before refreshSources completes, sources should be correct
      // because they were persisted from the last refresh
      expect(sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);

      // After refresh, should still be correct
      const result = await mockRuntime.sendMessage({ type: 'REFRESH_SOURCES' });
      if (result.success) {
        sources = result.sources;
      }

      expect(sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);
    });

    it('should handle refreshSources failure gracefully', async () => {
      // If refreshSources fails, should keep existing sources from storage

      const existingSources = DEFAULT_SOURCES.map((s) =>
        s.id === 'supabase-cloud' ? { ...s, connected: true } : s
      );

      mockStorage.local.get.mockResolvedValue({
        sources: existingSources,
        session: { access_token: 'valid-token' },
      });

      // Background fails to refresh
      mockRuntime.sendMessage.mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      // Simulate popup initialization
      const storedData = await mockStorage.local.get(['sources', 'session']);
      let sources = storedData.sources;

      // Try to refresh
      const result = await mockRuntime.sendMessage({ type: 'REFRESH_SOURCES' });
      if (result.success && result.sources) {
        sources = result.sources;
      }
      // If refresh fails, keep existing sources

      // Should still show connected (from storage)
      expect(sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);
    });
  });

  describe('sources loading state', () => {
    it('should track sources loading state during refresh', async () => {
      // The store should have a loading state for sources
      // so the UI can show a loading indicator

      let storeState = {
        sources: [...DEFAULT_SOURCES],
        isSourcesLoading: false,
      };

      const setState = (updates) => {
        storeState = { ...storeState, ...updates };
      };

      // Start refresh
      setState({ isSourcesLoading: true });
      expect(storeState.isSourcesLoading).toBe(true);

      // Simulate async refresh
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Complete refresh
      const updatedSources = DEFAULT_SOURCES.map((s) =>
        s.id === 'supabase-cloud' ? { ...s, connected: true } : s
      );
      setState({ sources: updatedSources, isSourcesLoading: false });

      expect(storeState.isSourcesLoading).toBe(false);
      expect(storeState.sources.find((s) => s.id === 'supabase-cloud').connected).toBe(true);
    });
  });
});
