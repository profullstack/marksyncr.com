/**
 * Tests for locally modified bookmark ID persistence and protection
 *
 * These tests cover three critical sync fixes:
 * 1. locallyModifiedBookmarkIds is persisted to browser.storage.local
 *    so it survives MV3 service worker restarts
 * 2. applyTombstonesToLocal skips bookmarks that are in locallyModifiedBookmarkIds
 *    (protects re-added bookmarks from cloud tombstone deletion)
 * 3. categorizeCloudBookmarks skips cloud→local updates for locally modified bookmarks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Storage key constant (must match background/index.js)
const LOCALLY_MODIFIED_IDS_KEY = 'marksyncr-locally-modified-ids';

// ============================================================================
// Functions under test (copied from background/index.js to test in isolation)
// ============================================================================

/**
 * Load persisted locally modified bookmark IDs from storage
 */
async function loadLocallyModifiedIds(mockStorage) {
  const data = await mockStorage.get(LOCALLY_MODIFIED_IDS_KEY);
  const ids = data[LOCALLY_MODIFIED_IDS_KEY] || [];
  return new Set(ids);
}

/**
 * Save locally modified bookmark IDs to storage
 */
async function saveLocallyModifiedIds(locallyModifiedBookmarkIds, mockStorage) {
  await mockStorage.set({
    [LOCALLY_MODIFIED_IDS_KEY]: Array.from(locallyModifiedBookmarkIds),
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
    .replace(/^Other Bookmarks\/?/i, 'other/')
    .replace(/^Unsorted Bookmarks\/?/i, 'other/')
    .replace(/^Bookmarks Menu\/?/i, 'menu/')
    .replace(/\/$/, '');
}

/**
 * Check if a bookmark needs updating from cloud
 */
function bookmarkNeedsUpdate(cloudBm, localBm) {
  if ((cloudBm.title ?? '') !== (localBm.title ?? '')) return true;
  const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
  const localFolder = normalizeFolderPath(localBm.folderPath);
  if (cloudFolder !== localFolder) return true;
  if (
    cloudBm.index !== undefined &&
    localBm.index !== undefined &&
    cloudBm.index !== localBm.index
  )
    return true;
  return false;
}

/**
 * Categorize cloud bookmarks into those to add vs update (with locallyModified protection)
 */
function categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones, modifiedLocalIds) {
  const localByUrl = new Map(localBookmarks.filter((b) => b.url).map((b) => [b.url, b]));

  const toAdd = [];
  const toUpdate = [];
  const skippedByTombstone = [];
  const skippedByLocalModification = [];

  for (const cloudBm of cloudBookmarks) {
    if (!cloudBm.url) continue;

    const tombstone = tombstones.find((t) => t.url === cloudBm.url);
    if (tombstone) {
      const rawDate = cloudBm.dateAdded;
      const bookmarkDate =
        typeof rawDate === 'string' ? new Date(rawDate).getTime() : rawDate || 0;
      const tombstoneDate = tombstone.deletedAt || 0;
      if (isNaN(bookmarkDate) || bookmarkDate <= tombstoneDate) {
        skippedByTombstone.push(cloudBm);
        continue;
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (modifiedLocalIds?.has(localBm.id)) {
      skippedByLocalModification.push(cloudBm.url);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      toUpdate.push({ cloud: cloudBm, local: localBm });
    }
  }

  return { toAdd, toUpdate, skippedByTombstone, skippedByLocalModification };
}

/**
 * Apply tombstones to local bookmarks, respecting locally modified bookmarks
 */
function applyTombstonesToLocal(tombstones, localBookmarks, locallyModifiedBookmarkIds) {
  const tombstonedUrls = new Set(tombstones.map((t) => t.url));
  const toDelete = [];
  const skippedByLocalModification = [];

  for (const bookmark of localBookmarks) {
    if (tombstonedUrls.has(bookmark.url)) {
      if (locallyModifiedBookmarkIds.has(bookmark.id)) {
        skippedByLocalModification.push(bookmark);
        continue;
      }
      toDelete.push(bookmark);
    }
  }

  return { toDelete, skippedByLocalModification };
}

// ============================================================================
// Tests
// ============================================================================

describe('Locally Modified Bookmark ID Persistence', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };
  });

  describe('loadLocallyModifiedIds', () => {
    it('should return empty Set when storage has no data', async () => {
      mockStorage.get.mockResolvedValue({});

      const result = await loadLocallyModifiedIds(mockStorage);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
      expect(mockStorage.get).toHaveBeenCalledWith(LOCALLY_MODIFIED_IDS_KEY);
    });

    it('should restore IDs from storage', async () => {
      mockStorage.get.mockResolvedValue({
        [LOCALLY_MODIFIED_IDS_KEY]: ['id-1', 'id-2', 'id-3'],
      });

      const result = await loadLocallyModifiedIds(mockStorage);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(3);
      expect(result.has('id-1')).toBe(true);
      expect(result.has('id-2')).toBe(true);
      expect(result.has('id-3')).toBe(true);
    });

    it('should handle null/undefined storage value gracefully', async () => {
      mockStorage.get.mockResolvedValue({ [LOCALLY_MODIFIED_IDS_KEY]: null });

      const result = await loadLocallyModifiedIds(mockStorage);

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });

  describe('saveLocallyModifiedIds', () => {
    it('should persist IDs to storage', async () => {
      const ids = new Set(['id-1', 'id-2']);
      mockStorage.set.mockResolvedValue(undefined);

      await saveLocallyModifiedIds(ids, mockStorage);

      expect(mockStorage.set).toHaveBeenCalledTimes(1);
      const savedData = mockStorage.set.mock.calls[0][0];
      expect(savedData[LOCALLY_MODIFIED_IDS_KEY]).toEqual(expect.arrayContaining(['id-1', 'id-2']));
      expect(savedData[LOCALLY_MODIFIED_IDS_KEY]).toHaveLength(2);
    });

    it('should persist empty set', async () => {
      const ids = new Set();
      mockStorage.set.mockResolvedValue(undefined);

      await saveLocallyModifiedIds(ids, mockStorage);

      expect(mockStorage.set).toHaveBeenCalledWith({
        [LOCALLY_MODIFIED_IDS_KEY]: [],
      });
    });
  });

  describe('round-trip persistence', () => {
    it('should survive save → load cycle (simulates service worker restart)', async () => {
      // Simulate: user adds bookmarks → IDs saved → service worker restarts → IDs loaded
      const originalIds = new Set(['bm-100', 'bm-200', 'bm-300']);

      // Save
      let savedData = {};
      mockStorage.set.mockImplementation((data) => {
        savedData = { ...savedData, ...data };
      });
      await saveLocallyModifiedIds(originalIds, mockStorage);

      // Simulate restart: load from what was saved
      mockStorage.get.mockImplementation((key) => Promise.resolve(savedData));
      const restoredIds = await loadLocallyModifiedIds(mockStorage);

      expect(restoredIds.size).toBe(3);
      expect(restoredIds.has('bm-100')).toBe(true);
      expect(restoredIds.has('bm-200')).toBe(true);
      expect(restoredIds.has('bm-300')).toBe(true);
    });
  });
});

describe('Tombstone Protection for Locally Modified Bookmarks', () => {
  it('should delete bookmarks matching tombstones when not locally modified', () => {
    const tombstones = [
      { url: 'https://deleted.com', deletedAt: Date.now() },
      { url: 'https://also-deleted.com', deletedAt: Date.now() },
    ];

    const localBookmarks = [
      { id: 'bm-1', url: 'https://deleted.com', title: 'Deleted' },
      { id: 'bm-2', url: 'https://also-deleted.com', title: 'Also Deleted' },
      { id: 'bm-3', url: 'https://kept.com', title: 'Kept' },
    ];

    const locallyModifiedIds = new Set(); // nothing locally modified

    const { toDelete, skippedByLocalModification } = applyTombstonesToLocal(
      tombstones,
      localBookmarks,
      locallyModifiedIds
    );

    expect(toDelete).toHaveLength(2);
    expect(toDelete.map((b) => b.url)).toEqual(['https://deleted.com', 'https://also-deleted.com']);
    expect(skippedByLocalModification).toHaveLength(0);
  });

  it('should skip tombstone deletion for locally modified bookmarks', () => {
    const tombstones = [
      { url: 'https://re-added.com', deletedAt: Date.now() - 5000 },
      { url: 'https://deleted.com', deletedAt: Date.now() },
    ];

    const localBookmarks = [
      { id: 'bm-1', url: 'https://re-added.com', title: 'Re-added by user' },
      { id: 'bm-2', url: 'https://deleted.com', title: 'Should be deleted' },
    ];

    // bm-1 was locally modified (user re-added it)
    const locallyModifiedIds = new Set(['bm-1']);

    const { toDelete, skippedByLocalModification } = applyTombstonesToLocal(
      tombstones,
      localBookmarks,
      locallyModifiedIds
    );

    expect(toDelete).toHaveLength(1);
    expect(toDelete[0].url).toBe('https://deleted.com');
    expect(skippedByLocalModification).toHaveLength(1);
    expect(skippedByLocalModification[0].url).toBe('https://re-added.com');
  });

  it('should protect all locally modified bookmarks from tombstone deletion', () => {
    const tombstones = [
      { url: 'https://a.com', deletedAt: Date.now() },
      { url: 'https://b.com', deletedAt: Date.now() },
      { url: 'https://c.com', deletedAt: Date.now() },
    ];

    const localBookmarks = [
      { id: 'bm-a', url: 'https://a.com', title: 'A' },
      { id: 'bm-b', url: 'https://b.com', title: 'B' },
      { id: 'bm-c', url: 'https://c.com', title: 'C' },
    ];

    // All are locally modified
    const locallyModifiedIds = new Set(['bm-a', 'bm-b', 'bm-c']);

    const { toDelete, skippedByLocalModification } = applyTombstonesToLocal(
      tombstones,
      localBookmarks,
      locallyModifiedIds
    );

    expect(toDelete).toHaveLength(0);
    expect(skippedByLocalModification).toHaveLength(3);
  });

  it('should handle empty tombstones', () => {
    const localBookmarks = [{ id: 'bm-1', url: 'https://kept.com', title: 'Kept' }];
    const locallyModifiedIds = new Set(['bm-1']);

    const { toDelete, skippedByLocalModification } = applyTombstonesToLocal(
      [],
      localBookmarks,
      locallyModifiedIds
    );

    expect(toDelete).toHaveLength(0);
    expect(skippedByLocalModification).toHaveLength(0);
  });
});

describe('categorizeCloudBookmarks with locallyModifiedBookmarkIds', () => {
  it('should skip cloud→local updates for locally modified bookmarks', () => {
    const cloudBookmarks = [
      {
        url: 'https://example.com',
        title: 'Cloud Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
      {
        url: 'https://modified.com',
        title: 'Cloud Version',
        folderPath: 'Bookmarks Bar',
        index: 1,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-1',
        url: 'https://example.com',
        title: 'Cloud Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
      {
        id: 'bm-2',
        url: 'https://modified.com',
        title: 'Local Title',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      },
    ];

    // bm-2 was locally modified (user renamed and moved it)
    const modifiedLocalIds = new Set(['bm-2']);

    const { toAdd, toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    expect(toAdd).toHaveLength(0);
    expect(toUpdate).toHaveLength(0); // bm-2 would need update but is protected
    expect(skippedByLocalModification).toContain('https://modified.com');
  });

  it('should allow cloud→local updates when locallyModifiedBookmarkIds is empty', () => {
    const cloudBookmarks = [
      {
        url: 'https://modified.com',
        title: 'New Cloud Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-1',
        url: 'https://modified.com',
        title: 'Old Local Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    const modifiedLocalIds = new Set(); // empty — e.g., after service worker restart without persistence

    const { toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].cloud.title).toBe('New Cloud Title');
    expect(skippedByLocalModification).toHaveLength(0);
  });

  it('should still add new cloud bookmarks even when locally modified IDs exist', () => {
    const cloudBookmarks = [
      { url: 'https://new-from-cloud.com', title: 'New', folderPath: 'Bookmarks Bar', index: 0 },
    ];

    const localBookmarks = [
      { id: 'bm-1', url: 'https://existing.com', title: 'Existing', folderPath: 'Bookmarks Bar' },
    ];

    const modifiedLocalIds = new Set(['bm-1']);

    const { toAdd, toUpdate } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0].url).toBe('https://new-from-cloud.com');
    expect(toUpdate).toHaveLength(0);
  });

  it('should handle null/undefined modifiedLocalIds gracefully', () => {
    const cloudBookmarks = [
      {
        url: 'https://example.com',
        title: 'New Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-1',
        url: 'https://example.com',
        title: 'Old Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    // Pass null — simulates legacy call or edge case
    const { toUpdate } = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, [], null);

    expect(toUpdate).toHaveLength(1);
  });

  it('should protect locally modified bookmark from both update and tombstone', () => {
    // Cloud bookmark was added AFTER the tombstone was created, so it passes
    // the tombstone filter (dateAdded > deletedAt). But the local version was
    // modified by the user, so it should be protected by modifiedLocalIds.
    const now = Date.now();
    const cloudBookmarks = [
      {
        url: 'https://re-added.com',
        title: 'Cloud Version',
        folderPath: 'Bookmarks Bar',
        dateAdded: now, // newer than tombstone
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-1',
        url: 'https://re-added.com',
        title: 'User Re-added',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      },
    ];

    const tombstones = [{ url: 'https://re-added.com', deletedAt: now - 5000 }];
    const modifiedLocalIds = new Set(['bm-1']);
    const { toAdd, toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      tombstones,
      modifiedLocalIds
    );

    expect(toAdd).toHaveLength(0);
    expect(toUpdate).toHaveLength(0);
    expect(skippedByLocalModification).toContain('https://re-added.com');
  });
});

describe('Bookmark move: sibling index protection', () => {
  it('should protect all siblings from cloud index override when one bookmark is moved', () => {
    // Scenario: User has bookmarks A(0), B(1), C(2), D(3) in a folder.
    // User drags A to the end: B(0), C(1), D(2), A(3).
    // Only A fires onMoved, but B, C, D all shifted indices.
    // All siblings must be in locallyModifiedBookmarkIds to prevent cloud from
    // reverting B, C, D to their old positions.

    // Cloud still has OLD order
    const cloudBookmarks = [
      { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      { url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Bar', index: 2 },
      { url: 'https://d.com', title: 'D', folderPath: 'Bookmarks Bar', index: 3 },
    ];

    // Local has NEW order (user moved A to end)
    const localBookmarks = [
      { id: 'bm-b', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 0 },
      { id: 'bm-c', url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Bar', index: 1 },
      { id: 'bm-d', url: 'https://d.com', title: 'D', folderPath: 'Bookmarks Bar', index: 2 },
      { id: 'bm-a', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 3 },
    ];

    // With the fix: ALL siblings are tracked as locally modified (not just A)
    const modifiedLocalIds = new Set(['bm-a', 'bm-b', 'bm-c', 'bm-d']);

    const { toAdd, toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    // Nothing should be added or updated — all are protected
    expect(toAdd).toHaveLength(0);
    expect(toUpdate).toHaveLength(0);
    // All 4 bookmarks should be skipped because they are locally modified
    expect(skippedByLocalModification).toHaveLength(4);
  });

  it('should revert sibling order if only moved bookmark is tracked (demonstrates bug)', () => {
    // This test demonstrates what WOULD happen without the sibling tracking fix:
    // Only the explicitly moved bookmark is protected, siblings get overridden.

    const cloudBookmarks = [
      { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      { url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Bar', index: 2 },
    ];

    const localBookmarks = [
      { id: 'bm-b', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 0 },
      { id: 'bm-c', url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Bar', index: 1 },
      { id: 'bm-a', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 2 },
    ];

    // BUG scenario: only the moved bookmark (A) is tracked
    const modifiedLocalIds = new Set(['bm-a']);

    const { toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    // A is protected (correct)
    expect(skippedByLocalModification).toContain('https://a.com');

    // B and C would get overridden with cloud indices (the bug!)
    // B: cloud index 1 vs local index 0 → needs update
    // C: cloud index 2 vs local index 1 → needs update
    expect(toUpdate).toHaveLength(2);
    expect(toUpdate[0].cloud.url).toBe('https://b.com');
    expect(toUpdate[1].cloud.url).toBe('https://c.com');
  });

  it('should handle cross-folder move with siblings in both folders tracked', () => {
    // User moves bookmark from Folder1 to Folder2
    // Both source and destination folder siblings should be protected

    const cloudBookmarks = [
      { url: 'https://stay1.com', title: 'Stay1', folderPath: 'Bookmarks Bar/Folder1', index: 0 },
      { url: 'https://moved.com', title: 'Moved', folderPath: 'Bookmarks Bar/Folder1', index: 1 },
      { url: 'https://stay2.com', title: 'Stay2', folderPath: 'Bookmarks Bar/Folder2', index: 0 },
    ];

    const localBookmarks = [
      { id: 'bm-stay1', url: 'https://stay1.com', title: 'Stay1', folderPath: 'Bookmarks Bar/Folder1', index: 0 },
      { id: 'bm-stay2', url: 'https://stay2.com', title: 'Stay2', folderPath: 'Bookmarks Bar/Folder2', index: 0 },
      { id: 'bm-moved', url: 'https://moved.com', title: 'Moved', folderPath: 'Bookmarks Bar/Folder2', index: 1 },
    ];

    // All siblings in both folders are tracked
    const modifiedLocalIds = new Set(['bm-stay1', 'bm-stay2', 'bm-moved']);

    const { toAdd, toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    expect(toAdd).toHaveLength(0);
    expect(toUpdate).toHaveLength(0);
    expect(skippedByLocalModification).toHaveLength(3);
  });
});

describe('Sync scenario: service worker restart', () => {
  it('should preserve local changes across service worker restarts via persisted IDs', async () => {
    // Simulate: user adds/modifies bookmarks → service worker restarts → sync runs

    const mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Step 1: User modifies bookmarks, IDs are tracked and persisted
    const locallyModifiedIds = new Set(['bm-new', 'bm-moved']);
    await saveLocallyModifiedIds(locallyModifiedIds, mockStorage);

    // Step 2: Service worker restarts — load from storage
    const savedData = mockStorage.set.mock.calls[0][0];
    mockStorage.get.mockResolvedValue(savedData);
    const restoredIds = await loadLocallyModifiedIds(mockStorage);

    // Step 3: Sync runs — categorize cloud bookmarks should respect restored IDs
    const cloudBookmarks = [
      {
        url: 'https://moved.com',
        title: 'Cloud Location',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-moved',
        url: 'https://moved.com',
        title: 'Cloud Location',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      },
    ];

    const { toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      restoredIds
    );

    // The moved bookmark should be protected — local folder wins
    expect(toUpdate).toHaveLength(0);
    expect(skippedByLocalModification).toContain('https://moved.com');
  });
});
