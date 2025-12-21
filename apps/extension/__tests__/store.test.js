/**
 * @fileoverview Tests for extension Zustand store
 * Tests all store actions and state management
 * Uses Vitest with mocked browser APIs and API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser storage API
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockStorageRemove = vi.fn();
const mockBookmarksGetTree = vi.fn();
const mockBookmarksRemove = vi.fn();
const mockBookmarksUpdate = vi.fn();
const mockRuntimeSendMessage = vi.fn();

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
    remove: mockBookmarksRemove,
    update: mockBookmarksUpdate,
  },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
  },
};

// Set up global chrome mock
global.chrome = mockBrowserAPI;
global.browser = undefined;

// Mock API functions
const mockSignInWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockFetchSubscription = vi.fn();
const mockFetchCloudSettings = vi.fn();
const mockSaveCloudSettings = vi.fn();
const mockFetchTags = vi.fn();

vi.mock('../src/lib/api.js', () => ({
  signInWithEmail: mockSignInWithEmail,
  signUpWithEmail: mockSignUpWithEmail,
  signOut: mockSignOut,
  getSession: mockGetSession,
  getUser: mockGetUser,
  fetchSubscription: mockFetchSubscription,
  fetchCloudSettings: mockFetchCloudSettings,
  saveCloudSettings: mockSaveCloudSettings,
  saveBookmarkVersion: vi.fn(),
  fetchTags: mockFetchTags,
}));

// Import store after mocks
const { useStore } = await import('../src/store/index.js');

describe('Extension Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
    mockStorageSet.mockResolvedValue(undefined);
    mockStorageRemove.mockResolvedValue(undefined);
    mockBookmarksGetTree.mockResolvedValue([]);
    
    // Reset store state
    useStore.setState({
      status: 'disconnected',
      lastSync: null,
      selectedSource: null,
      sources: [
        { id: 'browser-bookmarks', name: 'Browser Bookmarks', type: 'browser-bookmarks', connected: true },
        { id: 'supabase-cloud', name: 'MarkSyncr Cloud', type: 'supabase-cloud', connected: false },
        { id: 'github', name: 'GitHub', type: 'github', connected: false },
        { id: 'dropbox', name: 'Dropbox', type: 'dropbox', connected: false },
        { id: 'google-drive', name: 'Google Drive', type: 'google-drive', connected: false },
      ],
      stats: { total: 0, folders: 0, synced: 0 },
      error: null,
      user: null,
      settings: {
        autoSync: true,
        syncInterval: 15,
        syncOnStartup: true,
        notifications: true,
        conflictResolution: 'newest-wins',
      },
      isAuthenticated: false,
      isAuthLoading: false,
      authError: null,
      signupSuccess: false,
      subscription: null,
      tags: [],
      selectedBookmark: null,
      isLoadingTags: false,
      bookmarks: [],
      isLoadingBookmarks: false,
      linkScanResults: [],
      isScanning: false,
      duplicateGroups: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useStore.getState();

      expect(state.status).toBe('disconnected');
      expect(state.lastSync).toBeNull();
      expect(state.selectedSource).toBeNull();
      expect(state.sources).toHaveLength(5);
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should have default sources', () => {
      const state = useStore.getState();

      expect(state.sources.find((s) => s.id === 'browser-bookmarks')).toBeDefined();
      expect(state.sources.find((s) => s.id === 'supabase-cloud')).toBeDefined();
      expect(state.sources.find((s) => s.id === 'github')).toBeDefined();
    });

    it('should have default settings', () => {
      const state = useStore.getState();

      expect(state.settings.autoSync).toBe(true);
      expect(state.settings.syncInterval).toBe(15);
      expect(state.settings.notifications).toBe(true);
    });
  });

  describe('setStatus', () => {
    it('should update status', () => {
      useStore.getState().setStatus('syncing');

      expect(useStore.getState().status).toBe('syncing');
    });

    it('should accept all valid status values', () => {
      const validStatuses = ['synced', 'syncing', 'error', 'pending', 'disconnected'];

      for (const status of validStatuses) {
        useStore.getState().setStatus(status);
        expect(useStore.getState().status).toBe(status);
      }
    });
  });

  describe('setError', () => {
    it('should set error and update status to error', () => {
      useStore.getState().setError('Something went wrong');

      const state = useStore.getState();
      expect(state.error).toBe('Something went wrong');
      expect(state.status).toBe('error');
    });

    it('should not change status when error is null', () => {
      useStore.getState().setStatus('synced');
      useStore.getState().setError(null);

      const state = useStore.getState();
      expect(state.error).toBeNull();
      expect(state.status).toBe('synced');
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useStore.getState().setError('Some error');
      useStore.getState().clearError();

      expect(useStore.getState().error).toBeNull();
    });
  });

  describe('setSelectedSource', () => {
    it('should update selected source', () => {
      useStore.getState().setSelectedSource('github');

      expect(useStore.getState().selectedSource).toBe('github');
    });

    it('should persist to browser storage', () => {
      useStore.getState().setSelectedSource('dropbox');

      expect(mockStorageSet).toHaveBeenCalledWith({ selectedSource: 'dropbox' });
    });
  });

  describe('updateSettings', () => {
    it('should merge new settings with existing', () => {
      useStore.getState().updateSettings({ autoSync: false });

      const state = useStore.getState();
      expect(state.settings.autoSync).toBe(false);
      expect(state.settings.syncInterval).toBe(15); // Unchanged
    });

    it('should persist to browser storage', () => {
      useStore.getState().updateSettings({ theme: 'dark' });

      expect(mockStorageSet).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ theme: 'dark' }),
        })
      );
    });
  });

  describe('updateSourceConnection', () => {
    it('should update source connection status', () => {
      useStore.getState().updateSourceConnection('github', true);

      const source = useStore.getState().sources.find((s) => s.id === 'github');
      expect(source.connected).toBe(true);
    });

    it('should not affect other sources', () => {
      useStore.getState().updateSourceConnection('github', true);

      const dropbox = useStore.getState().sources.find((s) => s.id === 'dropbox');
      expect(dropbox.connected).toBe(false);
    });
  });

  describe('Authentication Actions', () => {
    describe('login', () => {
      it('should set loading state during login', async () => {
        mockSignInWithEmail.mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );

        const loginPromise = useStore.getState().login('test@example.com', 'password');

        expect(useStore.getState().isAuthLoading).toBe(true);

        await loginPromise;
      });

      it('should set user and authenticated state on success', async () => {
        const mockUser = { id: 'user-123', email: 'test@example.com' };
        mockSignInWithEmail.mockResolvedValue({ user: mockUser, session: {} });
        mockFetchSubscription.mockResolvedValue({ plan: 'free' });
        mockFetchCloudSettings.mockResolvedValue(null);

        await useStore.getState().login('test@example.com', 'password');

        const state = useStore.getState();
        expect(state.user).toEqual(mockUser);
        expect(state.isAuthenticated).toBe(true);
        expect(state.isAuthLoading).toBe(false);
        expect(state.authError).toBeNull();
      });

      it('should fetch subscription after login', async () => {
        mockSignInWithEmail.mockResolvedValue({ user: { id: 'user-123' }, session: {} });
        mockFetchSubscription.mockResolvedValue({ plan: 'pro', status: 'active' });
        mockFetchCloudSettings.mockResolvedValue(null);

        await useStore.getState().login('test@example.com', 'password');

        expect(mockFetchSubscription).toHaveBeenCalled();
        expect(useStore.getState().subscription).toEqual({ plan: 'pro', status: 'active' });
      });

      it('should fetch cloud settings after login', async () => {
        mockSignInWithEmail.mockResolvedValue({ user: { id: 'user-123' }, session: {} });
        mockFetchSubscription.mockResolvedValue(null);
        mockFetchCloudSettings.mockResolvedValue({ theme: 'dark' });

        await useStore.getState().login('test@example.com', 'password');

        expect(mockFetchCloudSettings).toHaveBeenCalled();
      });

      it('should set error on failed login', async () => {
        mockSignInWithEmail.mockRejectedValue(new Error('Invalid credentials'));

        const result = await useStore.getState().login('test@example.com', 'wrong');

        const state = useStore.getState();
        expect(state.authError).toBe('Invalid credentials');
        expect(state.isAuthenticated).toBe(false);
        expect(result.success).toBe(false);
      });

      it('should fetch tags for pro users', async () => {
        mockSignInWithEmail.mockResolvedValue({ user: { id: 'user-123' }, session: {} });
        mockFetchSubscription.mockResolvedValue({ plan: 'pro', status: 'active' });
        mockFetchCloudSettings.mockResolvedValue(null);
        
        // Mock the fetch call that fetchTags makes internally
        mockStorageGet.mockResolvedValue({ authToken: 'test-token' });
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ tags: [{ id: '1', name: 'work' }] }),
        });

        await useStore.getState().login('test@example.com', 'password');

        // The store's fetchTags makes a fetch call to the API
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/tags'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });
    });

    describe('signup', () => {
      it('should set loading state during signup', async () => {
        mockSignUpWithEmail.mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100))
        );

        const signupPromise = useStore.getState().signup('test@example.com', 'password');

        expect(useStore.getState().isAuthLoading).toBe(true);

        await signupPromise;
      });

      it('should set signupSuccess on successful signup', async () => {
        mockSignUpWithEmail.mockResolvedValue({ user: { id: 'user-123' } });

        const result = await useStore.getState().signup('test@example.com', 'password');

        const state = useStore.getState();
        expect(state.signupSuccess).toBe(true);
        expect(state.isAuthLoading).toBe(false);
        expect(result.success).toBe(true);
      });

      it('should set error on failed signup', async () => {
        mockSignUpWithEmail.mockRejectedValue(new Error('Email already exists'));

        const result = await useStore.getState().signup('test@example.com', 'password');

        const state = useStore.getState();
        expect(state.authError).toBe('Email already exists');
        expect(state.signupSuccess).toBe(false);
        expect(result.success).toBe(false);
      });
    });

    describe('logout', () => {
      it('should clear user state on logout', async () => {
        // Set up authenticated state
        useStore.setState({
          user: { id: 'user-123' },
          isAuthenticated: true,
          subscription: { plan: 'pro' },
          tags: [{ id: '1', name: 'work' }],
        });

        mockSignOut.mockResolvedValue(undefined);

        await useStore.getState().logout();

        const state = useStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(state.subscription).toBeNull();
        expect(state.tags).toEqual([]);
      });

      it('should set error on failed logout', async () => {
        mockSignOut.mockRejectedValue(new Error('Logout failed'));

        const result = await useStore.getState().logout();

        expect(result.success).toBe(false);
        expect(useStore.getState().authError).toBe('Logout failed');
      });
    });

    describe('checkAuth', () => {
      it('should restore session if valid', async () => {
        mockGetSession.mockResolvedValue({ access_token: 'token' });
        mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
        mockFetchSubscription.mockResolvedValue({ plan: 'free' });
        mockFetchCloudSettings.mockResolvedValue(null);

        const result = await useStore.getState().checkAuth();

        expect(result).toBe(true);
        expect(useStore.getState().isAuthenticated).toBe(true);
      });

      it('should return false if no session', async () => {
        mockGetSession.mockResolvedValue(null);

        const result = await useStore.getState().checkAuth();

        expect(result).toBe(false);
        expect(useStore.getState().isAuthenticated).toBe(false);
      });
    });

    describe('clearAuthError', () => {
      it('should clear auth error', () => {
        useStore.setState({ authError: 'Some error' });

        useStore.getState().clearAuthError();

        expect(useStore.getState().authError).toBeNull();
      });
    });

    describe('resetSignupSuccess', () => {
      it('should reset signup success state', () => {
        useStore.setState({ signupSuccess: true });

        useStore.getState().resetSignupSuccess();

        expect(useStore.getState().signupSuccess).toBe(false);
      });
    });
  });

  describe('Sync Actions', () => {
    describe('triggerSync', () => {
      it('should set error when no source is selected', async () => {
        await useStore.getState().triggerSync();

        expect(useStore.getState().error).toBe('No sync source selected');
      });

      it('should set syncing status during sync', async () => {
        useStore.setState({ selectedSource: 'browser-bookmarks' });
        mockRuntimeSendMessage.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
        );

        const syncPromise = useStore.getState().triggerSync();

        expect(useStore.getState().status).toBe('syncing');

        await syncPromise;
      });

      it('should update lastSync on successful sync', async () => {
        useStore.setState({ selectedSource: 'browser-bookmarks' });
        mockRuntimeSendMessage.mockResolvedValue({ success: true, stats: { total: 10 } });

        await useStore.getState().triggerSync();

        const state = useStore.getState();
        expect(state.status).toBe('synced');
        expect(state.lastSync).not.toBeNull();
      });

      it('should set error status on failed sync', async () => {
        useStore.setState({ selectedSource: 'browser-bookmarks' });
        mockRuntimeSendMessage.mockResolvedValue({ success: false, error: 'Sync failed' });

        await useStore.getState().triggerSync();

        const state = useStore.getState();
        expect(state.status).toBe('error');
        expect(state.error).toBe('Sync failed');
      });
    });

    describe('connectSource', () => {
      it('should update source connection on success', async () => {
        mockRuntimeSendMessage.mockResolvedValue({ success: true });

        const result = await useStore.getState().connectSource('github');

        expect(result).toBe(true);
        const source = useStore.getState().sources.find((s) => s.id === 'github');
        expect(source.connected).toBe(true);
      });

      it('should set error on failed connection', async () => {
        mockRuntimeSendMessage.mockResolvedValue({ success: false, error: 'OAuth failed' });

        const result = await useStore.getState().connectSource('github');

        expect(result).toBe(false);
        expect(useStore.getState().error).toBe('OAuth failed');
      });
    });

    describe('disconnectSource', () => {
      it('should update source connection status', async () => {
        useStore.setState({
          sources: useStore.getState().sources.map((s) =>
            s.id === 'github' ? { ...s, connected: true } : s
          ),
        });
        mockRuntimeSendMessage.mockResolvedValue(undefined);

        await useStore.getState().disconnectSource('github');

        const source = useStore.getState().sources.find((s) => s.id === 'github');
        expect(source.connected).toBe(false);
      });

      it('should clear selected source if disconnecting selected', async () => {
        useStore.setState({ selectedSource: 'github' });
        mockRuntimeSendMessage.mockResolvedValue(undefined);

        await useStore.getState().disconnectSource('github');

        expect(useStore.getState().selectedSource).toBeNull();
        expect(useStore.getState().status).toBe('disconnected');
      });
    });
  });

  describe('Pro Features Actions', () => {
    describe('isPro', () => {
      it('should return true for active pro subscription', () => {
        useStore.setState({
          subscription: { plan: 'pro', status: 'active' },
        });

        expect(useStore.getState().isPro()).toBe(true);
      });

      it('should return true for active team subscription', () => {
        useStore.setState({
          subscription: { plan: 'team', status: 'active' },
        });

        expect(useStore.getState().isPro()).toBe(true);
      });

      it('should return false for free subscription', () => {
        useStore.setState({
          subscription: { plan: 'free', status: 'active' },
        });

        expect(useStore.getState().isPro()).toBe(false);
      });

      it('should return false for canceled pro subscription', () => {
        useStore.setState({
          subscription: { plan: 'pro', status: 'canceled' },
        });

        expect(useStore.getState().isPro()).toBe(false);
      });

      it('should return false when no subscription', () => {
        useStore.setState({ subscription: null });

        // isPro() returns a falsy value (null) when subscription is null
        // We check for falsy rather than strict false
        expect(useStore.getState().isPro()).toBeFalsy();
      });
    });

    describe('setSelectedBookmark', () => {
      it('should set selected bookmark', () => {
        const bookmark = { id: '1', url: 'https://example.com', title: 'Example' };

        useStore.getState().setSelectedBookmark(bookmark);

        expect(useStore.getState().selectedBookmark).toEqual(bookmark);
      });
    });

    describe('clearSelectedBookmark', () => {
      it('should clear selected bookmark', () => {
        useStore.setState({ selectedBookmark: { id: '1' } });

        useStore.getState().clearSelectedBookmark();

        expect(useStore.getState().selectedBookmark).toBeNull();
      });
    });

    describe('fetchBookmarks', () => {
      it('should fetch and flatten bookmark tree', async () => {
        const mockTree = [
          {
            id: 'root',
            children: [
              {
                id: 'folder1',
                title: 'Bookmarks',
                children: [
                  { id: '1', url: 'https://example.com', title: 'Example' },
                ],
              },
            ],
          },
        ];

        mockBookmarksGetTree.mockResolvedValue(mockTree);

        const result = await useStore.getState().fetchBookmarks();

        expect(result).toHaveLength(1);
        expect(result[0].url).toBe('https://example.com');
        expect(useStore.getState().bookmarks).toHaveLength(1);
      });

      it('should set loading state during fetch', async () => {
        mockBookmarksGetTree.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
        );

        const fetchPromise = useStore.getState().fetchBookmarks();

        expect(useStore.getState().isLoadingBookmarks).toBe(true);

        await fetchPromise;

        expect(useStore.getState().isLoadingBookmarks).toBe(false);
      });
    });

    describe('deleteBookmark', () => {
      it('should remove bookmark from browser and state', async () => {
        useStore.setState({
          bookmarks: [
            { id: '1', url: 'https://example.com' },
            { id: '2', url: 'https://test.com' },
          ],
        });
        mockBookmarksRemove.mockResolvedValue(undefined);

        await useStore.getState().deleteBookmark('1');

        expect(mockBookmarksRemove).toHaveBeenCalledWith('1');
        expect(useStore.getState().bookmarks).toHaveLength(1);
        expect(useStore.getState().bookmarks[0].id).toBe('2');
      });
    });

    describe('updateBookmark', () => {
      it('should update bookmark in browser and state', async () => {
        useStore.setState({
          bookmarks: [{ id: '1', url: 'https://example.com', title: 'Old Title' }],
        });
        mockBookmarksUpdate.mockResolvedValue(undefined);

        await useStore.getState().updateBookmark('1', { title: 'New Title' });

        expect(mockBookmarksUpdate).toHaveBeenCalledWith('1', { title: 'New Title' });
        expect(useStore.getState().bookmarks[0].title).toBe('New Title');
      });
    });
  });

  describe('Link Health Scanner Actions', () => {
    describe('scanLinks', () => {
      it('should set scanning state during scan', async () => {
        const bookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          redirected: false,
        });

        const scanPromise = useStore.getState().scanLinks(bookmarks);

        expect(useStore.getState().isScanning).toBe(true);

        await scanPromise;

        expect(useStore.getState().isScanning).toBe(false);
      });

      it('should return scan results', async () => {
        const bookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          redirected: false,
        });

        const results = await useStore.getState().scanLinks(bookmarks);

        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('valid');
        expect(useStore.getState().linkScanResults).toHaveLength(1);
      });

      it('should detect broken links', async () => {
        const bookmarks = [{ id: '1', url: 'https://broken.com', title: 'Broken' }];

        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          redirected: false,
        });

        const results = await useStore.getState().scanLinks(bookmarks);

        expect(results[0].status).toBe('broken');
      });

      it('should detect redirects', async () => {
        const bookmarks = [{ id: '1', url: 'https://redirect.com', title: 'Redirect' }];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          redirected: true,
          url: 'https://new-url.com',
        });

        const results = await useStore.getState().scanLinks(bookmarks);

        expect(results[0].status).toBe('redirect');
      });

      it('should handle timeout errors', async () => {
        const bookmarks = [{ id: '1', url: 'https://slow.com', title: 'Slow' }];

        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        global.fetch = vi.fn().mockRejectedValue(abortError);

        const results = await useStore.getState().scanLinks(bookmarks);

        expect(results[0].status).toBe('timeout');
      });

      it('should call progress callback', async () => {
        const bookmarks = [
          { id: '1', url: 'https://example1.com', title: 'Example 1' },
          { id: '2', url: 'https://example2.com', title: 'Example 2' },
        ];

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          redirected: false,
        });

        const onProgress = vi.fn();

        await useStore.getState().scanLinks(bookmarks, { onProgress });

        expect(onProgress).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Duplicate Detector Actions', () => {
    describe('mergeDuplicates', () => {
      it('should delete duplicate bookmarks', async () => {
        useStore.setState({
          bookmarks: [
            { id: '1', url: 'https://example.com', title: 'Keep' },
            { id: '2', url: 'https://example.com', title: 'Delete' },
          ],
        });
        mockBookmarksRemove.mockResolvedValue(undefined);
        mockRuntimeSendMessage.mockResolvedValue(undefined);

        await useStore.getState().mergeDuplicates({
          keepBookmark: { id: '1', url: 'https://example.com', title: 'Keep' },
          deleteBookmarks: [{ id: '2', url: 'https://example.com', title: 'Delete' }],
          mergeTags: false,
          mergeNotes: false,
        });

        expect(mockBookmarksRemove).toHaveBeenCalledWith('2');
        expect(useStore.getState().bookmarks).toHaveLength(1);
      });
    });

    describe('deleteMultipleBookmarks', () => {
      it('should delete multiple bookmarks', async () => {
        useStore.setState({
          bookmarks: [
            { id: '1', url: 'https://example1.com' },
            { id: '2', url: 'https://example2.com' },
            { id: '3', url: 'https://example3.com' },
          ],
        });
        mockBookmarksRemove.mockResolvedValue(undefined);

        await useStore.getState().deleteMultipleBookmarks([
          { id: '1' },
          { id: '2' },
        ]);

        expect(mockBookmarksRemove).toHaveBeenCalledTimes(2);
        expect(useStore.getState().bookmarks).toHaveLength(1);
        expect(useStore.getState().bookmarks[0].id).toBe('3');
      });
    });
  });

  describe('Initialize', () => {
    it('should load persisted state from storage', async () => {
      mockStorageGet.mockResolvedValue({
        selectedSource: 'github',
        settings: { autoSync: false },
        lastSync: '2024-01-01T00:00:00Z',
      });
      mockBookmarksGetTree.mockResolvedValue([]);
      mockGetSession.mockResolvedValue(null);

      await useStore.getState().initialize();

      const state = useStore.getState();
      expect(state.selectedSource).toBe('github');
      expect(state.settings.autoSync).toBe(false);
      expect(state.lastSync).toBe('2024-01-01T00:00:00Z');
    });

    it('should count bookmarks on initialize', async () => {
      mockStorageGet.mockResolvedValue({});
      // The countBookmarks function counts any node with children but no url as a folder
      // So the root node is counted as a folder too
      mockBookmarksGetTree.mockResolvedValue([
        {
          id: 'root',
          children: [
            { id: '1', url: 'https://example1.com' },
            { id: '2', url: 'https://example2.com' },
            {
              id: 'folder',
              title: 'Folder',
              children: [
                { id: '3', url: 'https://example3.com' },
              ],
            },
          ],
        },
      ]);
      mockGetSession.mockResolvedValue(null);

      await useStore.getState().initialize();

      const state = useStore.getState();
      expect(state.stats.total).toBe(3);
      // Root node + Folder = 2 folders
      expect(state.stats.folders).toBe(2);
    });

    it('should check auth on initialize', async () => {
      mockStorageGet.mockResolvedValue({});
      mockBookmarksGetTree.mockResolvedValue([]);
      mockGetSession.mockResolvedValue({ access_token: 'token' });
      mockGetUser.mockResolvedValue({ id: 'user-123' });
      mockFetchSubscription.mockResolvedValue(null);
      mockFetchCloudSettings.mockResolvedValue(null);

      await useStore.getState().initialize();

      expect(mockGetSession).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockStorageGet.mockRejectedValue(new Error('Storage error'));

      await useStore.getState().initialize();

      expect(useStore.getState().error).toBe('Failed to initialize extension');
    });
  });

  describe('openUpgradePage', () => {
    it('should open pricing page in new tab', () => {
      const mockOpen = vi.fn();
      global.window = { open: mockOpen };

      useStore.getState().openUpgradePage();

      expect(mockOpen).toHaveBeenCalledWith('https://marksyncr.com/pricing', '_blank');
    });
  });
});
