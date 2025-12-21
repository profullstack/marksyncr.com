/**
 * Tests for extension store constants and utilities
 * Note: Full store testing requires browser environment mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock browser APIs before importing store
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
  bookmarks: {
    getTree: vi.fn().mockResolvedValue([]),
  },
};

// Import after mocking
const { useStore } = await import('../src/store/index.js');

describe('Extension Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStore.setState({
      status: 'disconnected',
      lastSync: null,
      selectedSource: null,
      sources: [
        { id: 'local-file', name: 'Local File', type: 'local-file', connected: false },
        { id: 'github', name: 'GitHub', type: 'github', connected: false },
        { id: 'dropbox', name: 'Dropbox', type: 'dropbox', connected: false },
        { id: 'google-drive', name: 'Google Drive', type: 'google-drive', connected: false },
        {
          id: 'supabase-cloud',
          name: 'MarkSyncr Cloud',
          type: 'supabase-cloud',
          connected: false,
        },
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
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have disconnected status initially', () => {
      const state = useStore.getState();
      expect(state.status).toBe('disconnected');
    });

    it('should have null lastSync initially', () => {
      const state = useStore.getState();
      expect(state.lastSync).toBeNull();
    });

    it('should have default sources', () => {
      const state = useStore.getState();
      expect(state.sources).toHaveLength(5);
      expect(state.sources.map((s) => s.id)).toEqual([
        'local-file',
        'github',
        'dropbox',
        'google-drive',
        'supabase-cloud',
      ]);
    });

    it('should have default settings', () => {
      const state = useStore.getState();
      expect(state.settings.autoSync).toBe(true);
      expect(state.settings.syncInterval).toBe(15);
      expect(state.settings.conflictResolution).toBe('newest-wins');
    });
  });

  describe('setStatus', () => {
    it('should update status', () => {
      useStore.getState().setStatus('syncing');
      expect(useStore.getState().status).toBe('syncing');
    });
  });

  describe('setError', () => {
    it('should set error and update status to error', () => {
      useStore.getState().setError('Test error');
      const state = useStore.getState();
      expect(state.error).toBe('Test error');
      expect(state.status).toBe('error');
    });

    it('should keep current status when error is null', () => {
      useStore.getState().setStatus('synced');
      useStore.getState().setError(null);
      const state = useStore.getState();
      expect(state.error).toBeNull();
      expect(state.status).toBe('synced');
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useStore.getState().setError('Test error');
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
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        selectedSource: 'dropbox',
      });
    });
  });

  describe('setUser', () => {
    it('should update user', () => {
      const user = { id: '123', email: 'test@example.com' };
      useStore.getState().setUser(user);
      expect(useStore.getState().user).toEqual(user);
    });
  });

  describe('updateSettings', () => {
    it('should merge new settings with existing', () => {
      useStore.getState().updateSettings({ syncInterval: 30 });
      const state = useStore.getState();
      expect(state.settings.syncInterval).toBe(30);
      expect(state.settings.autoSync).toBe(true); // unchanged
    });

    it('should persist to browser storage', () => {
      useStore.getState().updateSettings({ notifications: false });
      expect(chrome.storage.local.set).toHaveBeenCalled();
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

  describe('updateStats', () => {
    it('should update stats', () => {
      const newStats = { total: 100, folders: 10, synced: 100 };
      useStore.getState().updateStats(newStats);
      expect(useStore.getState().stats).toEqual(newStats);
    });
  });

  describe('triggerSync', () => {
    it('should set error when no source selected', async () => {
      await useStore.getState().triggerSync();
      expect(useStore.getState().error).toBe('No sync source selected');
    });

    it('should set status to syncing when source is selected', async () => {
      useStore.getState().setSelectedSource('github');
      useStore.getState().updateSourceConnection('github', true);

      // Start sync (don't await to check intermediate state)
      const syncPromise = useStore.getState().triggerSync();

      // Check that status was set to syncing
      expect(useStore.getState().status).toBe('syncing');

      await syncPromise;
    });

    it('should send message to background script', async () => {
      useStore.getState().setSelectedSource('github');
      useStore.getState().updateSourceConnection('github', true);

      await useStore.getState().triggerSync();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SYNC_BOOKMARKS',
        payload: { sourceId: 'github' },
      });
    });
  });
});
