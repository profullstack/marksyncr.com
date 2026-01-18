import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut as apiSignOut,
  getSession,
  getUser,
  fetchSubscription,
  fetchCloudSettings,
  saveCloudSettings,
  saveBookmarkVersion,
  fetchTags as apiFetchTags,
} from '../lib/api.js';

/**
 * @typedef {'synced' | 'syncing' | 'error' | 'pending' | 'disconnected'} SyncStatus
 */

/**
 * @typedef {Object} Source
 * @property {string} id
 * @property {string} name
 * @property {'local-file' | 'github' | 'dropbox' | 'google-drive' | 'supabase-cloud'} type
 * @property {boolean} connected
 */

/**
 * @typedef {Object} SyncStats
 * @property {number} total
 * @property {number} folders
 * @property {number} synced
 */

/**
 * @typedef {Object} Tag
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {string} created_at
 */

/**
 * @typedef {Object} Subscription
 * @property {'free' | 'pro' | 'team'} plan
 * @property {'active' | 'canceled' | 'past_due'} status
 */

/**
 * @typedef {Object} StoreState
 * @property {SyncStatus} status
 * @property {string | null} lastSync
 * @property {string | null} selectedSource
 * @property {Source[]} sources
 * @property {SyncStats} stats
 * @property {string | null} error
 * @property {Object | null} user
 * @property {Object} settings
 * @property {Subscription | null} subscription
 * @property {Tag[]} tags
 * @property {Object | null} selectedBookmark
 */

// Default sources available
const DEFAULT_SOURCES = [
  { id: 'browser-bookmarks', name: 'Browser Bookmarks', type: 'browser-bookmarks', connected: true, description: 'Sync your browser bookmarks' },
  { id: 'supabase-cloud', name: 'MarkSyncr Cloud', type: 'supabase-cloud', connected: false, description: 'Sync to cloud (requires login)' },
  { id: 'github', name: 'GitHub', type: 'github', connected: false, description: 'Sync to GitHub repository' },
  { id: 'dropbox', name: 'Dropbox', type: 'dropbox', connected: false, description: 'Sync to Dropbox' },
  { id: 'google-drive', name: 'Google Drive', type: 'google-drive', connected: false, description: 'Sync to Google Drive' },
];

// Default settings
const DEFAULT_SETTINGS = {
  autoSync: true,
  syncInterval: 15, // minutes
  syncOnStartup: true,
  notifications: true,
  conflictResolution: 'newest-wins', // 'newest-wins' | 'manual' | 'merge'
};

/**
 * Get browser API (Chrome or Firefox)
 */
const getBrowserAPI = () => {
  // Check for Chrome API first (Chrome, Edge, Opera, Brave, etc.)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    console.log('[MarkSyncr Store] Using Chrome API');
    return chrome;
  }
  // Check for Firefox/WebExtension polyfill API
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
    console.log('[MarkSyncr Store] Using Firefox/WebExtension API');
    return browser;
  }
  // Fallback check for storage-only access (some contexts)
  if (typeof chrome !== 'undefined' && chrome.storage) {
    console.log('[MarkSyncr Store] Using Chrome API (storage-only context)');
    return chrome;
  }
  if (typeof browser !== 'undefined' && browser.storage) {
    console.log('[MarkSyncr Store] Using Firefox API (storage-only context)');
    return browser;
  }
  // Return mock for development/testing - THIS SHOULD NOT HAPPEN IN PRODUCTION
  console.warn('[MarkSyncr Store] WARNING: Using mock browser API - extension features will not work!');
  console.warn('[MarkSyncr Store] chrome:', typeof chrome, chrome ? Object.keys(chrome) : 'undefined');
  console.warn('[MarkSyncr Store] browser:', typeof browser, typeof browser !== 'undefined' ? Object.keys(browser) : 'undefined');
  return {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
    },
    runtime: {
      sendMessage: async (message) => {
        console.error('[MarkSyncr Store] Mock sendMessage called - this should not happen in production!', message);
        return { success: false, error: 'Browser extension API not available. Please reload the extension.' };
      },
    },
    bookmarks: {
      getTree: async () => [],
    },
  };
};

/**
 * Create the extension store with Zustand
 */
// API base URL for Pro features
const API_BASE_URL = 'https://marksyncr.com/api';

export const useStore = create(
  persist(
    (set, get) => ({
      // State
      status: 'disconnected',
      lastSync: null,
      selectedSource: null,
      sources: DEFAULT_SOURCES,
      stats: { total: 0, folders: 0, synced: 0 },
      error: null,
      user: null,
      settings: DEFAULT_SETTINGS,
      // Authentication state
      isAuthenticated: false,
      isAuthLoading: false,
      authError: null,
      signupSuccess: false,
      // Sources loading state - tracks when sources are being refreshed from server
      isSourcesLoading: false,
      // Pro features state
      subscription: null,
      tags: [],
      selectedBookmark: null,
      isLoadingTags: false,
      // Bookmarks state for Pro features
      bookmarks: [],
      isLoadingBookmarks: false,
      // Link health scanner state
      linkScanResults: [],
      isScanning: false,
      // Duplicate detector state
      duplicateGroups: [],
      // Sync failure tracking
      syncFailureStatus: null, // { consecutiveFailures, maxFailures, lastError, retryLimitReached }

      // Actions
      setStatus: (status) => set({ status }),

      setError: (error) => set({ error, status: error ? 'error' : get().status }),

      clearError: () => set({ error: null }),

      setSelectedSource: (sourceId) => {
        set({ selectedSource: sourceId });
        // Persist to browser storage
        const browserAPI = getBrowserAPI();
        browserAPI.storage.local.set({ selectedSource: sourceId });
      },

      setUser: (user) => set({ user }),

      // ==========================================
      // Authentication Actions
      // ==========================================

      /**
       * Sign in with email and password
       *
       * IMPORTANT: This function refreshes sources from the server after login
       * to ensure the UI shows the correct connected services immediately.
       */
      login: async (email, password) => {
        set({ isAuthLoading: true, authError: null, isSourcesLoading: true });

        try {
          const { user, session } = await signInWithEmail(email, password);
          
          // Fetch subscription status
          const subscription = await fetchSubscription();
          
          // Fetch cloud settings
          const cloudSettings = await fetchCloudSettings();
          
          set({
            user,
            isAuthenticated: true,
            isAuthLoading: false,
            authError: null,
            subscription,
            settings: cloudSettings ? { ...get().settings, ...cloudSettings } : get().settings,
          });

          // Fetch tags if user is Pro
          if (subscription?.plan && ['pro', 'team'].includes(subscription.plan)) {
            await get().fetchTags();
          }

          // Refresh connected sources from server - this is critical for showing
          // the correct connected services in the UI immediately after login
          console.log('[MarkSyncr Store] Refreshing sources after login...');
          const refreshResult = await get().refreshSources();
          console.log('[MarkSyncr Store] Sources refresh result after login:', refreshResult);

          return { success: true };
        } catch (err) {
          console.error('Login failed:', err);
          set({
            isAuthLoading: false,
            authError: err.message || 'Login failed',
            isSourcesLoading: false,
          });
          return { success: false, error: err.message };
        }
      },

      /**
       * Sign up with email and password
       */
      signup: async (email, password) => {
        set({ isAuthLoading: true, authError: null, signupSuccess: false });

        try {
          await signUpWithEmail(email, password);
          
          set({
            isAuthLoading: false,
            authError: null,
            signupSuccess: true,
          });

          return { success: true };
        } catch (err) {
          console.error('Signup failed:', err);
          set({
            isAuthLoading: false,
            authError: err.message || 'Signup failed',
            signupSuccess: false,
          });
          return { success: false, error: err.message };
        }
      },

      /**
       * Sign out the current user
       */
      logout: async () => {
        set({ isAuthLoading: true });

        try {
          await apiSignOut();
          
          // Mark supabase-cloud as disconnected since user is logging out
          const sources = get().sources.map((source) => {
            if (source.id === 'supabase-cloud') {
              return { ...source, connected: false };
            }
            // Also disconnect OAuth sources since they require authentication
            if (['github', 'dropbox', 'google-drive'].includes(source.id)) {
              return { ...source, connected: false };
            }
            return source;
          });
          
          // Persist updated sources to browser storage
          const browserAPI = getBrowserAPI();
          await browserAPI.storage.local.set({ sources });
          
          set({
            user: null,
            isAuthenticated: false,
            isAuthLoading: false,
            authError: null,
            subscription: null,
            tags: [],
            sources,
          });

          console.log('[MarkSyncr Store] Logged out, sources disconnected:', sources.map(s => ({ id: s.id, connected: s.connected })));

          return { success: true };
        } catch (err) {
          console.error('Logout failed:', err);
          set({
            isAuthLoading: false,
            authError: err.message || 'Logout failed',
          });
          return { success: false, error: err.message };
        }
      },

      /**
       * Check and restore authentication session
       *
       * IMPORTANT: This function is called on popup open to restore the session.
       * It refreshes sources from the server to ensure the UI shows the correct
       * connected services immediately.
       */
      checkAuth: async () => {
        try {
          const session = await getSession();
          
          if (session) {
            // Set sources loading state early so UI knows we're fetching
            set({ isSourcesLoading: true });
            
            const user = await getUser();
            const subscription = await fetchSubscription();
            const cloudSettings = await fetchCloudSettings();
            
            set({
              user,
              isAuthenticated: true,
              subscription,
              settings: cloudSettings ? { ...get().settings, ...cloudSettings } : get().settings,
            });

            // Fetch tags if user is Pro
            if (subscription?.plan && ['pro', 'team'].includes(subscription.plan)) {
              await get().fetchTags();
            }

            // Refresh connected sources from server - this is critical for showing
            // the correct connected services in the UI immediately
            console.log('[MarkSyncr Store] Refreshing sources after auth check...');
            const refreshResult = await get().refreshSources();
            console.log('[MarkSyncr Store] Sources refresh result after auth check:', refreshResult);

            return true;
          }
          
          return false;
        } catch (err) {
          console.error('Auth check failed:', err);
          set({ isSourcesLoading: false });
          return false;
        }
      },

      /**
       * Clear auth error
       */
      clearAuthError: () => set({ authError: null }),

      /**
       * Reset signup success state
       */
      resetSignupSuccess: () => set({ signupSuccess: false }),

      updateSettings: (newSettings) => {
        const settings = { ...get().settings, ...newSettings };
        set({ settings });
        // Persist to browser storage
        const browserAPI = getBrowserAPI();
        browserAPI.storage.local.set({ settings });
      },

      updateSourceConnection: (sourceId, connected) => {
        const sources = get().sources.map((source) =>
          source.id === sourceId ? { ...source, connected } : source
        );
        set({ sources });
        // Also persist to browser storage for background script
        const browserAPI = getBrowserAPI();
        browserAPI.storage.local.set({ sources });
      },

      updateStats: (stats) => set({ stats }),

      /**
       * Initialize the store from browser storage
       */
      initialize: async () => {
        try {
          const browserAPI = getBrowserAPI();

          // Load persisted state from browser storage
          const stored = await browserAPI.storage.local.get([
            'selectedSource',
            'settings',
            'lastSync',
            'sources',
          ]);

          const updates = {};

          if (stored.selectedSource) {
            updates.selectedSource = stored.selectedSource;
          }

          if (stored.settings) {
            updates.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
          }

          if (stored.lastSync) {
            updates.lastSync = stored.lastSync;
          }

          if (stored.sources) {
            // Merge stored source connection states with defaults
            updates.sources = DEFAULT_SOURCES.map((defaultSource) => {
              const storedSource = stored.sources.find((s) => s.id === defaultSource.id);
              return storedSource
                ? { ...defaultSource, connected: storedSource.connected }
                : defaultSource;
            });
          }

          // Get bookmark stats
          try {
            const tree = await browserAPI.bookmarks.getTree();
            const stats = countBookmarks(tree);
            updates.stats = stats;
          } catch (err) {
            console.warn('Could not get bookmark stats:', err);
          }

          // Determine initial status
          if (updates.selectedSource) {
            const source = (updates.sources || get().sources).find(
              (s) => s.id === updates.selectedSource
            );
            updates.status = source?.connected ? 'synced' : 'pending';
          }

          set(updates);

          // Check for existing auth session (this also refreshes sources if authenticated)
          await get().checkAuth();
        } catch (err) {
          console.error('Failed to initialize store:', err);
          set({ error: 'Failed to initialize extension' });
        }
      },

      /**
       * Trigger a manual sync
       */
      triggerSync: async () => {
        const { selectedSource, sources } = get();

        console.log('[MarkSyncr Store] triggerSync called');
        console.log('[MarkSyncr Store] selectedSource:', selectedSource);
        console.log('[MarkSyncr Store] sources:', sources?.map(s => ({ id: s.id, connected: s.connected })));

        if (!selectedSource) {
          set({ error: 'No sync source selected. Please select a source from the dropdown.', status: 'error' });
          return;
        }

        const source = sources.find((s) => s.id === selectedSource);
        if (!source) {
          set({ error: 'Invalid sync source. Please select a valid source.', status: 'error' });
          return;
        }

        set({ status: 'syncing', error: null });

        try {
          const browserAPI = getBrowserAPI();
          const hasRuntimeAPI = !!browserAPI.runtime?.sendMessage;
          console.log('[MarkSyncr Store] Browser API available:', hasRuntimeAPI);

          if (!hasRuntimeAPI) {
            throw new Error('Browser extension API not available. Please reload the extension.');
          }

          // Send message to background script to perform sync
          console.log('[MarkSyncr Store] Sending SYNC_BOOKMARKS message to background script...');
          const result = await browserAPI.runtime.sendMessage({
            type: 'SYNC_BOOKMARKS',
            payload: { sourceId: selectedSource },
          });

          console.log('[MarkSyncr Store] Sync result from background:', result);

          if (!result) {
            throw new Error('No response from background script. The extension may need to be reloaded.');
          }

          if (result.requiresAuth) {
            set({
              status: 'error',
              error: 'Please log in to sync bookmarks. Go to the Account tab to sign in.',
            });
            return;
          }

          if (result.retryLimitReached) {
            set({
              status: 'error',
              error: result.error,
              syncFailureStatus: {
                consecutiveFailures: result.consecutiveFailures || 3,
                maxFailures: result.maxFailures || 3,
                lastError: result.lastError,
                retryLimitReached: true,
              },
            });
            return;
          }

          if (result?.success) {
            const lastSync = new Date().toISOString();
            set({
              status: 'synced',
              lastSync,
              stats: result.stats || get().stats,
              syncFailureStatus: null, // Clear failure status on success
            });

            // Persist last sync time
            await browserAPI.storage.local.set({ lastSync });

            // Show success message with details
            const addedFromCloud = result.addedFromCloud || 0;
            const deletedLocally = result.deletedLocally || 0;
            if (addedFromCloud > 0 || deletedLocally > 0) {
              console.log(`[MarkSyncr Store] Sync complete: ${addedFromCloud} added from cloud, ${deletedLocally} deleted locally`);
            }
          } else {
            throw new Error(result?.error || 'Sync failed - unknown error from background script');
          }
        } catch (err) {
          console.error('[MarkSyncr Store] Sync failed:', err);
          set({
            status: 'error',
            error: err.message || 'Sync failed',
          });
        }
      },

      /**
       * Force Push - Overwrite cloud data with local bookmarks
       */
      forcePush: async () => {
        set({ status: 'syncing', error: null });

        try {
          const browserAPI = getBrowserAPI();
          console.log('[MarkSyncr Store] Force Push: Sending FORCE_PUSH message...');
          
          const result = await browserAPI.runtime.sendMessage({
            type: 'FORCE_PUSH',
          });

          console.log('[MarkSyncr Store] Force Push result:', result);

          if (result?.success) {
            const lastSync = new Date().toISOString();
            set({
              status: 'synced',
              lastSync,
              stats: result.stats || get().stats,
            });

            await browserAPI.storage.local.set({ lastSync });
            return { success: true, message: result.message };
          } else {
            throw new Error(result?.error || 'Force push failed');
          }
        } catch (err) {
          console.error('[MarkSyncr Store] Force Push failed:', err);
          set({
            status: 'error',
            error: err.message || 'Force push failed',
          });
          return { success: false, error: err.message };
        }
      },

      /**
       * Force Pull - Overwrite local bookmarks with cloud data
       */
      forcePull: async () => {
        set({ status: 'syncing', error: null });

        try {
          const browserAPI = getBrowserAPI();
          console.log('[MarkSyncr Store] Force Pull: Sending FORCE_PULL message...');
          
          const result = await browserAPI.runtime.sendMessage({
            type: 'FORCE_PULL',
          });

          console.log('[MarkSyncr Store] Force Pull result:', result);

          if (result?.success) {
            const lastSync = new Date().toISOString();
            
            // Refresh bookmark stats after pull
            try {
              const tree = await browserAPI.bookmarks.getTree();
              const stats = countBookmarks(tree);
              set({
                status: 'synced',
                lastSync,
                stats,
              });
            } catch {
              set({
                status: 'synced',
                lastSync,
                stats: result.stats || get().stats,
              });
            }

            await browserAPI.storage.local.set({ lastSync });
            return { success: true, message: result.message };
          } else {
            throw new Error(result?.error || 'Force pull failed');
          }
        } catch (err) {
          console.error('[MarkSyncr Store] Force Pull failed:', err);
          set({
            status: 'error',
            error: err.message || 'Force pull failed',
          });
          return { success: false, error: err.message };
        }
      },

      /**
       * Get sync failure status from background script
       */
      getSyncStatus: async () => {
        const browserAPI = getBrowserAPI();

        try {
          const result = await browserAPI.runtime.sendMessage({
            type: 'GET_SYNC_STATUS',
          });

          if (result?.success) {
            set({ syncFailureStatus: result });
            return result;
          }
          return null;
        } catch (err) {
          console.error('[MarkSyncr Store] Failed to get sync status:', err);
          return null;
        }
      },

      /**
       * Reset sync failures to allow retrying
       */
      resetSyncFailures: async () => {
        const browserAPI = getBrowserAPI();

        try {
          const result = await browserAPI.runtime.sendMessage({
            type: 'RESET_SYNC_FAILURES',
          });

          if (result?.success) {
            set({ syncFailureStatus: null, error: null });
            return { success: true };
          }
          return { success: false, error: result?.error };
        } catch (err) {
          console.error('[MarkSyncr Store] Failed to reset sync failures:', err);
          return { success: false, error: err.message };
        }
      },

      /**
       * Connect to a source (OAuth flow)
       */
      connectSource: async (sourceId) => {
        const browserAPI = getBrowserAPI();

        try {
          const result = await browserAPI.runtime.sendMessage({
            type: 'CONNECT_SOURCE',
            payload: { sourceId },
          });

          if (result?.success) {
            get().updateSourceConnection(sourceId, true);
            return true;
          } else {
            throw new Error(result?.error || 'Connection failed');
          }
        } catch (err) {
          console.error('Failed to connect source:', err);
          set({ error: err.message || 'Failed to connect source' });
          return false;
        }
      },

      /**
       * Disconnect from a source
       */
      disconnectSource: async (sourceId) => {
        const browserAPI = getBrowserAPI();

        try {
          await browserAPI.runtime.sendMessage({
            type: 'DISCONNECT_SOURCE',
            payload: { sourceId },
          });

          get().updateSourceConnection(sourceId, false);

          // If this was the selected source, clear selection
          if (get().selectedSource === sourceId) {
            set({ selectedSource: null, status: 'disconnected' });
          }
        } catch (err) {
          console.error('Failed to disconnect source:', err);
        }
      },

      /**
       * Refresh connected sources from the server
       * Call this after connecting sources via the web dashboard
       *
       * IMPORTANT: This function updates BOTH the Zustand store state AND
       * browser.storage.local to ensure sources are persisted and available
       * immediately on next popup open.
       */
      refreshSources: async () => {
        const browserAPI = getBrowserAPI();

        // Set loading state so UI can show loading indicator
        set({ isSourcesLoading: true });

        try {
          console.log('[MarkSyncr Store] Refreshing sources from server...');
          
          const result = await browserAPI.runtime.sendMessage({
            type: 'REFRESH_SOURCES',
          });

          if (result?.success && result.sources) {
            // Update Zustand store state
            set({ sources: result.sources, isSourcesLoading: false });
            
            // Also persist to browser.storage.local so sources are available
            // immediately on next popup open (before refreshSources completes)
            await browserAPI.storage.local.set({ sources: result.sources });
            
            console.log('[MarkSyncr Store] Sources refreshed and persisted:', result.sources.map(s => ({ id: s.id, connected: s.connected })));
            return { success: true, sources: result.sources };
          } else {
            console.warn('[MarkSyncr Store] Failed to refresh sources:', result?.error);
            set({ isSourcesLoading: false });
            return { success: false, error: result?.error || 'Failed to refresh sources' };
          }
        } catch (err) {
          console.error('[MarkSyncr Store] Failed to refresh sources:', err);
          set({ isSourcesLoading: false });
          return { success: false, error: err.message };
        }
      },

      /**
       * Open the web dashboard to connect a source
       */
      openDashboardToConnect: async (sourceId) => {
        const browserAPI = getBrowserAPI();

        try {
          const result = await browserAPI.runtime.sendMessage({
            type: 'CONNECT_SOURCE',
            payload: { sourceId },
          });

          if (result?.redirectUrl) {
            // Dashboard was opened in a new tab
            return {
              success: true,
              message: result.message || 'Please connect the source from the dashboard, then refresh sources.',
            };
          }

          if (result?.success) {
            get().updateSourceConnection(sourceId, true);
            return { success: true };
          }

          return { success: false, error: result?.error || 'Failed to connect source' };
        } catch (err) {
          console.error('[MarkSyncr Store] Failed to open dashboard:', err);
          return { success: false, error: err.message };
        }
      },

      // ==========================================
      // Pro Features Actions
      // ==========================================

      /**
       * Set subscription info
       */
      setSubscription: (subscription) => set({ subscription }),

      /**
       * Check if user has Pro features
       */
      isPro: () => {
        const { subscription } = get();
        return (
          subscription &&
          ['pro', 'team'].includes(subscription.plan) &&
          subscription.status === 'active'
        );
      },

      /**
       * Set selected bookmark for editing
       */
      setSelectedBookmark: (bookmark) => set({ selectedBookmark: bookmark }),

      /**
       * Clear selected bookmark
       */
      clearSelectedBookmark: () => set({ selectedBookmark: null }),

      /**
       * Fetch user's tags from API
       */
      fetchTags: async () => {
        const browserAPI = getBrowserAPI();
        set({ isLoadingTags: true });

        try {
          // Get auth token from storage
          const { authToken } = await browserAPI.storage.local.get('authToken');
          
          if (!authToken) {
            set({ tags: [], isLoadingTags: false });
            return;
          }

          const response = await fetch(`${API_BASE_URL}/tags`, {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            if (response.status === 403) {
              // Not a Pro user, clear tags
              set({ tags: [], isLoadingTags: false });
              return;
            }
            throw new Error('Failed to fetch tags');
          }

          const data = await response.json();
          set({ tags: data.tags || [], isLoadingTags: false });
        } catch (err) {
          console.error('Failed to fetch tags:', err);
          set({ isLoadingTags: false });
        }
      },

      /**
       * Create a new tag
       */
      createTag: async ({ name, color }) => {
        const browserAPI = getBrowserAPI();

        try {
          const { authToken } = await browserAPI.storage.local.get('authToken');
          
          if (!authToken) {
            throw new Error('Not authenticated');
          }

          const response = await fetch(`${API_BASE_URL}/tags`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ name, color }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create tag');
          }

          const data = await response.json();
          const newTag = data.tag;

          // Add to local state
          set({ tags: [...get().tags, newTag] });

          return newTag;
        } catch (err) {
          console.error('Failed to create tag:', err);
          throw err;
        }
      },

      /**
       * Update an existing tag
       */
      updateTag: async (tagId, updates) => {
        const browserAPI = getBrowserAPI();

        try {
          const { authToken } = await browserAPI.storage.local.get('authToken');
          
          if (!authToken) {
            throw new Error('Not authenticated');
          }

          const response = await fetch(`${API_BASE_URL}/tags/${tagId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(updates),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update tag');
          }

          const data = await response.json();
          const updatedTag = data.tag;

          // Update local state
          set({
            tags: get().tags.map((t) => (t.id === tagId ? updatedTag : t)),
          });

          return updatedTag;
        } catch (err) {
          console.error('Failed to update tag:', err);
          throw err;
        }
      },

      /**
       * Delete a tag
       */
      deleteTag: async (tagId) => {
        const browserAPI = getBrowserAPI();

        try {
          const { authToken } = await browserAPI.storage.local.get('authToken');
          
          if (!authToken) {
            throw new Error('Not authenticated');
          }

          const response = await fetch(`${API_BASE_URL}/tags/${tagId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete tag');
          }

          // Remove from local state
          set({
            tags: get().tags.filter((t) => t.id !== tagId),
          });
        } catch (err) {
          console.error('Failed to delete tag:', err);
          throw err;
        }
      },

      /**
       * Save tags for a bookmark
       */
      saveBookmarkTags: async (bookmarkId, tags) => {
        const browserAPI = getBrowserAPI();

        try {
          // Send message to background script to update bookmark
          await browserAPI.runtime.sendMessage({
            type: 'UPDATE_BOOKMARK_TAGS',
            payload: { bookmarkId, tags },
          });

          // Update selected bookmark if it matches
          const { selectedBookmark } = get();
          if (selectedBookmark?.id === bookmarkId) {
            set({
              selectedBookmark: { ...selectedBookmark, tags },
            });
          }
        } catch (err) {
          console.error('Failed to save bookmark tags:', err);
          throw err;
        }
      },

      /**
       * Save notes for a bookmark
       */
      saveBookmarkNotes: async (bookmarkId, notes) => {
        const browserAPI = getBrowserAPI();

        try {
          // Send message to background script to update bookmark
          await browserAPI.runtime.sendMessage({
            type: 'UPDATE_BOOKMARK_NOTES',
            payload: { bookmarkId, notes },
          });

          // Update selected bookmark if it matches
          const { selectedBookmark } = get();
          if (selectedBookmark?.id === bookmarkId) {
            set({
              selectedBookmark: { ...selectedBookmark, notes },
            });
          }
        } catch (err) {
          console.error('Failed to save bookmark notes:', err);
          throw err;
        }
      },

      // ==========================================
      // Bookmarks Actions for Pro Features
      // ==========================================

      /**
       * Fetch all bookmarks as a flat array for Pro features
       */
      fetchBookmarks: async () => {
        const browserAPI = getBrowserAPI();
        set({ isLoadingBookmarks: true });

        try {
          const tree = await browserAPI.bookmarks.getTree();
          const bookmarks = flattenBookmarkTree(tree);
          set({ bookmarks, isLoadingBookmarks: false });
          return bookmarks;
        } catch (err) {
          console.error('Failed to fetch bookmarks:', err);
          set({ isLoadingBookmarks: false });
          return [];
        }
      },

      /**
       * Delete a bookmark
       */
      deleteBookmark: async (bookmarkId) => {
        const browserAPI = getBrowserAPI();

        try {
          await browserAPI.bookmarks.remove(bookmarkId);
          // Update local state
          set({
            bookmarks: get().bookmarks.filter((b) => b.id !== bookmarkId),
          });
        } catch (err) {
          console.error('Failed to delete bookmark:', err);
          throw err;
        }
      },

      /**
       * Update a bookmark
       */
      updateBookmark: async (bookmarkId, updates) => {
        const browserAPI = getBrowserAPI();

        try {
          await browserAPI.bookmarks.update(bookmarkId, updates);
          // Update local state
          set({
            bookmarks: get().bookmarks.map((b) =>
              b.id === bookmarkId ? { ...b, ...updates } : b
            ),
          });
        } catch (err) {
          console.error('Failed to update bookmark:', err);
          throw err;
        }
      },

      // ==========================================
      // Link Health Scanner Actions
      // ==========================================

      /**
       * Scan bookmarks for broken links
       */
      scanLinks: async (bookmarksToScan, options = {}) => {
        set({ isScanning: true, linkScanResults: [] });
        const results = [];
        const { onProgress } = options;

        try {
          for (let i = 0; i < bookmarksToScan.length; i++) {
            const bookmark = bookmarksToScan[i];
            
            if (onProgress) {
              onProgress({
                completed: i,
                total: bookmarksToScan.length,
                current: bookmark,
              });
            }

            if (!bookmark.url) continue;

            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);

              const response = await fetch(bookmark.url, {
                method: 'HEAD',
                signal: controller.signal,
                mode: 'no-cors', // Handle CORS issues
              });

              clearTimeout(timeoutId);

              let status = 'valid';
              let statusCode = response.status;

              // Check for redirects
              if (response.redirected) {
                status = 'redirect';
              } else if (!response.ok && response.status !== 0) {
                // status 0 is for no-cors mode
                status = 'broken';
              }

              results.push({
                bookmarkId: bookmark.id,
                url: bookmark.url,
                title: bookmark.title,
                status,
                statusCode,
                redirectUrl: response.redirected ? response.url : null,
                checkedAt: new Date().toISOString(),
              });
            } catch (err) {
              let status = 'broken';
              let errorMessage = err.message;

              if (err.name === 'AbortError') {
                status = 'timeout';
                errorMessage = 'Request timed out';
              }

              results.push({
                bookmarkId: bookmark.id,
                url: bookmark.url,
                title: bookmark.title,
                status,
                errorMessage,
                checkedAt: new Date().toISOString(),
              });
            }
          }

          set({ linkScanResults: results, isScanning: false });
          return results;
        } catch (err) {
          console.error('Link scan failed:', err);
          set({ isScanning: false });
          throw err;
        }
      },

      // ==========================================
      // Duplicate Detector Actions
      // ==========================================

      /**
       * Merge duplicate bookmarks
       */
      mergeDuplicates: async ({ keepBookmark, deleteBookmarks, mergeTags, mergeNotes }) => {
        const browserAPI = getBrowserAPI();

        try {
          // Collect tags and notes from duplicates if merging
          let combinedTags = keepBookmark.tags || [];
          let combinedNotes = keepBookmark.notes || '';

          if (mergeTags) {
            deleteBookmarks.forEach((b) => {
              if (b.tags) {
                b.tags.forEach((tag) => {
                  if (!combinedTags.find((t) => t.id === tag.id)) {
                    combinedTags.push(tag);
                  }
                });
              }
            });
          }

          if (mergeNotes) {
            deleteBookmarks.forEach((b) => {
              if (b.notes && b.notes.trim()) {
                combinedNotes += `\n\n---\nMerged from: ${b.title}\n${b.notes}`;
              }
            });
          }

          // Update the kept bookmark with merged data
          if (mergeTags || mergeNotes) {
            await browserAPI.runtime.sendMessage({
              type: 'UPDATE_BOOKMARK_TAGS',
              payload: { bookmarkId: keepBookmark.id, tags: combinedTags },
            });
            await browserAPI.runtime.sendMessage({
              type: 'UPDATE_BOOKMARK_NOTES',
              payload: { bookmarkId: keepBookmark.id, notes: combinedNotes },
            });
          }

          // Delete the duplicate bookmarks
          for (const bookmark of deleteBookmarks) {
            await browserAPI.bookmarks.remove(bookmark.id);
          }

          // Update local state
          const deletedIds = new Set(deleteBookmarks.map((b) => b.id));
          set({
            bookmarks: get().bookmarks.filter((b) => !deletedIds.has(b.id)),
          });
        } catch (err) {
          console.error('Failed to merge duplicates:', err);
          throw err;
        }
      },

      /**
       * Delete multiple bookmarks (for duplicate deletion)
       */
      deleteMultipleBookmarks: async (bookmarksToDelete) => {
        const browserAPI = getBrowserAPI();

        try {
          for (const bookmark of bookmarksToDelete) {
            await browserAPI.bookmarks.remove(bookmark.id);
          }

          // Update local state
          const deletedIds = new Set(bookmarksToDelete.map((b) => b.id));
          set({
            bookmarks: get().bookmarks.filter((b) => !deletedIds.has(b.id)),
          });
        } catch (err) {
          console.error('Failed to delete bookmarks:', err);
          throw err;
        }
      },

      /**
       * Open upgrade page
       */
      openUpgradePage: () => {
        window.open('https://marksyncr.com/pricing', '_blank');
      },
    }),
    {
      name: 'marksyncr-storage',
      // Persist auth state and settings
      partialize: (state) => ({
        selectedSource: state.selectedSource,
        settings: state.settings,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        subscription: state.subscription,
      }),
    }
  )
);

/**
 * Count bookmarks and folders in a bookmark tree
 * @param {Array} tree - Bookmark tree from browser API
 * @param {number} [syncedCount=0] - Number of bookmarks synced to cloud (0 if not logged in)
 * @returns {SyncStats}
 */
function countBookmarks(tree, syncedCount = 0) {
  let total = 0;
  let folders = 0;

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.url) {
        total++;
      } else if (node.children) {
        folders++;
        traverse(node.children);
      }
    }
  }

  traverse(tree);

  // synced is 0 when not logged in, otherwise it's the actual synced count from the server
  return { total, folders, synced: syncedCount };
}

/**
 * Flatten bookmark tree into a flat array of bookmarks
 * @param {Array} tree - Bookmark tree from browser API
 * @param {string} parentPath - Current folder path
 * @returns {Array} Flat array of bookmarks with parentPath
 */
function flattenBookmarkTree(tree, parentPath = '') {
  const bookmarks = [];

  function traverse(nodes, path) {
    for (const node of nodes) {
      if (node.url) {
        // It's a bookmark
        bookmarks.push({
          id: node.id,
          title: node.title || '',
          url: node.url,
          parentPath: path,
          dateAdded: node.dateAdded,
          tags: [], // Will be populated from metadata
          notes: '', // Will be populated from metadata
        });
      } else if (node.children) {
        // It's a folder
        const folderPath = path ? `${path}/${node.title}` : node.title;
        traverse(node.children, folderPath);
      }
    }
  }

  traverse(tree, parentPath);
  return bookmarks;
}

export default useStore;
