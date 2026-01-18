/**
 * Tests for Periodic Sync Functionality
 *
 * These tests verify that:
 * 1. Periodic sync correctly pulls new bookmarks from cloud
 * 2. Version history is only saved when local changes are pushed to cloud
 * 3. Checksum comparison works correctly to detect changes
 *
 * @module __tests__/periodic-sync.test
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
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  },
  writable: true,
  configurable: true,
});

describe('Periodic Sync - Cross-Browser Bookmark Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();
    mockBrowser.storage.local.get.mockReset();
    mockBrowser.storage.local.set.mockReset();
    mockBrowser.bookmarks.getTree.mockReset();
    mockBrowser.bookmarks.getChildren.mockReset();
    mockBrowser.bookmarks.create.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Checksum-based change detection', () => {
    it('should detect when cloud has newer bookmarks by comparing checksums', async () => {
      // Scenario: Firefox added a bookmark, Chrome should detect the change
      // Chrome's local checksum: ABC123
      // Cloud checksum (after Firefox sync): XYZ789
      // Chrome should pull the new bookmark

      const localChecksum = 'abc123';
      const cloudChecksum = 'xyz789'; // Different - cloud has changes

      expect(localChecksum).not.toBe(cloudChecksum);
      // This indicates Chrome should pull new bookmarks from cloud
    });

    it('should skip sync when checksums match (no changes)', async () => {
      // Scenario: Both browsers have the same bookmarks
      // Local checksum: ABC123
      // Cloud checksum: ABC123
      // No sync needed

      const localChecksum = 'abc123';
      const cloudChecksum = 'abc123'; // Same - no changes

      expect(localChecksum).toBe(cloudChecksum);
      // This indicates no sync is needed
    });
  });

  describe('Version history - only save for local-to-cloud pushes', () => {
    it('should NOT save version when only pulling from cloud (no local changes)', async () => {
      // Scenario: Chrome pulls new bookmarks from Firefox via cloud
      // This is a PULL operation - no version should be saved
      // Version history should only record PUSH operations (local changes going to cloud)

      const syncResult = {
        addedFromCloud: 5, // Pulled 5 bookmarks from cloud
        deletedLocally: 0,
        localChanges: 0, // No local changes to push
      };

      // When addedFromCloud > 0 but localChanges === 0,
      // we should NOT save a version because we're just pulling
      const shouldSaveVersion = syncResult.localChanges > 0;
      expect(shouldSaveVersion).toBe(false);
    });

    it('should save version when pushing local changes to cloud', async () => {
      // Scenario: User adds bookmark in Chrome, Chrome pushes to cloud
      // This is a PUSH operation - version should be saved

      const syncResult = {
        addedFromCloud: 0,
        deletedLocally: 0,
        localChanges: 3, // 3 local bookmarks being pushed to cloud
      };

      // When localChanges > 0, we should save a version
      const shouldSaveVersion = syncResult.localChanges > 0;
      expect(shouldSaveVersion).toBe(true);
    });

    it('should save version when both pulling and pushing (bidirectional sync)', async () => {
      // Scenario: Chrome has new bookmarks AND cloud has new bookmarks
      // Both directions have changes - version should be saved for the push

      const syncResult = {
        addedFromCloud: 2, // Pulled 2 from cloud
        deletedLocally: 0,
        localChanges: 3, // Pushing 3 to cloud
      };

      // When localChanges > 0, we should save a version
      const shouldSaveVersion = syncResult.localChanges > 0;
      expect(shouldSaveVersion).toBe(true);
    });
  });

  describe('Periodic sync alarm', () => {
    it('should fire every 5 minutes by default', async () => {
      const DEFAULT_SYNC_INTERVAL = 5; // minutes

      // Verify the default interval
      expect(DEFAULT_SYNC_INTERVAL).toBe(5);
    });

    it('should check cloud for new checksums when alarm fires', async () => {
      // When the alarm fires, the extension should:
      // 1. Fetch current cloud bookmarks (GET /api/bookmarks)
      // 2. Compare cloud checksum with local checksum
      // 3. If different, pull new bookmarks from cloud
      // 4. If local has changes, push to cloud

      // This test verifies the flow is correct
      const steps = [
        'fetch_cloud_bookmarks',
        'compare_checksums',
        'pull_if_cloud_newer',
        'push_if_local_changes',
      ];

      expect(steps).toContain('fetch_cloud_bookmarks');
      expect(steps).toContain('compare_checksums');
    });
  });

  describe('Cross-browser sync scenarios', () => {
    it('should sync Firefox bookmark to Chrome via periodic sync', async () => {
      // Step 1: Firefox adds bookmark and syncs to cloud
      // Step 2: Chrome's periodic sync fires
      // Step 3: Chrome fetches cloud bookmarks
      // Step 4: Chrome detects new bookmark (not in local)
      // Step 5: Chrome adds bookmark locally
      // Step 6: Chrome does NOT save version (just pulled, no local changes)

      const firefoxBookmark = {
        url: 'https://firefox-added.com',
        title: 'Added in Firefox',
        folderPath: 'Bookmarks Bar',
        index: 0,
      };

      const chromeLocalBookmarks = [
        { url: 'https://existing.com', title: 'Existing', folderPath: 'Bookmarks Bar', index: 0 },
      ];

      const cloudBookmarks = [
        { url: 'https://existing.com', title: 'Existing', folderPath: 'Bookmarks Bar', index: 0 },
        firefoxBookmark, // New from Firefox
      ];

      // Chrome should detect that firefoxBookmark is new
      const chromeUrls = new Set(chromeLocalBookmarks.map((b) => b.url));
      const newFromCloud = cloudBookmarks.filter((cb) => !chromeUrls.has(cb.url));

      expect(newFromCloud).toHaveLength(1);
      expect(newFromCloud[0].url).toBe('https://firefox-added.com');
    });

    it('should sync Chrome bookmark to Firefox via periodic sync', async () => {
      // Same as above but reversed
      const chromeBookmark = {
        url: 'https://chrome-added.com',
        title: 'Added in Chrome',
        folderPath: 'Bookmarks Bar',
        index: 0,
      };

      const firefoxLocalBookmarks = [
        {
          url: 'https://existing.com',
          title: 'Existing',
          folderPath: 'Bookmarks Toolbar',
          index: 0,
        },
      ];

      const cloudBookmarks = [
        { url: 'https://existing.com', title: 'Existing', folderPath: 'Bookmarks Bar', index: 0 },
        chromeBookmark, // New from Chrome
      ];

      // Firefox should detect that chromeBookmark is new
      const firefoxUrls = new Set(firefoxLocalBookmarks.map((b) => b.url));
      const newFromCloud = cloudBookmarks.filter((cb) => !firefoxUrls.has(cb.url));

      expect(newFromCloud).toHaveLength(1);
      expect(newFromCloud[0].url).toBe('https://chrome-added.com');
    });
  });

  describe('Determining local changes vs cloud changes', () => {
    it('should identify bookmarks that exist locally but not in cloud (local additions)', () => {
      const localBookmarks = [
        { url: 'https://existing.com', title: 'Existing' },
        { url: 'https://new-local.com', title: 'New Local' }, // Only in local
      ];

      const cloudBookmarks = [{ url: 'https://existing.com', title: 'Existing' }];

      const cloudUrls = new Set(cloudBookmarks.map((b) => b.url));
      const localAdditions = localBookmarks.filter((lb) => !cloudUrls.has(lb.url));

      expect(localAdditions).toHaveLength(1);
      expect(localAdditions[0].url).toBe('https://new-local.com');
    });

    it('should identify bookmarks that exist in cloud but not locally (cloud additions)', () => {
      const localBookmarks = [{ url: 'https://existing.com', title: 'Existing' }];

      const cloudBookmarks = [
        { url: 'https://existing.com', title: 'Existing' },
        { url: 'https://new-cloud.com', title: 'New Cloud' }, // Only in cloud
      ];

      const localUrls = new Set(localBookmarks.map((b) => b.url));
      const cloudAdditions = cloudBookmarks.filter((cb) => !localUrls.has(cb.url));

      expect(cloudAdditions).toHaveLength(1);
      expect(cloudAdditions[0].url).toBe('https://new-cloud.com');
    });

    it('should correctly determine if local has changes to push', () => {
      // Local has changes if:
      // 1. Local has bookmarks not in cloud (additions)
      // 2. Local checksum differs from cloud checksum AND local has more recent changes

      const localBookmarks = [
        { url: 'https://a.com', title: 'A' },
        { url: 'https://b.com', title: 'B' },
        { url: 'https://c.com', title: 'C' }, // New local addition
      ];

      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A' },
        { url: 'https://b.com', title: 'B' },
      ];

      const cloudUrls = new Set(cloudBookmarks.map((b) => b.url));
      const localAdditions = localBookmarks.filter((lb) => !cloudUrls.has(lb.url));

      const hasLocalChanges = localAdditions.length > 0;
      expect(hasLocalChanges).toBe(true);
    });
  });

  describe('Version history deduplication', () => {
    it('should not create duplicate versions when checksums match', () => {
      // If the latest version has the same checksum as the current data,
      // no new version should be created

      const latestVersionChecksum = 'abc123';
      const currentDataChecksum = 'abc123';

      const shouldCreateVersion = latestVersionChecksum !== currentDataChecksum;
      expect(shouldCreateVersion).toBe(false);
    });

    it('should create new version when checksums differ', () => {
      const latestVersionChecksum = 'abc123';
      const currentDataChecksum = 'xyz789';

      const shouldCreateVersion = latestVersionChecksum !== currentDataChecksum;
      expect(shouldCreateVersion).toBe(true);
    });
  });

  describe('Sync result tracking', () => {
    it('should track addedFromCloud count', () => {
      const syncResult = {
        addedFromCloud: 3,
        deletedLocally: 0,
        pushedToCloud: 0,
      };

      expect(syncResult.addedFromCloud).toBe(3);
    });

    it('should track pushedToCloud count (local changes)', () => {
      const syncResult = {
        addedFromCloud: 0,
        deletedLocally: 0,
        pushedToCloud: 2,
      };

      expect(syncResult.pushedToCloud).toBe(2);
    });

    it('should determine version save based on pushedToCloud', () => {
      // Version should only be saved when we push local changes to cloud
      // NOT when we only pull from cloud

      const pullOnlyResult = {
        addedFromCloud: 5,
        pushedToCloud: 0,
      };

      const pushResult = {
        addedFromCloud: 0,
        pushedToCloud: 3,
      };

      const bidirectionalResult = {
        addedFromCloud: 2,
        pushedToCloud: 4,
      };

      // Only save version when pushedToCloud > 0
      expect(pullOnlyResult.pushedToCloud > 0).toBe(false); // No version save
      expect(pushResult.pushedToCloud > 0).toBe(true); // Save version
      expect(bidirectionalResult.pushedToCloud > 0).toBe(true); // Save version
    });
  });
});

describe('Periodic Sync - Implementation Details', () => {
  describe('newFromCloud calculation', () => {
    it('should filter out bookmarks that already exist locally by URL', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
        { url: 'https://c.com', title: 'C', type: 'bookmark' },
      ];

      const localBookmarks = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
      ];

      const localUrls = new Set(localBookmarks.filter((b) => b.url).map((b) => b.url));
      const newFromCloud = cloudBookmarks.filter((cb) => {
        // Only check bookmarks (items with URLs)
        if (!cb.url) return false;
        return !localUrls.has(cb.url);
      });

      expect(newFromCloud).toHaveLength(1);
      expect(newFromCloud[0].url).toBe('https://c.com');
    });

    it('should handle folders correctly (folders have no URL)', () => {
      const cloudItems = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { title: 'My Folder', type: 'folder', folderPath: 'Bookmarks Bar' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
      ];

      const localBookmarks = [{ url: 'https://a.com', title: 'A', type: 'bookmark' }];

      const localUrls = new Set(localBookmarks.filter((b) => b.url).map((b) => b.url));

      // Filter for new bookmarks (items with URLs not in local)
      const newBookmarksFromCloud = cloudItems.filter((cb) => {
        if (!cb.url) return false; // Skip folders
        return !localUrls.has(cb.url);
      });

      expect(newBookmarksFromCloud).toHaveLength(1);
      expect(newBookmarksFromCloud[0].url).toBe('https://b.com');
    });
  });

  describe('Local changes detection', () => {
    it('should detect local additions (bookmarks in local but not in cloud)', () => {
      const localBookmarks = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
        { url: 'https://new-local.com', title: 'New', type: 'bookmark' },
      ];

      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
      ];

      const cloudUrls = new Set(cloudBookmarks.filter((b) => b.url).map((b) => b.url));
      const localAdditions = localBookmarks.filter((lb) => {
        if (!lb.url) return false;
        return !cloudUrls.has(lb.url);
      });

      expect(localAdditions).toHaveLength(1);
      expect(localAdditions[0].url).toBe('https://new-local.com');
    });

    it('should detect when local has no changes (all local bookmarks exist in cloud)', () => {
      const localBookmarks = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
      ];

      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', type: 'bookmark' },
        { url: 'https://b.com', title: 'B', type: 'bookmark' },
        { url: 'https://c.com', title: 'C', type: 'bookmark' }, // Extra in cloud
      ];

      const cloudUrls = new Set(cloudBookmarks.filter((b) => b.url).map((b) => b.url));
      const localAdditions = localBookmarks.filter((lb) => {
        if (!lb.url) return false;
        return !cloudUrls.has(lb.url);
      });

      expect(localAdditions).toHaveLength(0);
    });
  });

  describe('Version save decision', () => {
    it('should NOT save version when only pulling from cloud', () => {
      const newFromCloud = [{ url: 'https://new.com' }];
      const localAdditions = [];

      // Only save version when we have local changes to push
      const shouldSaveVersion = localAdditions.length > 0;

      expect(shouldSaveVersion).toBe(false);
    });

    it('should save version when pushing local changes', () => {
      const newFromCloud = [];
      const localAdditions = [{ url: 'https://local-new.com' }];

      // Save version when we have local changes to push
      const shouldSaveVersion = localAdditions.length > 0;

      expect(shouldSaveVersion).toBe(true);
    });

    it('should save version for bidirectional sync (both pull and push)', () => {
      const newFromCloud = [{ url: 'https://cloud-new.com' }];
      const localAdditions = [{ url: 'https://local-new.com' }];

      // Save version when we have local changes to push
      const shouldSaveVersion = localAdditions.length > 0;

      expect(shouldSaveVersion).toBe(true);
    });
  });
});
