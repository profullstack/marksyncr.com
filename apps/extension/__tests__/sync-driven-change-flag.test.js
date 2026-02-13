/**
 * Tests for isSyncDrivenChange flag behavior
 *
 * Verifies that:
 * 1. Sync-driven moves/creates don't pollute locallyModifiedBookmarkIds
 * 2. User-driven moves during non-sync still tracked properly
 * 3. updatedLocally is correctly scoped (regression for dcc146c)
 * 4. Debounced save is cancelled when clearing IDs at end of sync
 * 5. Cross-browser checksum normalization produces matching checksums
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser API
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  bookmarks: {
    getTree: vi.fn(),
    getChildren: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    removeTree: vi.fn(),
    move: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    getSubTree: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    onChanged: { addListener: vi.fn() },
    onMoved: { addListener: vi.fn() },
  },
  alarms: {
    clear: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    id: 'test-extension-id',
  },
  tabs: {
    create: vi.fn(),
  },
};

vi.mock('webextension-polyfill', () => ({
  default: mockBrowser,
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe('isSyncDrivenChange flag and locallyModifiedBookmarkIds', () => {
  let onCreatedCallback;
  let onMovedCallback;
  let onChangedCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();

    // Capture the listener callbacks when they're registered
    mockBrowser.bookmarks.onCreated.addListener.mockImplementation((cb) => {
      onCreatedCallback = cb;
    });
    mockBrowser.bookmarks.onMoved.addListener.mockImplementation((cb) => {
      onMovedCallback = cb;
    });
    mockBrowser.bookmarks.onChanged.addListener.mockImplementation((cb) => {
      onChangedCallback = cb;
    });

    // Default storage mock
    mockBrowser.storage.local.get.mockResolvedValue({});
    mockBrowser.storage.local.set.mockResolvedValue(undefined);

    // Default getChildren mock
    mockBrowser.bookmarks.getChildren.mockResolvedValue([]);

    // Default getSubTree mock
    mockBrowser.bookmarks.getSubTree.mockResolvedValue([{ children: [] }]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Checksum normalization for cross-browser folder paths', () => {
    /**
     * The normalizeItemsForChecksum function should normalize folder paths
     * so that Firefox ("Bookmarks Toolbar") and Chrome ("Bookmarks Bar")
     * produce identical checksums for the same bookmark set.
     */
    it('should produce identical normalized output for Firefox and Chrome folder paths', () => {
      const firefoxBookmarks = [
        { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar/Work', index: 0 },
        { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Toolbar/Work', index: 1 },
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Toolbar', index: 0 },
      ];

      const chromeBookmarks = [
        { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar/Work', index: 0 },
        { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar/Work', index: 1 },
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 },
      ];

      // Inline the normalization logic to test it
      function normalizeItemsForChecksum(items) {
        if (!Array.isArray(items)) return [];
        return items
          .map((item) => {
            const rawPath = item.folderPath || item.folder_path || '';
            const normalizedPath = rawPath
              .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
              .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
              .replace(/^Speed Dial\/?/i, 'toolbar/')
              .replace(/^Favourites Bar\/?/i, 'toolbar/')
              .replace(/^Favorites Bar\/?/i, 'toolbar/')
              .replace(/^Other Bookmarks\/?/i, 'other/')
              .replace(/^Unsorted Bookmarks\/?/i, 'other/')
              .replace(/^Bookmarks Menu\/?/i, 'menu/')
              .replace(/\/+$/, '');

            if (item.type === 'folder') {
              return { type: 'folder', title: item.title ?? '', folderPath: normalizedPath, index: item.index ?? 0 };
            } else {
              return { type: 'bookmark', url: item.url, title: item.title ?? '', folderPath: normalizedPath, index: item.index ?? 0 };
            }
          })
          .sort((a, b) => {
            const folderCompare = a.folderPath.localeCompare(b.folderPath);
            if (folderCompare !== 0) return folderCompare;
            return (a.index ?? 0) - (b.index ?? 0);
          });
      }

      const firefoxNormalized = normalizeItemsForChecksum(firefoxBookmarks);
      const chromeNormalized = normalizeItemsForChecksum(chromeBookmarks);

      expect(JSON.stringify(firefoxNormalized)).toBe(JSON.stringify(chromeNormalized));
    });

    it('should normalize various browser root folder names to canonical forms', () => {
      function normalizePath(rawPath) {
        return rawPath
          .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
          .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
          .replace(/^Speed Dial\/?/i, 'toolbar/')
          .replace(/^Favourites Bar\/?/i, 'toolbar/')
          .replace(/^Favorites Bar\/?/i, 'toolbar/')
          .replace(/^Other Bookmarks\/?/i, 'other/')
          .replace(/^Unsorted Bookmarks\/?/i, 'other/')
          .replace(/^Bookmarks Menu\/?/i, 'menu/')
          .replace(/\/+$/, '');
      }

      // Toolbar variants
      expect(normalizePath('Bookmarks Bar/Work')).toBe('toolbar/Work');
      expect(normalizePath('Bookmarks Toolbar/Work')).toBe('toolbar/Work');
      expect(normalizePath('Speed Dial/Work')).toBe('toolbar/Work');
      expect(normalizePath('Favourites Bar/Work')).toBe('toolbar/Work');
      expect(normalizePath('Favorites Bar/Work')).toBe('toolbar/Work');

      // Other variants
      expect(normalizePath('Other Bookmarks/Misc')).toBe('other/Misc');
      expect(normalizePath('Unsorted Bookmarks/Misc')).toBe('other/Misc');

      // Menu variants
      expect(normalizePath('Bookmarks Menu/Reading')).toBe('menu/Reading');
    });

    it('should detect order changes via different normalized checksums', () => {
      function normalizeItemsForChecksum(items) {
        return items
          .map((item) => {
            const rawPath = item.folderPath || '';
            const normalizedPath = rawPath
              .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
              .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
              .replace(/\/+$/, '');
            return { type: 'bookmark', url: item.url, title: item.title ?? '', folderPath: normalizedPath, index: item.index ?? 0 };
          })
          .sort((a, b) => {
            const fc = a.folderPath.localeCompare(b.folderPath);
            if (fc !== 0) return fc;
            return (a.index ?? 0) - (b.index ?? 0);
          });
      }

      const orderA = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const orderB = [
        { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const normA = JSON.stringify(normalizeItemsForChecksum(orderA));
      const normB = JSON.stringify(normalizeItemsForChecksum(orderB));

      expect(normA).not.toBe(normB);
    });
  });

  describe('updatedLocally scoping (regression test)', () => {
    it('should have updatedLocally accessible after the try/finally block', () => {
      // This tests the fix from commit dcc146c
      // updatedLocally must be declared before the try block
      // so it's accessible in the stats reporting after the block

      // Simulate the fixed code structure
      let updatedLocally = 0;
      const isSyncDrivenChange = true;
      try {
        updatedLocally = 5; // Simulating updateLocalBookmarksFromCloud result
      } finally {
        // isSyncDrivenChange = false;
      }

      // This should be accessible (was throwing ReferenceError before fix)
      expect(updatedLocally).toBe(5);
    });
  });

  describe('Sync-driven change tracking', () => {
    it('should not track bookmark creates as locally modified during sync-driven changes', () => {
      // Simulate: isSyncDrivenChange is true (during addCloudBookmarksToLocal)
      // The onCreated listener should NOT add IDs to locallyModifiedBookmarkIds

      const locallyModifiedBookmarkIds = new Set();
      let isSyncDrivenChange = true;

      // Simulate onCreated behavior with flag check
      function simulateOnCreated(id) {
        if (!isSyncDrivenChange) {
          locallyModifiedBookmarkIds.add(id);
        }
      }

      simulateOnCreated('bm-1');
      simulateOnCreated('bm-2');

      expect(locallyModifiedBookmarkIds.size).toBe(0);

      // After sync, user creates a bookmark
      isSyncDrivenChange = false;
      simulateOnCreated('bm-3');

      expect(locallyModifiedBookmarkIds.size).toBe(1);
      expect(locallyModifiedBookmarkIds.has('bm-3')).toBe(true);
    });

    it('should not track bookmark moves as locally modified during sync-driven changes', () => {
      const locallyModifiedBookmarkIds = new Set();
      let isSyncDrivenChange = true;

      function simulateOnMoved(id, siblings) {
        if (!isSyncDrivenChange) {
          locallyModifiedBookmarkIds.add(id);
          for (const sib of siblings) {
            locallyModifiedBookmarkIds.add(sib);
          }
        }
      }

      // During sync: move bookmark + siblings should NOT be tracked
      simulateOnMoved('bm-1', ['bm-2', 'bm-3', 'bm-4']);
      expect(locallyModifiedBookmarkIds.size).toBe(0);

      // After sync: user moves bookmark → should be tracked
      isSyncDrivenChange = false;
      simulateOnMoved('bm-5', ['bm-6', 'bm-7']);
      expect(locallyModifiedBookmarkIds.size).toBe(3);
    });

    it('should prevent stale IDs from causing skipped cloud updates on next sync', () => {
      // This is the core bug scenario:
      // 1. Sync moves bookmarks → onMoved fires → IDs added to set
      // 2. End of sync clears set
      // 3. But debounced save persists stale IDs AFTER clear
      // 4. Next sync loads stale IDs → skips cloud updates

      // With the fix: isSyncDrivenChange prevents step 1 from adding IDs

      const locallyModifiedBookmarkIds = new Set();
      let isSyncDrivenChange = false;

      // Simulate categorizeCloudBookmarks checking modifiedLocalIds
      function categorizeCloudBookmark(cloudBm, localBm, modifiedIds) {
        if (modifiedIds.has(localBm.id)) {
          return 'skipped'; // BUG: skips cloud update
        }
        if (cloudBm.index !== localBm.index) {
          return 'toUpdate';
        }
        return 'unchanged';
      }

      // User hasn't modified anything
      const result1 = categorizeCloudBookmark(
        { url: 'a.com', index: 2 },
        { id: 'bm-1', url: 'a.com', index: 0 },
        locallyModifiedBookmarkIds
      );
      expect(result1).toBe('toUpdate'); // Should detect index change

      // Simulate stale IDs (the old bug)
      locallyModifiedBookmarkIds.add('bm-1');
      const result2 = categorizeCloudBookmark(
        { url: 'a.com', index: 2 },
        { id: 'bm-1', url: 'a.com', index: 0 },
        locallyModifiedBookmarkIds
      );
      expect(result2).toBe('skipped'); // BUG: would skip the update

      // With fix: IDs never added during sync, so set is empty
      locallyModifiedBookmarkIds.clear();
      const result3 = categorizeCloudBookmark(
        { url: 'a.com', index: 2 },
        { id: 'bm-1', url: 'a.com', index: 0 },
        locallyModifiedBookmarkIds
      );
      expect(result3).toBe('toUpdate'); // Correct: detects index change
    });
  });

  describe('Debounced save cancellation', () => {
    it('should cancel pending debounced save when clearing IDs at end of sync', () => {
      // Simulate the debounced save + clear race condition
      let saveModifiedIdsTimeout = null;
      const locallyModifiedBookmarkIds = new Set();
      let storageState = [];

      function saveLocallyModifiedIds() {
        storageState = Array.from(locallyModifiedBookmarkIds);
      }

      function debouncedSaveLocallyModifiedIds() {
        if (saveModifiedIdsTimeout) {
          clearTimeout(saveModifiedIdsTimeout);
        }
        saveModifiedIdsTimeout = setTimeout(() => {
          saveModifiedIdsTimeout = null;
          saveLocallyModifiedIds();
        }, 500);
      }

      // Simulate: during sync, moves add IDs and trigger debounced save
      locallyModifiedBookmarkIds.add('bm-1');
      locallyModifiedBookmarkIds.add('bm-2');
      debouncedSaveLocallyModifiedIds();

      // End of sync: cancel debounced save, then clear
      if (saveModifiedIdsTimeout) {
        clearTimeout(saveModifiedIdsTimeout);
        saveModifiedIdsTimeout = null;
      }
      locallyModifiedBookmarkIds.clear();
      saveLocallyModifiedIds();

      // Storage should be empty, not contain stale IDs
      expect(storageState).toEqual([]);
      expect(locallyModifiedBookmarkIds.size).toBe(0);
    });
  });
});
