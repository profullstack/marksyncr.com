/**
 * Comprehensive Tests for Bookmark Syncing
 *
 * This test file covers the core syncing functionality that has been problematic:
 * - Checksum generation and normalization
 * - Tombstone handling and safeguards
 * - Two-way sync flow
 * - Cross-browser folder path normalization
 * - Race conditions and edge cases
 * - Force push/pull operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock Setup
// ============================================================================

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

// Mock fetch
global.fetch = vi.fn();

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
  },
  writable: true,
  configurable: true,
});

// ============================================================================
// Helper Functions (matching implementation in background/index.js)
// ============================================================================

/**
 * Normalize items for checksum comparison (mirrors implementation)
 */
function normalizeItemsForChecksum(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (item.type === 'folder') {
        return {
          type: 'folder',
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      } else {
        return {
          type: 'bookmark',
          url: item.url,
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      }
    })
    .sort((a, b) => {
      const folderCompare = a.folderPath.localeCompare(b.folderPath);
      if (folderCompare !== 0) return folderCompare;
      return (a.index ?? 0) - (b.index ?? 0);
    });
}

/**
 * Normalize folder path for cross-browser comparison
 */
function normalizeFolderPath(path) {
  if (!path) return '';
  return path
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

/**
 * Check if a bookmark needs update based on cloud data
 */
function bookmarkNeedsUpdate(cloudBm, localBm) {
  if ((cloudBm.title ?? '') !== (localBm.title ?? '')) return true;

  const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
  const localFolder = normalizeFolderPath(localBm.folderPath);
  if (cloudFolder !== localFolder) return true;

  if (cloudBm.index !== undefined && localBm.index !== undefined && cloudBm.index !== localBm.index)
    return true;

  return false;
}

/**
 * Categorize cloud bookmarks into those to add vs update
 */
function categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones) {
  const localByUrl = new Map(localBookmarks.filter((b) => b.url).map((b) => [b.url, b]));

  const toAdd = [];
  const toUpdate = [];

  for (const cloudBm of cloudBookmarks) {
    if (!cloudBm.url) continue;

    const tombstone = tombstones.find((t) => t.url === cloudBm.url);
    if (tombstone) {
      const bookmarkDate = cloudBm.dateAdded || 0;
      const tombstoneDate = tombstone.deletedAt || 0;
      if (bookmarkDate <= tombstoneDate) {
        continue;
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      toUpdate.push({ cloud: cloudBm, local: localBm });
    }
  }

  return { toAdd, toUpdate };
}

/**
 * Filter cloud tombstones for safeguard
 */
function filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime) {
  if (!cloudTombstones || cloudTombstones.length === 0) {
    return [];
  }

  if (!lastSyncTime) {
    return [];
  }

  const localTombstoneUrls = new Set(localTombstones.map((t) => t.url));

  return cloudTombstones.filter((tombstone) => {
    if (localTombstoneUrls.has(tombstone.url)) {
      return true;
    }
    if (tombstone.deletedAt > lastSyncTime) {
      return true;
    }
    return false;
  });
}

/**
 * Merge tombstones keeping newest deletion time
 */
function mergeTombstones(localTombstones, cloudTombstones) {
  const tombstoneMap = new Map();

  for (const t of localTombstones) {
    tombstoneMap.set(t.url, t.deletedAt);
  }

  for (const t of cloudTombstones) {
    const existing = tombstoneMap.get(t.url);
    if (!existing || t.deletedAt > existing) {
      tombstoneMap.set(t.url, t.deletedAt);
    }
  }

  return Array.from(tombstoneMap.entries()).map(([url, deletedAt]) => ({ url, deletedAt }));
}

/**
 * Flatten bookmark tree to array
 */
function flattenBookmarkTree(tree) {
  const items = [];

  function traverse(nodes, parentPath = '') {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeIndex = node.index ?? i;

      if (node.url) {
        items.push({
          type: 'bookmark',
          id: node.id,
          url: node.url,
          title: node.title ?? '',
          folderPath: parentPath,
          dateAdded: node.dateAdded,
          index: nodeIndex,
        });
      } else if (node.children) {
        const folderPath = node.title
          ? parentPath
            ? `${parentPath}/${node.title}`
            : node.title
          : parentPath;

        if (node.title && parentPath) {
          items.push({
            type: 'folder',
            id: node.id,
            title: node.title,
            folderPath: parentPath,
            dateAdded: node.dateAdded,
            index: nodeIndex,
          });
        }

        traverse(node.children, folderPath);
      }
    }
  }

  traverse(tree);
  return items;
}

// ============================================================================
// Tests
// ============================================================================

describe('Sync Comprehensive Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // normalizeItemsForChecksum Tests
  // ==========================================================================
  describe('normalizeItemsForChecksum', () => {
    it('should normalize bookmarks with consistent field extraction', () => {
      const items = [
        {
          url: 'https://a.com',
          title: 'A',
          folderPath: 'Work',
          index: 0,
          dateAdded: 123,
          extra: 'ignore',
        },
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 1, randomField: true },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized).toHaveLength(2);
      expect(normalized[0]).toEqual({
        type: 'bookmark',
        url: 'https://a.com',
        title: 'A',
        folderPath: 'Work',
        index: 0,
      });
      // dateAdded, extra, randomField should be excluded
      expect(normalized[0]).not.toHaveProperty('dateAdded');
      expect(normalized[0]).not.toHaveProperty('extra');
    });

    it('should handle folders correctly', () => {
      const items = [
        { type: 'folder', title: 'Work', folderPath: 'Toolbar', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: 'Toolbar', index: 1 },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized).toHaveLength(2);
      expect(normalized[0].type).toBe('folder');
      expect(normalized[0]).not.toHaveProperty('url');
    });

    it('should sort by folderPath first, then by index', () => {
      const items = [
        { url: 'https://c.com', title: 'C', folderPath: 'Work', index: 2 },
        { url: 'https://a.com', title: 'A', folderPath: 'Personal', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 0 },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].folderPath).toBe('Personal');
      expect(normalized[1].folderPath).toBe('Work');
      expect(normalized[1].index).toBe(0);
      expect(normalized[2].folderPath).toBe('Work');
      expect(normalized[2].index).toBe(2);
    });

    it('should handle null/undefined titles as empty strings', () => {
      const items = [
        { url: 'https://a.com', title: null, folderPath: 'Work', index: 0 },
        { url: 'https://b.com', title: undefined, folderPath: 'Work', index: 1 },
        { url: 'https://c.com', folderPath: 'Work', index: 2 },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].title).toBe('');
      expect(normalized[1].title).toBe('');
      expect(normalized[2].title).toBe('');
    });

    it('should handle folder_path alias (snake_case)', () => {
      const items = [{ url: 'https://a.com', title: 'A', folder_path: 'Work', index: 0 }];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].folderPath).toBe('Work');
    });

    it('should handle empty array', () => {
      expect(normalizeItemsForChecksum([])).toEqual([]);
    });

    it('should handle non-array input', () => {
      expect(normalizeItemsForChecksum(null)).toEqual([]);
      expect(normalizeItemsForChecksum(undefined)).toEqual([]);
      expect(normalizeItemsForChecksum('string')).toEqual([]);
    });

    it('should default missing index to 0', () => {
      const items = [{ url: 'https://a.com', title: 'A', folderPath: 'Work' }];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].index).toBe(0);
    });

    it('should NOT include dateAdded in checksum (critical for sync stability)', () => {
      const items1 = [
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0, dateAdded: 1000 },
      ];
      const items2 = [
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0, dateAdded: 2000 },
      ];

      const normalized1 = normalizeItemsForChecksum(items1);
      const normalized2 = normalizeItemsForChecksum(items2);

      expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2));
    });

    it('should produce different checksums for different orders', () => {
      const items1 = [
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 1 },
      ];
      const items2 = [
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 1 },
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 0 },
      ];

      const normalized1 = normalizeItemsForChecksum(items1);
      const normalized2 = normalizeItemsForChecksum(items2);

      expect(JSON.stringify(normalized1)).not.toBe(JSON.stringify(normalized2));
    });
  });

  // ==========================================================================
  // normalizeFolderPath Tests
  // ==========================================================================
  describe('normalizeFolderPath', () => {
    it('should normalize Chrome toolbar path', () => {
      expect(normalizeFolderPath('Bookmarks Bar/Work')).toBe('toolbar/Work');
    });

    it('should normalize Firefox toolbar path', () => {
      expect(normalizeFolderPath('Bookmarks Toolbar/Work')).toBe('toolbar/Work');
    });

    it('should normalize Opera toolbar path', () => {
      expect(normalizeFolderPath('Speed Dial/Work')).toBe('toolbar/Work');
    });

    it('should normalize Edge toolbar path', () => {
      expect(normalizeFolderPath('Favorites Bar/Work')).toBe('toolbar/Work');
    });

    it('should normalize Chrome other bookmarks path', () => {
      expect(normalizeFolderPath('Other Bookmarks/Misc')).toBe('other/Misc');
    });

    it('should normalize Firefox other bookmarks path', () => {
      expect(normalizeFolderPath('Unsorted Bookmarks/Misc')).toBe('other/Misc');
    });

    it('should normalize Firefox menu path', () => {
      expect(normalizeFolderPath('Bookmarks Menu/Reading')).toBe('menu/Reading');
    });

    it('should be case insensitive', () => {
      expect(normalizeFolderPath('BOOKMARKS BAR/Work')).toBe('toolbar/Work');
      expect(normalizeFolderPath('bookmarks toolbar/work')).toBe('toolbar/work');
    });

    it('should handle deeply nested paths', () => {
      expect(normalizeFolderPath('Bookmarks Bar/Work/Projects/Active/2024')).toBe(
        'toolbar/Work/Projects/Active/2024'
      );
    });

    it('should handle empty/null/undefined', () => {
      expect(normalizeFolderPath('')).toBe('');
      expect(normalizeFolderPath(null)).toBe('');
      expect(normalizeFolderPath(undefined)).toBe('');
    });

    it('should remove trailing slashes', () => {
      expect(normalizeFolderPath('Bookmarks Bar/Work/')).toBe('toolbar/Work');
      expect(normalizeFolderPath('Bookmarks Bar/Work///')).toBe('toolbar/Work');
    });

    it('should handle paths without known root', () => {
      expect(normalizeFolderPath('Custom/Folder')).toBe('Custom/Folder');
    });
  });

  // ==========================================================================
  // bookmarkNeedsUpdate Tests
  // ==========================================================================
  describe('bookmarkNeedsUpdate', () => {
    it('should detect title change', () => {
      const cloud = {
        url: 'https://a.com',
        title: 'New Title',
        folderPath: 'toolbar/Work',
        index: 0,
      };
      const local = {
        url: 'https://a.com',
        title: 'Old Title',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
    });

    it('should detect folder change (after normalization)', () => {
      const cloud = {
        url: 'https://a.com',
        title: 'Title',
        folderPath: 'toolbar/Personal',
        index: 0,
      };
      const local = {
        url: 'https://a.com',
        title: 'Title',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
    });

    it('should detect index change', () => {
      const cloud = { url: 'https://a.com', title: 'Title', folderPath: 'toolbar/Work', index: 5 };
      const local = {
        url: 'https://a.com',
        title: 'Title',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
    });

    it('should NOT detect change when only root folder name differs', () => {
      const cloud = {
        url: 'https://a.com',
        title: 'Title',
        folderPath: 'Bookmarks Toolbar/Work',
        index: 0,
      };
      const local = {
        url: 'https://a.com',
        title: 'Title',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(false);
    });

    it('should NOT detect change when everything matches', () => {
      const cloud = { url: 'https://a.com', title: 'Title', folderPath: 'toolbar/Work', index: 0 };
      const local = {
        url: 'https://a.com',
        title: 'Title',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(false);
    });

    it('should handle empty titles correctly', () => {
      const cloud = { url: 'https://a.com', title: '', folderPath: 'toolbar', index: 0 };
      const local = { url: 'https://a.com', title: '', folderPath: 'Bookmarks Bar', index: 0 };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(false);
    });

    it('should treat null/undefined titles as empty', () => {
      const cloud = { url: 'https://a.com', title: null, folderPath: 'toolbar', index: 0 };
      const local = {
        url: 'https://a.com',
        title: undefined,
        folderPath: 'Bookmarks Bar',
        index: 0,
      };

      expect(bookmarkNeedsUpdate(cloud, local)).toBe(false);
    });
  });

  // ==========================================================================
  // categorizeCloudBookmarks Tests
  // ==========================================================================
  describe('categorizeCloudBookmarks', () => {
    it('should categorize new bookmarks to add', () => {
      const cloudBookmarks = [{ url: 'https://new.com', title: 'New', folderPath: 'Work' }];
      const localBookmarks = [
        { url: 'https://existing.com', title: 'Existing', folderPath: 'Work' },
      ];
      const tombstones = [];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].url).toBe('https://new.com');
      expect(toUpdate).toHaveLength(0);
    });

    it('should categorize bookmarks needing update', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'Cloud Title', folderPath: 'toolbar/Work' },
      ];
      const localBookmarks = [
        { url: 'https://a.com', title: 'Local Title', folderPath: 'Bookmarks Bar/Work' },
      ];
      const tombstones = [];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(0);
      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0].cloud.title).toBe('Cloud Title');
      expect(toUpdate[0].local.title).toBe('Local Title');
    });

    it('should skip bookmarks that match local exactly', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'Same Title', folderPath: 'toolbar/Work', index: 0 },
      ];
      const localBookmarks = [
        { url: 'https://a.com', title: 'Same Title', folderPath: 'Bookmarks Bar/Work', index: 0 },
      ];
      const tombstones = [];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(0);
      expect(toUpdate).toHaveLength(0);
    });

    it('should skip cloud bookmarks with tombstone newer than bookmark', () => {
      const cloudBookmarks = [
        { url: 'https://deleted.com', title: 'Deleted', folderPath: 'Work', dateAdded: 1000 },
      ];
      const localBookmarks = [];
      const tombstones = [
        { url: 'https://deleted.com', deletedAt: 2000 }, // Tombstone is newer
      ];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(0);
      expect(toUpdate).toHaveLength(0);
    });

    it('should add cloud bookmark when bookmark is newer than tombstone', () => {
      const cloudBookmarks = [
        { url: 'https://readded.com', title: 'Re-added', folderPath: 'Work', dateAdded: 3000 },
      ];
      const localBookmarks = [];
      const tombstones = [
        { url: 'https://readded.com', deletedAt: 1000 }, // Bookmark is newer
      ];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].url).toBe('https://readded.com');
    });

    it('should skip folders (items without URL)', () => {
      const cloudBookmarks = [
        { type: 'folder', title: 'Work', folderPath: 'Toolbar' },
        { url: 'https://a.com', title: 'A', folderPath: 'Work' },
      ];
      const localBookmarks = [];
      const tombstones = [];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].url).toBe('https://a.com');
    });

    it('should handle missing dateAdded as 0', () => {
      const cloudBookmarks = [
        { url: 'https://no-date.com', title: 'No Date', folderPath: 'Work' }, // No dateAdded
      ];
      const localBookmarks = [];
      const tombstones = [
        { url: 'https://no-date.com', deletedAt: 1 }, // Tombstone is newer than 0
      ];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(0);
    });

    it('should handle missing deletedAt as 0', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Work', dateAdded: 1 },
      ];
      const localBookmarks = [];
      const tombstones = [
        { url: 'https://a.com' }, // No deletedAt, treated as 0
      ];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(1); // Bookmark dateAdded (1) > tombstone deletedAt (0)
    });

    it('should categorize multiple bookmarks correctly', () => {
      const cloudBookmarks = [
        { url: 'https://new.com', title: 'New', folderPath: 'Work' },
        { url: 'https://update.com', title: 'Cloud Update', folderPath: 'toolbar/Work', index: 5 },
        { url: 'https://same.com', title: 'Same', folderPath: 'toolbar/Work', index: 0 },
        { url: 'https://tombstoned.com', title: 'Tombstoned', folderPath: 'Work', dateAdded: 1000 },
      ];
      const localBookmarks = [
        {
          url: 'https://update.com',
          title: 'Local Update',
          folderPath: 'Bookmarks Bar/Work',
          index: 0,
        },
        { url: 'https://same.com', title: 'Same', folderPath: 'Bookmarks Bar/Work', index: 0 },
      ];
      const tombstones = [{ url: 'https://tombstoned.com', deletedAt: 2000 }];

      const { toAdd, toUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        tombstones
      );

      expect(toAdd).toHaveLength(1);
      expect(toAdd[0].url).toBe('https://new.com');
      expect(toUpdate).toHaveLength(1);
      expect(toUpdate[0].cloud.url).toBe('https://update.com');
    });
  });

  // ==========================================================================
  // filterTombstonesToApply Tests
  // ==========================================================================
  describe('filterTombstonesToApply', () => {
    it('should return empty array when no cloud tombstones', () => {
      const result = filterTombstonesToApply([], [], 1000);
      expect(result).toEqual([]);
    });

    it('should return empty array on first sync (no lastSyncTime)', () => {
      const cloudTombstones = [{ url: 'https://a.com', deletedAt: 1000 }];
      const localTombstones = [];

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, null);

      expect(result).toEqual([]);
    });

    it('should include tombstones that exist locally', () => {
      const cloudTombstones = [{ url: 'https://a.com', deletedAt: 500 }];
      const localTombstones = [{ url: 'https://a.com', deletedAt: 400 }];
      const lastSyncTime = 1000;

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://a.com');
    });

    it('should include tombstones created after last sync', () => {
      const cloudTombstones = [{ url: 'https://new-delete.com', deletedAt: 2000 }];
      const localTombstones = [];
      const lastSyncTime = 1000;

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://new-delete.com');
    });

    it('should exclude stale tombstones (created before last sync, no local match)', () => {
      const cloudTombstones = [{ url: 'https://stale.com', deletedAt: 500 }];
      const localTombstones = [];
      const lastSyncTime = 1000;

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(0);
    });

    it('should correctly filter mixed tombstones', () => {
      const cloudTombstones = [
        { url: 'https://local-known.com', deletedAt: 500 }, // Exists locally
        { url: 'https://new-delete.com', deletedAt: 2000 }, // After last sync
        { url: 'https://stale.com', deletedAt: 300 }, // Stale, before sync, no local
      ];
      const localTombstones = [{ url: 'https://local-known.com', deletedAt: 400 }];
      const lastSyncTime = 1000;

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.url)).toContain('https://local-known.com');
      expect(result.map((t) => t.url)).toContain('https://new-delete.com');
      expect(result.map((t) => t.url)).not.toContain('https://stale.com');
    });

    it('should handle edge case: deletedAt exactly equals lastSyncTime', () => {
      const cloudTombstones = [{ url: 'https://exact.com', deletedAt: 1000 }];
      const localTombstones = [];
      const lastSyncTime = 1000;

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      // deletedAt (1000) is NOT > lastSyncTime (1000), so should be excluded
      expect(result).toHaveLength(0);
    });
  });

  // ==========================================================================
  // mergeTombstones Tests
  // ==========================================================================
  describe('mergeTombstones', () => {
    it('should combine local and cloud tombstones', () => {
      const local = [{ url: 'https://local.com', deletedAt: 1000 }];
      const cloud = [{ url: 'https://cloud.com', deletedAt: 2000 }];

      const merged = mergeTombstones(local, cloud);

      expect(merged).toHaveLength(2);
      expect(merged.find((t) => t.url === 'https://local.com')).toBeDefined();
      expect(merged.find((t) => t.url === 'https://cloud.com')).toBeDefined();
    });

    it('should keep newest deletedAt for same URL', () => {
      const local = [{ url: 'https://same.com', deletedAt: 1000 }];
      const cloud = [{ url: 'https://same.com', deletedAt: 2000 }];

      const merged = mergeTombstones(local, cloud);

      expect(merged).toHaveLength(1);
      expect(merged[0].deletedAt).toBe(2000);
    });

    it('should keep local deletedAt if newer', () => {
      const local = [{ url: 'https://same.com', deletedAt: 3000 }];
      const cloud = [{ url: 'https://same.com', deletedAt: 1000 }];

      const merged = mergeTombstones(local, cloud);

      expect(merged).toHaveLength(1);
      expect(merged[0].deletedAt).toBe(3000);
    });

    it('should handle empty local tombstones', () => {
      const local = [];
      const cloud = [{ url: 'https://cloud.com', deletedAt: 1000 }];

      const merged = mergeTombstones(local, cloud);

      expect(merged).toHaveLength(1);
    });

    it('should handle empty cloud tombstones', () => {
      const local = [{ url: 'https://local.com', deletedAt: 1000 }];
      const cloud = [];

      const merged = mergeTombstones(local, cloud);

      expect(merged).toHaveLength(1);
    });

    it('should handle both empty', () => {
      const merged = mergeTombstones([], []);
      expect(merged).toEqual([]);
    });
  });

  // ==========================================================================
  // flattenBookmarkTree Tests
  // ==========================================================================
  describe('flattenBookmarkTree', () => {
    it('should flatten a simple tree', () => {
      const tree = [
        {
          id: 'root',
          children: [
            { id: 'b1', url: 'https://a.com', title: 'A', index: 0 },
            { id: 'b2', url: 'https://b.com', title: 'B', index: 1 },
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      expect(flat).toHaveLength(2);
      expect(flat[0].url).toBe('https://a.com');
      expect(flat[0].type).toBe('bookmark');
    });

    it('should handle nested folders', () => {
      const tree = [
        {
          id: 'root',
          children: [
            {
              id: 'folder1',
              title: 'Work',
              children: [{ id: 'b1', url: 'https://a.com', title: 'A', index: 0 }],
            },
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      expect(flat).toHaveLength(1);
      expect(flat[0].folderPath).toBe('Work');
    });

    it('should include folder entries for non-root folders', () => {
      const tree = [
        {
          id: 'root',
          children: [
            {
              id: 'toolbar',
              title: 'Bookmarks Toolbar',
              children: [
                {
                  id: 'folder1',
                  title: 'Work',
                  index: 0,
                  children: [{ id: 'b1', url: 'https://a.com', title: 'A', index: 0 }],
                },
              ],
            },
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      const folderEntry = flat.find((i) => i.type === 'folder');
      expect(folderEntry).toBeDefined();
      expect(folderEntry.title).toBe('Work');
      expect(folderEntry.folderPath).toBe('Bookmarks Toolbar');
    });

    it('should preserve empty titles', () => {
      const tree = [
        {
          id: 'root',
          children: [
            { id: 'b1', url: 'https://a.com', title: '', index: 0 },
            { id: 'b2', url: 'https://b.com', index: 1 }, // No title
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      expect(flat[0].title).toBe('');
      expect(flat[1].title).toBe('');
    });

    it('should preserve index from node or use array position', () => {
      const tree = [
        {
          id: 'root',
          children: [
            { id: 'b1', url: 'https://a.com', title: 'A', index: 5 },
            { id: 'b2', url: 'https://b.com', title: 'B' }, // No index, should use array position (1)
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      expect(flat[0].index).toBe(5);
      expect(flat[1].index).toBe(1);
    });

    it('should handle deeply nested structure', () => {
      const tree = [
        {
          id: 'root',
          children: [
            {
              id: 'f1',
              title: 'Level1',
              children: [
                {
                  id: 'f2',
                  title: 'Level2',
                  children: [
                    {
                      id: 'f3',
                      title: 'Level3',
                      children: [{ id: 'b1', url: 'https://deep.com', title: 'Deep', index: 0 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      const bookmark = flat.find((i) => i.url === 'https://deep.com');
      expect(bookmark.folderPath).toBe('Level1/Level2/Level3');
    });

    it('should handle empty tree', () => {
      const flat = flattenBookmarkTree([]);
      expect(flat).toEqual([]);
    });

    it('should handle folders with no children', () => {
      const tree = [
        {
          id: 'root',
          children: [
            {
              id: 'folder1',
              title: 'Empty Folder',
              children: [],
            },
          ],
        },
      ];

      const flat = flattenBookmarkTree(tree);

      // Empty folder should not be included since it's at root level
      expect(flat).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Edge Cases and Race Conditions
  // ==========================================================================
  describe('Edge Cases and Race Conditions', () => {
    describe('Concurrent sync protection', () => {
      it('should identify when sync is already in progress', () => {
        let isSyncInProgress = false;

        const startSync = () => {
          if (isSyncInProgress) {
            return { success: false, error: 'Sync already in progress' };
          }
          isSyncInProgress = true;
          return { success: true };
        };

        expect(startSync().success).toBe(true);
        expect(startSync().success).toBe(false);
        expect(startSync().error).toBe('Sync already in progress');
      });
    });

    describe('URL edge cases', () => {
      it('should treat URLs with different protocols as different', () => {
        const cloudBookmarks = [{ url: 'https://example.com', title: 'HTTPS', folderPath: 'Work' }];
        const localBookmarks = [{ url: 'http://example.com', title: 'HTTP', folderPath: 'Work' }];
        const tombstones = [];

        const { toAdd } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones);

        expect(toAdd).toHaveLength(1);
        expect(toAdd[0].url).toBe('https://example.com');
      });

      it('should treat URLs with different trailing slashes as different', () => {
        const cloudBookmarks = [
          { url: 'https://example.com/', title: 'With Slash', folderPath: 'Work' },
        ];
        const localBookmarks = [
          { url: 'https://example.com', title: 'Without Slash', folderPath: 'Work' },
        ];
        const tombstones = [];

        const { toAdd } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones);

        expect(toAdd).toHaveLength(1);
      });

      it('should handle special characters in URLs', () => {
        const items = [
          {
            url: 'https://example.com/path?query=value&other=123#hash',
            title: 'Complex',
            folderPath: 'Work',
            index: 0,
          },
          {
            url: 'https://example.com/path with spaces',
            title: 'Spaces',
            folderPath: 'Work',
            index: 1,
          },
        ];

        const normalized = normalizeItemsForChecksum(items);

        expect(normalized).toHaveLength(2);
        expect(normalized[0].url).toContain('?query=value');
      });
    });

    describe('Unicode and special characters', () => {
      it('should handle Unicode in titles', () => {
        const items = [
          { url: 'https://a.com', title: '日本語タイトル', folderPath: 'Work', index: 0 },
          { url: 'https://b.com', title: 'Émoji 🎉', folderPath: 'Work', index: 1 },
        ];

        const normalized = normalizeItemsForChecksum(items);

        expect(normalized[0].title).toBe('日本語タイトル');
        expect(normalized[1].title).toBe('Émoji 🎉');
      });

      it('should handle Unicode in folder paths', () => {
        const path = 'Bookmarks Bar/日本語フォルダ/サブフォルダ';
        const normalized = normalizeFolderPath(path);

        expect(normalized).toBe('toolbar/日本語フォルダ/サブフォルダ');
      });
    });

    describe('Large data sets', () => {
      it('should handle large number of bookmarks efficiently', () => {
        const cloudBookmarks = Array.from({ length: 1000 }, (_, i) => ({
          url: `https://site${i}.com`,
          title: `Site ${i}`,
          folderPath: `Folder${i % 10}`,
          index: i % 100,
        }));
        const localBookmarks = Array.from({ length: 500 }, (_, i) => ({
          url: `https://site${i}.com`,
          title: `Local Site ${i}`,
          folderPath: `Folder${i % 10}`,
          index: i % 100,
        }));
        const tombstones = [];

        const start = Date.now();
        const { toAdd, toUpdate } = categorizeCloudBookmarks(
          cloudBookmarks,
          localBookmarks,
          tombstones
        );
        const duration = Date.now() - start;

        expect(toAdd).toHaveLength(500); // 1000 - 500 existing
        expect(toUpdate.length).toBeGreaterThan(0); // Some will need updates
        expect(duration).toBeLessThan(1000); // Should be fast
      });

      it('should handle large number of tombstones', () => {
        const tombstones = Array.from({ length: 1000 }, (_, i) => ({
          url: `https://deleted${i}.com`,
          deletedAt: 1000 + i,
        }));

        const merged = mergeTombstones(tombstones, tombstones);

        expect(merged).toHaveLength(1000);
      });
    });

    describe('Boundary conditions', () => {
      it('should handle bookmarks at index 0', () => {
        const items = [{ url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 }];

        const normalized = normalizeItemsForChecksum(items);

        expect(normalized[0].index).toBe(0);
      });

      it('should handle very large index values', () => {
        const items = [{ url: 'https://a.com', title: 'A', folderPath: 'Work', index: 999999 }];

        const normalized = normalizeItemsForChecksum(items);

        expect(normalized[0].index).toBe(999999);
      });

      it('should handle timestamp at epoch (0)', () => {
        const cloudBookmarks = [
          { url: 'https://old.com', title: 'Old', folderPath: 'Work', dateAdded: 0 },
        ];
        const tombstones = [{ url: 'https://old.com', deletedAt: 0 }];

        const { toAdd } = categorizeCloudBookmarks(cloudBookmarks, [], tombstones);

        // dateAdded (0) is NOT > deletedAt (0)
        expect(toAdd).toHaveLength(0);
      });

      it('should handle very long titles', () => {
        const longTitle = 'A'.repeat(10000);
        const items = [{ url: 'https://a.com', title: longTitle, folderPath: 'Work', index: 0 }];

        const normalized = normalizeItemsForChecksum(items);

        expect(normalized[0].title.length).toBe(10000);
      });

      it('should handle very long folder paths', () => {
        const longPath =
          'Bookmarks Bar/' + Array.from({ length: 50 }, (_, i) => `Folder${i}`).join('/');
        const normalized = normalizeFolderPath(longPath);

        expect(normalized.startsWith('toolbar/')).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Cross-Browser Sync Scenarios
  // ==========================================================================
  describe('Cross-Browser Sync Scenarios', () => {
    describe('Firefox to Chrome sync', () => {
      it('should correctly match Firefox and Chrome folder paths', () => {
        const firefoxPath = 'Bookmarks Toolbar/Work/Projects';
        const chromePath = 'Bookmarks Bar/Work/Projects';

        expect(normalizeFolderPath(firefoxPath)).toBe(normalizeFolderPath(chromePath));
      });

      it('should detect folder changes despite root name differences', () => {
        const cloud = {
          url: 'https://a.com',
          title: 'A',
          folderPath: 'Bookmarks Toolbar/Personal',
          index: 0,
        };
        const local = {
          url: 'https://a.com',
          title: 'A',
          folderPath: 'Bookmarks Bar/Work',
          index: 0,
        };

        expect(bookmarkNeedsUpdate(cloud, local)).toBe(true);
      });
    });

    describe('Opera to Firefox sync (menu folder mapping)', () => {
      it('should handle Firefox menu path', () => {
        const firefoxMenu = 'Bookmarks Menu/Reading List';
        expect(normalizeFolderPath(firefoxMenu)).toBe('menu/Reading List');
      });

      it('should identify bookmarks from menu folder correctly', () => {
        const menuBookmarks = [
          { url: 'https://article.com', title: 'Article', folderPath: 'Bookmarks Menu/Reading' },
        ];

        const normalized = normalizeItemsForChecksum(menuBookmarks);

        expect(normalized[0].folderPath).toBe('Bookmarks Menu/Reading');
      });
    });

    describe('Sync after force push from another browser', () => {
      it('should categorize all cloud bookmarks as updates when local differs', () => {
        const cloudBookmarks = [
          {
            url: 'https://a.com',
            title: 'Firefox Title',
            folderPath: 'toolbar/Work',
            dateAdded: 2000,
          },
        ];
        const localBookmarks = [
          {
            url: 'https://a.com',
            title: 'Chrome Title',
            folderPath: 'Bookmarks Bar/Old',
            dateAdded: 1000,
          },
        ];

        const { toUpdate } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, []);

        expect(toUpdate).toHaveLength(1);
        expect(toUpdate[0].cloud.title).toBe('Firefox Title');
      });

      it('should identify truly new local bookmarks to push', () => {
        const cloudBookmarks = [
          { url: 'https://cloud-only.com', title: 'Cloud Only', folderPath: 'Work' },
        ];
        const localBookmarks = [
          { url: 'https://cloud-only.com', title: 'Cloud Only', folderPath: 'Work' },
          { url: 'https://local-only.com', title: 'Local Only', folderPath: 'Work' },
        ];

        const cloudUrls = new Set(cloudBookmarks.map((b) => b.url));
        const localAdditions = localBookmarks.filter((b) => !cloudUrls.has(b.url));

        expect(localAdditions).toHaveLength(1);
        expect(localAdditions[0].url).toBe('https://local-only.com');
      });
    });
  });

  // ==========================================================================
  // Tombstone Edge Cases
  // ==========================================================================
  describe('Tombstone Edge Cases', () => {
    it('should handle rapid delete and re-add', () => {
      // Scenario: User deletes bookmark, tombstone created, then user re-adds same URL
      const cloudBookmarks = [
        { url: 'https://readded.com', title: 'Re-added', folderPath: 'Work', dateAdded: 3000 },
      ];
      const tombstones = [{ url: 'https://readded.com', deletedAt: 2000 }];
      const localBookmarks = [];

      const { toAdd } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones);

      expect(toAdd).toHaveLength(1); // Should add because bookmark is newer
    });

    it('should handle tombstone for URL that was never synced locally', () => {
      const cloudTombstones = [{ url: 'https://never-synced.com', deletedAt: 1000 }];
      const localTombstones = [];
      const lastSyncTime = 500;

      const filtered = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(filtered).toHaveLength(1); // Created after last sync
    });

    it('should handle cleared local storage scenario', () => {
      // Scenario: User cleared extension storage, local tombstones are gone
      // Cloud has old tombstones that shouldn't be applied
      const cloudTombstones = [{ url: 'https://old-delete.com', deletedAt: 500 }];
      const localTombstones = []; // Cleared
      const lastSyncTime = 1000; // Last sync was after tombstone creation

      const filtered = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(filtered).toHaveLength(0); // Stale tombstone should be filtered out
    });

    it('should merge tombstones from multiple sync operations', () => {
      const session1 = [{ url: 'https://a.com', deletedAt: 1000 }];
      const session2 = [{ url: 'https://b.com', deletedAt: 2000 }];
      const session3 = [{ url: 'https://a.com', deletedAt: 3000 }]; // Later delete of same URL

      let merged = mergeTombstones(session1, session2);
      merged = mergeTombstones(merged, session3);

      expect(merged).toHaveLength(2);
      expect(merged.find((t) => t.url === 'https://a.com').deletedAt).toBe(3000);
    });
  });

  // ==========================================================================
  // Checksum Stability Tests
  // ==========================================================================
  describe('Checksum Stability', () => {
    it('should produce same normalized output regardless of input order', () => {
      const items1 = [
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 1 },
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 },
      ];
      const items2 = [
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 1 },
      ];

      const normalized1 = normalizeItemsForChecksum(items1);
      const normalized2 = normalizeItemsForChecksum(items2);

      expect(JSON.stringify(normalized1)).toBe(JSON.stringify(normalized2));
    });

    it('should produce consistent output for same data', () => {
      const items = [{ url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 }];

      const run1 = normalizeItemsForChecksum(items);
      const run2 = normalizeItemsForChecksum(items);
      const run3 = normalizeItemsForChecksum(items);

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
      expect(JSON.stringify(run2)).toBe(JSON.stringify(run3));
    });

    it('should detect changes in any field', () => {
      const base = { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 };

      const variants = [
        { ...base, url: 'https://b.com' },
        { ...base, title: 'B' },
        { ...base, folderPath: 'Personal' },
        { ...base, index: 1 },
      ];

      const baseNorm = JSON.stringify(normalizeItemsForChecksum([base]));

      for (const variant of variants) {
        const variantNorm = JSON.stringify(normalizeItemsForChecksum([variant]));
        expect(variantNorm).not.toBe(baseNorm);
      }
    });
  });

  // ==========================================================================
  // Ordering Preservation Tests
  // ==========================================================================
  describe('Ordering Preservation', () => {
    it('should preserve bookmark order within same folder', () => {
      const items = [
        { url: 'https://c.com', title: 'C', folderPath: 'Work', index: 2 },
        { url: 'https://a.com', title: 'A', folderPath: 'Work', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Work', index: 1 },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].url).toBe('https://a.com');
      expect(normalized[1].url).toBe('https://b.com');
      expect(normalized[2].url).toBe('https://c.com');
    });

    it('should sort folders before applying index sort', () => {
      const items = [
        { url: 'https://b.com', title: 'B', folderPath: 'Z-Folder', index: 0 },
        { url: 'https://a.com', title: 'A', folderPath: 'A-Folder', index: 0 },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].folderPath).toBe('A-Folder');
      expect(normalized[1].folderPath).toBe('Z-Folder');
    });

    it('should handle interleaved folders and bookmarks', () => {
      const items = [
        { type: 'folder', title: 'Folder A', folderPath: 'Root', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Root', index: 1 },
        { type: 'folder', title: 'Folder C', folderPath: 'Root', index: 2 },
      ];

      const normalized = normalizeItemsForChecksum(items);

      expect(normalized[0].index).toBe(0);
      expect(normalized[0].type).toBe('folder');
      expect(normalized[1].index).toBe(1);
      expect(normalized[1].type).toBe('bookmark');
      expect(normalized[2].index).toBe(2);
      expect(normalized[2].type).toBe('folder');
    });
  });
});
