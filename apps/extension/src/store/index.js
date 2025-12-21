import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
 * @typedef {Object} StoreState
 * @property {SyncStatus} status
 * @property {string | null} lastSync
 * @property {string | null} selectedSource
 * @property {Source[]} sources
 * @property {SyncStats} stats
 * @property {string | null} error
 * @property {Object | null} user
 * @property {Object} settings
 */

// Default sources available
const DEFAULT_SOURCES = [
  { id: 'local-file', name: 'Local File', type: 'local-file', connected: false },
  { id: 'github', name: 'GitHub', type: 'github', connected: false },
  { id: 'dropbox', name: 'Dropbox', type: 'dropbox', connected: false },
  { id: 'google-drive', name: 'Google Drive', type: 'google-drive', connected: false },
  { id: 'supabase-cloud', name: 'MarkSyncr Cloud', type: 'supabase-cloud', connected: false },
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
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome;
  }
  if (typeof browser !== 'undefined' && browser.storage) {
    return browser;
  }
  // Return mock for development/testing
  return {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
    },
    runtime: {
      sendMessage: async () => {},
    },
    bookmarks: {
      getTree: async () => [],
    },
  };
};

/**
 * Create the extension store with Zustand
 */
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

        if (!selectedSource) {
          set({ error: 'No sync source selected' });
          return;
        }

        const source = sources.find((s) => s.id === selectedSource);
        if (!source) {
          set({ error: 'Invalid sync source' });
          return;
        }

        set({ status: 'syncing', error: null });

        try {
          const browserAPI = getBrowserAPI();

          // Send message to background script to perform sync
          const result = await browserAPI.runtime.sendMessage({
            type: 'SYNC_BOOKMARKS',
            payload: { sourceId: selectedSource },
          });

          if (result?.success) {
            const lastSync = new Date().toISOString();
            set({
              status: 'synced',
              lastSync,
              stats: result.stats || get().stats,
            });

            // Persist last sync time
            await browserAPI.storage.local.set({ lastSync });
          } else {
            throw new Error(result?.error || 'Sync failed');
          }
        } catch (err) {
          console.error('Sync failed:', err);
          set({
            status: 'error',
            error: err.message || 'Sync failed',
          });
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
    }),
    {
      name: 'marksyncr-storage',
      // Only persist certain fields
      partialize: (state) => ({
        selectedSource: state.selectedSource,
        settings: state.settings,
      }),
    }
  )
);

/**
 * Count bookmarks and folders in a bookmark tree
 * @param {Array} tree - Bookmark tree from browser API
 * @returns {SyncStats}
 */
function countBookmarks(tree) {
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

  return { total, folders, synced: total };
}

export default useStore;
