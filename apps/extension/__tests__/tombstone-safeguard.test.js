/**
 * Tests for tombstone safeguard
 *
 * The tombstone safeguard prevents unintended bookmark deletions when:
 * 1. Local tombstones are cleared (e.g., user clears extension storage)
 * 2. Cloud has tombstones from previous syncs
 * 3. Without safeguard, cloud tombstones would delete local bookmarks
 *
 * The safeguard only applies cloud tombstones that are newer than the last sync time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock browser API
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  bookmarks: {
    remove: vi.fn(),
  },
};

// Mock the browser global
vi.stubGlobal('browser', mockBrowser);

/**
 * Filter cloud tombstones to only include those that should be applied
 *
 * A tombstone should be applied if:
 * 1. It was created AFTER the last sync time (new deletion from another browser)
 * 2. OR there's a matching local tombstone (we already know about this deletion)
 *
 * A tombstone should NOT be applied if:
 * 1. It was created BEFORE the last sync time AND we have no local tombstone for it
 *    (This means we cleared local storage and the tombstone is stale)
 *
 * @param {Array<{url: string, deletedAt: number}>} cloudTombstones - Tombstones from cloud
 * @param {Array<{url: string, deletedAt: number}>} localTombstones - Local tombstones
 * @param {number|null} lastSyncTime - Timestamp of last successful sync (null if never synced)
 * @returns {Array<{url: string, deletedAt: number}>} - Filtered tombstones to apply
 */
function filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime) {
  if (!cloudTombstones || cloudTombstones.length === 0) {
    return [];
  }

  // If we've never synced before, don't apply any cloud tombstones
  // This is a fresh install, so we shouldn't delete anything
  if (!lastSyncTime) {
    console.log('[MarkSyncr] First sync - not applying cloud tombstones');
    return [];
  }

  // Create a set of local tombstone URLs for quick lookup
  const localTombstoneUrls = new Set(localTombstones.map((t) => t.url));

  // Filter cloud tombstones
  return cloudTombstones.filter((tombstone) => {
    // If we have a local tombstone for this URL, we already know about this deletion
    if (localTombstoneUrls.has(tombstone.url)) {
      return true;
    }

    // If the tombstone was created AFTER our last sync, it's a new deletion
    // from another browser that we should apply
    if (tombstone.deletedAt > lastSyncTime) {
      return true;
    }

    // Otherwise, this is a stale tombstone from before our last sync
    // We don't have a local tombstone for it, which means either:
    // 1. We cleared local storage (lost our tombstones)
    // 2. The bookmark was re-added after the tombstone was created
    // In either case, we should NOT delete the local bookmark
    console.log(
      `[MarkSyncr] Skipping stale tombstone: ${tombstone.url} (deletedAt: ${tombstone.deletedAt}, lastSync: ${lastSyncTime})`
    );
    return false;
  });
}

describe('Tombstone Safeguard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('filterTombstonesToApply', () => {
    it('should return empty array when cloud tombstones is empty', () => {
      const result = filterTombstonesToApply([], [], Date.now());
      expect(result).toEqual([]);
    });

    it('should return empty array when cloud tombstones is null', () => {
      const result = filterTombstonesToApply(null, [], Date.now());
      expect(result).toEqual([]);
    });

    it('should not apply any tombstones on first sync (lastSyncTime is null)', () => {
      const cloudTombstones = [
        { url: 'https://example.com', deletedAt: Date.now() - 1000 },
        { url: 'https://test.com', deletedAt: Date.now() - 2000 },
      ];

      const result = filterTombstonesToApply(cloudTombstones, [], null);
      expect(result).toEqual([]);
    });

    it('should apply tombstones that exist in local tombstones', () => {
      const now = Date.now();
      const lastSyncTime = now - 10000; // 10 seconds ago

      const cloudTombstones = [
        { url: 'https://example.com', deletedAt: now - 5000 }, // Before last sync but in local
        { url: 'https://test.com', deletedAt: now - 15000 }, // Before last sync, not in local
      ];

      const localTombstones = [{ url: 'https://example.com', deletedAt: now - 5000 }];

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com');
    });

    it('should apply tombstones created after last sync time', () => {
      const now = Date.now();
      const lastSyncTime = now - 10000; // 10 seconds ago

      const cloudTombstones = [
        { url: 'https://new-deletion.com', deletedAt: now - 5000 }, // After last sync
        { url: 'https://old-deletion.com', deletedAt: now - 15000 }, // Before last sync
      ];

      const localTombstones = []; // No local tombstones (cleared storage)

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://new-deletion.com');
    });

    it('should not apply stale tombstones when local storage was cleared', () => {
      const now = Date.now();
      const lastSyncTime = now - 10000; // 10 seconds ago

      // All tombstones are from before the last sync
      const cloudTombstones = [
        { url: 'https://old1.com', deletedAt: now - 20000 },
        { url: 'https://old2.com', deletedAt: now - 30000 },
        { url: 'https://old3.com', deletedAt: now - 40000 },
      ];

      const localTombstones = []; // Cleared storage - no local tombstones

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      // None should be applied because they're all stale
      expect(result).toEqual([]);
    });

    it('should handle mixed scenario correctly', () => {
      const now = Date.now();
      const lastSyncTime = now - 10000; // 10 seconds ago

      const cloudTombstones = [
        { url: 'https://known-deletion.com', deletedAt: now - 20000 }, // Old but in local
        { url: 'https://new-deletion.com', deletedAt: now - 5000 }, // New (after last sync)
        { url: 'https://stale-deletion.com', deletedAt: now - 30000 }, // Old and not in local
      ];

      const localTombstones = [{ url: 'https://known-deletion.com', deletedAt: now - 20000 }];

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.url).sort()).toEqual([
        'https://known-deletion.com',
        'https://new-deletion.com',
      ]);
    });

    it('should apply all tombstones when local tombstones match cloud', () => {
      const now = Date.now();
      const lastSyncTime = now - 10000;

      const cloudTombstones = [
        { url: 'https://a.com', deletedAt: now - 20000 },
        { url: 'https://b.com', deletedAt: now - 30000 },
      ];

      // Local has all the same tombstones (normal sync scenario)
      const localTombstones = [
        { url: 'https://a.com', deletedAt: now - 20000 },
        { url: 'https://b.com', deletedAt: now - 30000 },
      ];

      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      expect(result).toHaveLength(2);
    });
  });
});

// Export for use in background script
export { filterTombstonesToApply };
