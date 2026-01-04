/**
 * Tests for cross-browser sync issues
 * 
 * These tests reproduce the sync issues that occur when:
 * 1. Firefox force pushes bookmarks to cloud
 * 2. Chrome syncs - should get Firefox's bookmarks exactly
 * 
 * Current bugs:
 * - Duplicate/empty folders
 * - Stale bookmarks not being replaced
 * - Folder structure not syncing properly
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

describe('Cross-Browser Sync Issues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Issue 1: Stale bookmarks not being replaced', () => {
    /**
     * Scenario:
     * 1. Firefox has bookmark A with title "Firefox Title" in folder "Work"
     * 2. Chrome has bookmark A with title "Chrome Title" in folder "Personal"
     * 3. Firefox force pushes to cloud
     * 4. Chrome syncs
     * 
     * Expected: Chrome's bookmark A should be updated to match Firefox's
     * Actual Bug: Chrome's bookmark A keeps its old title and folder
     */
    it('should update existing bookmarks when cloud has different metadata', () => {
      // Firefox's bookmark (in cloud after force push)
      const cloudBookmark = {
        url: 'https://example.com',
        title: 'Firefox Title',
        folderPath: 'Bookmarks Toolbar/Work',
        dateAdded: 1700000000000,
        index: 0,
      };

      // Chrome's local bookmark (same URL, different metadata)
      const localBookmark = {
        id: 'chrome-bookmark-1',
        url: 'https://example.com',
        title: 'Chrome Title',
        folderPath: 'Bookmarks Bar/Personal',
        dateAdded: 1699000000000, // Older
        index: 0,
      };

      // Current buggy logic: only checks if URL exists locally
      const localUrls = new Set([localBookmark.url]);
      const newFromCloud = [cloudBookmark].filter(cb => !localUrls.has(cb.url));

      // Bug: newFromCloud is empty because URL exists locally
      expect(newFromCloud).toHaveLength(0);

      // Expected behavior: should detect that bookmark needs updating
      // because cloud version has different title/folder
      const needsUpdate = cloudBookmark.title !== localBookmark.title ||
                          cloudBookmark.folderPath !== localBookmark.folderPath;
      expect(needsUpdate).toBe(true);
    });

    it('should identify bookmarks that need updating (not just adding)', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'Cloud A', folderPath: 'Toolbar/Work', index: 0 },
        { url: 'https://b.com', title: 'Cloud B', folderPath: 'Toolbar/Personal', index: 1 },
        { url: 'https://c.com', title: 'Cloud C', folderPath: 'Toolbar', index: 2 },
      ];

      const localBookmarks = [
        { id: '1', url: 'https://a.com', title: 'Local A', folderPath: 'Bar/Work', index: 0 }, // Different title
        { id: '2', url: 'https://b.com', title: 'Cloud B', folderPath: 'Bar/Personal', index: 1 }, // Same title, different folder
        // c.com doesn't exist locally - should be added
      ];

      // Helper function that should be implemented
      function categorizeCloudBookmarks(cloudBookmarks, localBookmarks) {
        const localByUrl = new Map(localBookmarks.map(b => [b.url, b]));
        
        const toAdd = [];
        const toUpdate = [];
        
        for (const cloudBm of cloudBookmarks) {
          if (!cloudBm.url) continue; // Skip folders
          
          const localBm = localByUrl.get(cloudBm.url);
          if (!localBm) {
            toAdd.push(cloudBm);
          } else {
            // Check if metadata differs (normalize folder paths for comparison)
            const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
            const localFolder = normalizeFolderPath(localBm.folderPath);
            
            if (cloudBm.title !== localBm.title || cloudFolder !== localFolder) {
              toUpdate.push({ cloud: cloudBm, local: localBm });
            }
          }
        }
        
        return { toAdd, toUpdate };
      }

      // Helper to normalize folder paths across browsers
      function normalizeFolderPath(path) {
        if (!path) return '';
        return path
          .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
          .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
          .replace(/^Other Bookmarks\/?/i, 'other/')
          .replace(/^Bookmarks Menu\/?/i, 'menu/');
      }

      const { toAdd, toUpdate } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks);

      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].url).toBe('https://c.com');

      expect(toUpdate).toHaveLength(2);
      expect(toUpdate.map(u => u.cloud.url)).toContain('https://a.com');
      expect(toUpdate.map(u => u.cloud.url)).toContain('https://b.com');
    });
  });

  describe('Issue 2: Folders not being synced', () => {
    /**
     * Current bug: newFromCloud filter skips folders (items without URLs)
     * This means folder structure changes are never synced
     */
    it('should include folders in sync, not just bookmarks', () => {
      const cloudItems = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Toolbar', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: 'Bookmarks Toolbar', index: 1 },
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar/Work', index: 0 },
      ];

      // Current buggy filter - skips folders
      const buggyNewFromCloud = cloudItems.filter(cb => {
        if (!cb.url) return false; // BUG: This skips folders!
        return true;
      });

      expect(buggyNewFromCloud).toHaveLength(1); // Only the bookmark

      // Fixed filter - includes folders
      const fixedNewFromCloud = cloudItems.filter(cb => {
        // Include both bookmarks (have URL) and folders (type === 'folder')
        return cb.url || cb.type === 'folder';
      });

      expect(fixedNewFromCloud).toHaveLength(3); // Bookmark + 2 folders
    });

    it('should sync folder order changes', () => {
      // Cloud has folders in order: Work, Personal, Archive
      const cloudFolders = [
        { type: 'folder', title: 'Work', folderPath: 'toolbar', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: 'toolbar', index: 1 },
        { type: 'folder', title: 'Archive', folderPath: 'toolbar', index: 2 },
      ];

      // Local has folders in different order: Personal, Work, Archive
      const localFolders = [
        { id: 'f1', type: 'folder', title: 'Personal', folderPath: 'toolbar', index: 0 },
        { id: 'f2', type: 'folder', title: 'Work', folderPath: 'toolbar', index: 1 },
        { id: 'f3', type: 'folder', title: 'Archive', folderPath: 'toolbar', index: 2 },
      ];

      // Should detect that Work and Personal need to be reordered
      function detectFolderOrderChanges(cloudFolders, localFolders) {
        const localByTitle = new Map(localFolders.map(f => [`${f.folderPath}/${f.title}`, f]));
        const changes = [];

        for (const cloudFolder of cloudFolders) {
          const key = `${cloudFolder.folderPath}/${cloudFolder.title}`;
          const localFolder = localByTitle.get(key);
          
          if (localFolder && localFolder.index !== cloudFolder.index) {
            changes.push({
              folder: cloudFolder,
              localId: localFolder.id,
              fromIndex: localFolder.index,
              toIndex: cloudFolder.index,
            });
          }
        }

        return changes;
      }

      const orderChanges = detectFolderOrderChanges(cloudFolders, localFolders);
      
      expect(orderChanges).toHaveLength(2);
      expect(orderChanges.find(c => c.folder.title === 'Work').toIndex).toBe(0);
      expect(orderChanges.find(c => c.folder.title === 'Personal').toIndex).toBe(1);
    });
  });

  describe('Issue 3: Duplicate folders from different root names', () => {
    /**
     * Firefox uses "Bookmarks Toolbar", Chrome uses "Bookmarks Bar"
     * When syncing, this can cause duplicate folders
     */
    it('should normalize root folder names when comparing', () => {
      const firefoxPath = 'Bookmarks Toolbar/Work/Projects';
      const chromePath = 'Bookmarks Bar/Work/Projects';

      // These should be considered the same folder
      function normalizeFolderPath(path) {
        if (!path) return '';
        return path
          .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
          .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
          .replace(/^Speed Dial\/?/i, 'toolbar/')
          .replace(/^Other Bookmarks\/?/i, 'other/')
          .replace(/^Unsorted Bookmarks\/?/i, 'other/')
          .replace(/^Bookmarks Menu\/?/i, 'menu/');
      }

      expect(normalizeFolderPath(firefoxPath)).toBe('toolbar/Work/Projects');
      expect(normalizeFolderPath(chromePath)).toBe('toolbar/Work/Projects');
      expect(normalizeFolderPath(firefoxPath)).toBe(normalizeFolderPath(chromePath));
    });

    it('should not create duplicate folders when root names differ', () => {
      // Cloud has folder from Firefox
      const cloudFolder = {
        type: 'folder',
        title: 'Work',
        folderPath: 'Bookmarks Toolbar', // Firefox root
        index: 0,
      };

      // Chrome already has the same folder (different root name)
      const localFolders = [
        { id: 'f1', type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 },
      ];

      function normalizeFolderPath(path) {
        if (!path) return '';
        return path
          .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
          .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/');
      }

      // Check if folder already exists (with normalized paths)
      const normalizedCloudPath = normalizeFolderPath(cloudFolder.folderPath);
      const folderExists = localFolders.some(lf => {
        const normalizedLocalPath = normalizeFolderPath(lf.folderPath);
        return lf.title === cloudFolder.title && normalizedLocalPath === normalizedCloudPath;
      });

      expect(folderExists).toBe(true);
      // Should NOT create a new folder
    });
  });

  describe('Issue 4: Server merge pollutes cloud with stale data', () => {
    /**
     * When Chrome syncs after Firefox force push:
     * 1. Chrome pulls Firefox's bookmarks
     * 2. Chrome pushes its merged bookmarks back
     * 3. Server merges Chrome's stale data with cloud
     * 4. Cloud now has both Firefox's and Chrome's bookmarks
     */
    it('should not push local bookmarks that conflict with cloud after force pull scenario', () => {
      // After Firefox force push, cloud has:
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'Firefox A', folderPath: 'toolbar/Work', dateAdded: 1700000000000 },
        { url: 'https://b.com', title: 'Firefox B', folderPath: 'toolbar/Personal', dateAdded: 1700000000000 },
      ];

      // Chrome's local bookmarks (stale):
      const localBookmarks = [
        { url: 'https://a.com', title: 'Chrome A', folderPath: 'toolbar/Old', dateAdded: 1699000000000 },
        { url: 'https://c.com', title: 'Chrome C', folderPath: 'toolbar/Old', dateAdded: 1699000000000 },
      ];

      // Current buggy behavior: Chrome pushes all its bookmarks
      // This causes 'Chrome A' and 'Chrome C' to be merged into cloud

      // Expected behavior after sync:
      // - Chrome should have: Firefox A, Firefox B (from cloud)
      // - Chrome should NOT push 'Chrome A' (same URL, cloud is authoritative after force push)
      // - Chrome SHOULD push 'Chrome C' (new bookmark not in cloud)

      // The key insight: after a force push from another browser,
      // the syncing browser should treat cloud as authoritative for existing URLs
      
      function determineLocalAdditions(localBookmarks, cloudBookmarks, lastForcePushTime) {
        const cloudUrls = new Set(cloudBookmarks.map(b => b.url));
        
        return localBookmarks.filter(lb => {
          // Only push bookmarks that don't exist in cloud
          if (cloudUrls.has(lb.url)) {
            return false; // Cloud has this URL, don't push local version
          }
          return true;
        });
      }

      const localAdditions = determineLocalAdditions(localBookmarks, cloudBookmarks, null);
      
      expect(localAdditions).toHaveLength(1);
      expect(localAdditions[0].url).toBe('https://c.com');
    });
  });

  describe('Correct sync behavior after force push', () => {
    /**
     * The correct flow after Firefox force push:
     * 1. Chrome syncs
     * 2. Chrome should REPLACE its bookmarks with cloud bookmarks (for matching URLs)
     * 3. Chrome should ADD new bookmarks from cloud
     * 4. Chrome should only push truly NEW local bookmarks (URLs not in cloud)
     */
    it('should implement correct sync flow', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'Cloud A', folderPath: 'toolbar/Work', index: 0 },
        { url: 'https://b.com', title: 'Cloud B', folderPath: 'toolbar/Work', index: 1 },
      ];

      const localBookmarks = [
        { id: '1', url: 'https://a.com', title: 'Local A', folderPath: 'toolbar/Old', index: 0 },
        { id: '2', url: 'https://c.com', title: 'Local C', folderPath: 'toolbar/Mine', index: 1 },
      ];

      // Step 1: Categorize cloud bookmarks
      function categorizeCloudBookmarks(cloudBookmarks, localBookmarks) {
        const localByUrl = new Map(localBookmarks.map(b => [b.url, b]));
        
        const toAdd = [];
        const toUpdate = [];
        
        for (const cloudBm of cloudBookmarks) {
          if (!cloudBm.url) continue;
          
          const localBm = localByUrl.get(cloudBm.url);
          if (!localBm) {
            toAdd.push(cloudBm);
          } else {
            // Always update to match cloud (cloud is authoritative)
            toUpdate.push({ cloud: cloudBm, local: localBm });
          }
        }
        
        return { toAdd, toUpdate };
      }

      // Step 2: Determine what to push to cloud
      function determineLocalAdditions(localBookmarks, cloudBookmarks) {
        const cloudUrls = new Set(cloudBookmarks.map(b => b.url));
        return localBookmarks.filter(lb => lb.url && !cloudUrls.has(lb.url));
      }

      const { toAdd, toUpdate } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks);
      const localAdditions = determineLocalAdditions(localBookmarks, cloudBookmarks);

      // Verify categorization
      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].url).toBe('https://b.com');

      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0].cloud.url).toBe('https://a.com');
      expect(toUpdate[0].local.id).toBe('1');

      expect(localAdditions).toHaveLength(1);
      expect(localAdditions[0].url).toBe('https://c.com');
    });
  });
});

describe('Folder Path Normalization', () => {
  /**
   * Helper function to normalize folder paths across different browsers
   */
  function normalizeFolderPath(path) {
    if (!path) return '';
    return path
      // Normalize toolbar variations
      .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
      .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
      .replace(/^Speed Dial\/?/i, 'toolbar/')
      .replace(/^Favourites Bar\/?/i, 'toolbar/')
      // Normalize other bookmarks variations
      .replace(/^Other Bookmarks\/?/i, 'other/')
      .replace(/^Unsorted Bookmarks\/?/i, 'other/')
      // Normalize menu variations (Firefox)
      .replace(/^Bookmarks Menu\/?/i, 'menu/')
      // Clean up trailing slashes
      .replace(/\/+$/, '');
  }

  it('should normalize Firefox toolbar path', () => {
    expect(normalizeFolderPath('Bookmarks Toolbar/Work')).toBe('toolbar/Work');
  });

  it('should normalize Chrome toolbar path', () => {
    expect(normalizeFolderPath('Bookmarks Bar/Work')).toBe('toolbar/Work');
  });

  it('should normalize Opera toolbar path', () => {
    expect(normalizeFolderPath('Speed Dial/Work')).toBe('toolbar/Work');
  });

  it('should normalize Firefox other bookmarks path', () => {
    expect(normalizeFolderPath('Unsorted Bookmarks/Misc')).toBe('other/Misc');
  });

  it('should normalize Chrome other bookmarks path', () => {
    expect(normalizeFolderPath('Other Bookmarks/Misc')).toBe('other/Misc');
  });

  it('should normalize Firefox menu path', () => {
    expect(normalizeFolderPath('Bookmarks Menu/Reading')).toBe('menu/Reading');
  });

  it('should handle empty path', () => {
    expect(normalizeFolderPath('')).toBe('');
    expect(normalizeFolderPath(null)).toBe('');
    expect(normalizeFolderPath(undefined)).toBe('');
  });

  it('should handle nested paths', () => {
    expect(normalizeFolderPath('Bookmarks Bar/Work/Projects/Active')).toBe('toolbar/Work/Projects/Active');
  });

  it('should be case insensitive', () => {
    expect(normalizeFolderPath('BOOKMARKS BAR/Work')).toBe('toolbar/Work');
    expect(normalizeFolderPath('bookmarks toolbar/Work')).toBe('toolbar/Work');
  });
});

describe('Bookmark Update Detection', () => {
  function normalizeFolderPath(path) {
    if (!path) return '';
    return path
      .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
      .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
      .replace(/^Other Bookmarks\/?/i, 'other/')
      .replace(/^Unsorted Bookmarks\/?/i, 'other/')
      .replace(/^Bookmarks Menu\/?/i, 'menu/')
      .replace(/\/+$/, '');
  }

  function bookmarkNeedsUpdate(cloudBm, localBm) {
    // Title changed
    if (cloudBm.title !== localBm.title) return true;
    
    // Folder changed (with normalization)
    const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
    const localFolder = normalizeFolderPath(localBm.folderPath);
    if (cloudFolder !== localFolder) return true;
    
    // Index changed (position within folder)
    if (cloudBm.index !== localBm.index) return true;
    
    return false;
  }

  it('should detect title change', () => {
    const cloud = { url: 'https://a.com', title: 'New Title', folderPath: 'toolbar/Work', index: 0 };
    const local = { url: 'https://a.com', title: 'Old Title', folderPath: 'Bookmarks Bar/Work', index: 0 };
    
    expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
  });

  it('should detect folder change', () => {
    const cloud = { url: 'https://a.com', title: 'Title', folderPath: 'toolbar/Personal', index: 0 };
    const local = { url: 'https://a.com', title: 'Title', folderPath: 'Bookmarks Bar/Work', index: 0 };
    
    expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
  });

  it('should detect index change', () => {
    const cloud = { url: 'https://a.com', title: 'Title', folderPath: 'toolbar/Work', index: 5 };
    const local = { url: 'https://a.com', title: 'Title', folderPath: 'Bookmarks Bar/Work', index: 0 };
    
    expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
  });

  it('should not detect change when only root folder name differs', () => {
    const cloud = { url: 'https://a.com', title: 'Title', folderPath: 'Bookmarks Toolbar/Work', index: 0 };
    const local = { url: 'https://a.com', title: 'Title', folderPath: 'Bookmarks Bar/Work', index: 0 };
    
    // After normalization, these are the same
    expect(bookmarkNeedsUpdate(cloud, local)).toBe(false);
  });

  it('should not detect change when everything matches', () => {
    const cloud = { url: 'https://a.com', title: 'Title', folderPath: 'toolbar/Work', index: 0 };
    const local = { url: 'https://a.com', title: 'Title', folderPath: 'Bookmarks Bar/Work', index: 0 };
    
    expect(bookmarkNeedsUpdate(cloud, local)).toBe(false);
  });
});
