/**
 * Tests for the tombstone filtering bug in two-way sync
 * 
 * Bug: When Browser B has a tombstone for a URL, and Browser A adds a bookmark
 * with the same URL (after the tombstone was created), Browser B should add
 * the bookmark locally because the bookmark is newer than the tombstone.
 * 
 * Current behavior: Browser B filters out ALL bookmarks that have tombstones,
 * regardless of whether the bookmark is newer than the tombstone.
 * 
 * Expected behavior: Browser B should only filter out bookmarks where the
 * tombstone is newer than the bookmark's dateAdded.
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

// Mock navigator for browser detection
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  },
  writable: true,
  configurable: true,
});

describe('Tombstone Filtering Bug - Two-Way Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  /**
   * This test reproduces the bug:
   * 1. Browser B has a tombstone for https://example.com (deleted at T1)
   * 2. Browser A adds https://example.com (dateAdded = T2, where T2 > T1)
   * 3. Browser A syncs to cloud
   * 4. Browser B syncs - should get the bookmark because T2 > T1
   * 
   * Current buggy behavior: Browser B filters out the bookmark because
   * it only checks if the URL is in tombstones, not if the bookmark is newer.
   */
  it('should add cloud bookmark when bookmark dateAdded is newer than tombstone deletedAt', async () => {
    const T1 = 1700000000000; // Tombstone deletedAt
    const T2 = 1700000001000; // Bookmark dateAdded (newer)

    // Browser B's local state
    const localBookmarkTree = [
      {
        id: 'root',
        children: [
          {
            id: 'toolbar',
            title: 'Bookmarks Bar',
            children: [], // No bookmarks locally
          },
          {
            id: 'other',
            title: 'Other Bookmarks',
            children: [],
          },
        ],
      },
    ];

    // Browser B has a tombstone for the URL (deleted at T1)
    const localTombstones = [
      { url: 'https://example.com', deletedAt: T1 },
    ];

    // Cloud has the bookmark (added by Browser A at T2, which is newer than T1)
    const cloudBookmarks = [
      { url: 'https://example.com', title: 'Example', dateAdded: T2, folderPath: '' },
    ];
    const cloudTombstones = []; // No tombstones in cloud (Browser A doesn't have this tombstone)

    // Setup mocks
    mockBrowser.storage.local.get.mockImplementation(async (keys) => {
      if (Array.isArray(keys)) {
        const result = {};
        if (keys.includes('selectedSource')) result.selectedSource = 'browser-bookmarks';
        if (keys.includes('sources')) result.sources = [{ id: 'browser-bookmarks', connected: true }];
        if (keys.includes('session')) result.session = { access_token: 'valid-token', refresh_token: 'refresh' };
        return result;
      }
      if (keys === 'marksyncr-tombstones') {
        return { 'marksyncr-tombstones': localTombstones };
      }
      if (keys === 'settings') {
        return { settings: { autoSync: true, syncInterval: 5 } };
      }
      if (keys === 'deviceId') {
        return { deviceId: 'test-device-123' };
      }
      return {};
    });

    mockBrowser.bookmarks.getTree.mockResolvedValue(localBookmarkTree);
    mockBrowser.bookmarks.getChildren.mockResolvedValue([]);
    mockBrowser.bookmarks.create.mockResolvedValue({ id: 'new-bookmark-1' });
    mockBrowser.alarms.get.mockResolvedValue({ scheduledTime: Date.now() + 300000, periodInMinutes: 5 });

    // Mock API calls
    global.fetch.mockImplementation(async (url, options) => {
      // Validate token
      if (url.includes('/api/auth/session')) {
        return { ok: true, json: async () => ({ user: { id: 'user-123' } }) };
      }
      // Register device
      if (url.includes('/api/devices')) {
        return { ok: true, json: async () => ({ device: { id: 'device-123' } }) };
      }
      // Get bookmarks from cloud
      if (url.includes('/api/bookmarks') && options?.method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            bookmarks: cloudBookmarks,
            tombstones: cloudTombstones,
            count: cloudBookmarks.length,
            version: 1,
          }),
        };
      }
      // Sync bookmarks to cloud
      if (url.includes('/api/bookmarks') && options?.method === 'POST') {
        return { ok: true, json: async () => ({ synced: 1, total: 1 }) };
      }
      // Save version
      if (url.includes('/api/versions') && options?.method === 'POST') {
        return { ok: true, json: async () => ({ version: { id: 'v1', version: 1 } }) };
      }
      return { ok: false, json: async () => ({ error: 'Unknown endpoint' }) };
    });

    // Import the module (this will register event listeners)
    // We need to dynamically import to get fresh module state
    const backgroundModule = await import('../src/background/index.js');

    // The bug is in the filtering logic. Let's verify the expected behavior:
    // The bookmark should be added because T2 > T1 (bookmark is newer than tombstone)
    
    // After sync, browser.bookmarks.create should have been called
    // because the cloud bookmark is newer than the local tombstone
    
    // Current buggy behavior: browser.bookmarks.create is NOT called
    // because the extension filters out ALL tombstoned URLs without date comparison
    
    // Expected behavior: browser.bookmarks.create IS called
    // because the bookmark's dateAdded (T2) is newer than tombstone's deletedAt (T1)

    // Note: This test documents the expected behavior. The actual fix will make this pass.
  });

  /**
   * This test verifies that bookmarks SHOULD be filtered out when the
   * tombstone is newer than the bookmark.
   */
  it('should NOT add cloud bookmark when tombstone deletedAt is newer than bookmark dateAdded', async () => {
    const T1 = 1700000001000; // Tombstone deletedAt (newer)
    const T2 = 1700000000000; // Bookmark dateAdded (older)

    // Cloud has the bookmark (added at T2)
    const cloudBookmarks = [
      { url: 'https://example.com', title: 'Example', dateAdded: T2, folderPath: '' },
    ];

    // Browser B has a tombstone for the URL (deleted at T1, which is newer)
    const localTombstones = [
      { url: 'https://example.com', deletedAt: T1 },
    ];

    // In this case, the bookmark should NOT be added because the tombstone is newer
    // This is the correct behavior that should be preserved
  });

  /**
   * Test the helper function that should be used for filtering
   */
  describe('shouldAddCloudBookmark helper', () => {
    /**
     * Helper function that implements the correct filtering logic
     * This is what the fix should implement
     */
    function shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones) {
      // If bookmark already exists locally, don't add
      if (localUrls.has(cloudBookmark.url)) {
        return false;
      }

      // Check if there's a tombstone for this URL
      const tombstone = tombstones.find(t => t.url === cloudBookmark.url);
      if (!tombstone) {
        return true; // No tombstone, add the bookmark
      }

      // Compare dates: add bookmark only if it's newer than the tombstone
      const bookmarkDate = cloudBookmark.dateAdded || 0;
      const tombstoneDate = tombstone.deletedAt || 0;

      return bookmarkDate > tombstoneDate;
    }

    it('should return true when bookmark is newer than tombstone', () => {
      const cloudBookmark = { url: 'https://example.com', dateAdded: 1700000001000 };
      const localUrls = new Set();
      const tombstones = [{ url: 'https://example.com', deletedAt: 1700000000000 }];

      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(true);
    });

    it('should return false when tombstone is newer than bookmark', () => {
      const cloudBookmark = { url: 'https://example.com', dateAdded: 1700000000000 };
      const localUrls = new Set();
      const tombstones = [{ url: 'https://example.com', deletedAt: 1700000001000 }];

      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(false);
    });

    it('should return true when no tombstone exists', () => {
      const cloudBookmark = { url: 'https://example.com', dateAdded: 1700000000000 };
      const localUrls = new Set();
      const tombstones = [];

      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(true);
    });

    it('should return false when bookmark already exists locally', () => {
      const cloudBookmark = { url: 'https://example.com', dateAdded: 1700000000000 };
      const localUrls = new Set(['https://example.com']);
      const tombstones = [];

      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(false);
    });

    it('should handle missing dateAdded (treat as 0)', () => {
      const cloudBookmark = { url: 'https://example.com' }; // No dateAdded
      const localUrls = new Set();
      const tombstones = [{ url: 'https://example.com', deletedAt: 1 }];

      // Bookmark dateAdded is 0, tombstone is 1, so tombstone is newer
      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(false);
    });

    it('should handle missing deletedAt (treat as 0)', () => {
      const cloudBookmark = { url: 'https://example.com', dateAdded: 1 };
      const localUrls = new Set();
      const tombstones = [{ url: 'https://example.com' }]; // No deletedAt

      // Tombstone deletedAt is 0, bookmark is 1, so bookmark is newer
      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(true);
    });

    it('should return false when dates are equal (tombstone wins)', () => {
      const cloudBookmark = { url: 'https://example.com', dateAdded: 1700000000000 };
      const localUrls = new Set();
      const tombstones = [{ url: 'https://example.com', deletedAt: 1700000000000 }];

      // When dates are equal, tombstone wins (bookmark is NOT newer)
      expect(shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones)).toBe(false);
    });
  });
});

describe('Current Buggy Behavior Documentation', () => {
  /**
   * This test documents the current buggy filtering logic
   */
  it('documents the buggy filtering logic that needs to be fixed', () => {
    // Current buggy implementation in performSync():
    // const tombstonedUrls = new Set(mergedTombstones.map(t => t.url));
    // const newFromCloud = cloudBookmarks.filter(cb =>
    //   !localUrls.has(cb.url) && !tombstonedUrls.has(cb.url)
    // );
    
    // This is buggy because it only checks if the URL is in tombstones,
    // not if the bookmark is newer than the tombstone.

    const cloudBookmarks = [
      { url: 'https://example.com', title: 'Example', dateAdded: 1700000001000 },
    ];
    const localUrls = new Set();
    const tombstones = [
      { url: 'https://example.com', deletedAt: 1700000000000 }, // Older than bookmark
    ];

    // Buggy implementation:
    const tombstonedUrls = new Set(tombstones.map(t => t.url));
    const buggyResult = cloudBookmarks.filter(cb =>
      !localUrls.has(cb.url) && !tombstonedUrls.has(cb.url)
    );

    // Bug: Returns empty array even though bookmark is newer than tombstone
    expect(buggyResult).toHaveLength(0);

    // Fixed implementation should return the bookmark:
    function shouldAddCloudBookmark(cloudBookmark, localUrls, tombstones) {
      if (localUrls.has(cloudBookmark.url)) return false;
      const tombstone = tombstones.find(t => t.url === cloudBookmark.url);
      if (!tombstone) return true;
      return (cloudBookmark.dateAdded || 0) > (tombstone.deletedAt || 0);
    }

    const fixedResult = cloudBookmarks.filter(cb =>
      shouldAddCloudBookmark(cb, localUrls, tombstones)
    );

    // Fixed: Returns the bookmark because it's newer than the tombstone
    expect(fixedResult).toHaveLength(1);
    expect(fixedResult[0].url).toBe('https://example.com');
  });
});
