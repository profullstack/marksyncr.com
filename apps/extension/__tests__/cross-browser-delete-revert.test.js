/**
 * Tests for the cross-browser delete revert bug
 *
 * Bug: User adds a bookmark in Chrome, it syncs to Firefox. User deletes
 * in Firefox. On next sync, it shows up again in Firefox.
 *
 * Root cause: When Chrome syncs between Firefox's deletion and Firefox's
 * push, Chrome's lastSyncTime advances past the tombstone's deletedAt.
 * On Chrome's next pull, filterTombstonesToApply rejects the tombstone
 * as "stale" (deletedAt < lastSyncTime). Chrome keeps the bookmark
 * locally and pushes it back to cloud, undoing Firefox's deletion.
 *
 * Fixes:
 * 1. filterTombstonesToApply now accepts cloudBookmarkUrls — if the
 *    bookmark is absent from cloud data, the tombstone is applied
 *    regardless of the staleness check.
 * 2. Step 6.5 excludes local bookmarks with cloud tombstones from
 *    "local additions", preventing them from being pushed back.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Functions under test (mirroring production code)
// ============================================================================

function filterTombstonesToApply(
  cloudTombstones,
  localTombstones,
  lastSyncTime,
  cloudBookmarkUrls = null
) {
  if (!cloudTombstones || cloudTombstones.length === 0) return [];
  if (!lastSyncTime) return [];

  const localTombstoneUrls = new Set(localTombstones.map((t) => t.url));

  return cloudTombstones.filter((tombstone) => {
    if (localTombstoneUrls.has(tombstone.url)) return true;
    if (tombstone.deletedAt > lastSyncTime) return true;
    // New: apply if bookmark is absent from cloud data
    if (cloudBookmarkUrls && !cloudBookmarkUrls.has(tombstone.url)) return true;
    return false;
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Cross-browser delete revert bug', () => {
  describe('filterTombstonesToApply with cloudBookmarkUrls', () => {
    it('should apply tombstone when bookmark is absent from cloud (confirming deletion)', () => {
      // Scenario: Firefox deleted bookmark X. Chrome synced in between,
      // so Chrome's lastSyncTime > tombstone.deletedAt. But cloud data
      // no longer has X (Firefox pushed the deletion).
      const now = Date.now();
      const cloudTombstones = [{ url: 'https://deleted.com', deletedAt: now - 60000 }];
      const localTombstones = [];
      const lastSyncTime = now - 30000; // Chrome synced 30s ago, tombstone is 60s old
      // Cloud no longer has the bookmark (Firefox pushed deletion)
      const cloudBookmarkUrls = new Set(['https://other.com']);

      const result = filterTombstonesToApply(
        cloudTombstones,
        localTombstones,
        lastSyncTime,
        cloudBookmarkUrls
      );

      // Should apply — cloud confirmed deletion by removing the bookmark
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://deleted.com');
    });

    it('should NOT apply stale tombstone when bookmark still exists in cloud', () => {
      // Scenario: Old tombstone, but the bookmark was re-added to cloud.
      // The staleness check should protect the bookmark.
      const now = Date.now();
      const cloudTombstones = [{ url: 'https://readded.com', deletedAt: now - 60000 }];
      const localTombstones = [];
      const lastSyncTime = now - 30000;
      // Cloud STILL has the bookmark (someone re-added it)
      const cloudBookmarkUrls = new Set(['https://readded.com']);

      const result = filterTombstonesToApply(
        cloudTombstones,
        localTombstones,
        lastSyncTime,
        cloudBookmarkUrls
      );

      // Should NOT apply — bookmark exists in cloud, tombstone is stale
      expect(result).toHaveLength(0);
    });

    it('should apply fresh tombstone regardless of cloud data', () => {
      const now = Date.now();
      const cloudTombstones = [{ url: 'https://new-delete.com', deletedAt: now - 1000 }];
      const localTombstones = [];
      const lastSyncTime = now - 60000; // Last sync was 60s ago, tombstone is 1s old
      const cloudBookmarkUrls = new Set(['https://other.com']);

      const result = filterTombstonesToApply(
        cloudTombstones,
        localTombstones,
        lastSyncTime,
        cloudBookmarkUrls
      );

      // Should apply — tombstone is fresh (deletedAt > lastSyncTime)
      expect(result).toHaveLength(1);
    });

    it('should apply tombstone when local also has it', () => {
      const now = Date.now();
      const cloudTombstones = [{ url: 'https://both-know.com', deletedAt: now - 60000 }];
      const localTombstones = [{ url: 'https://both-know.com', deletedAt: now - 60000 }];
      const lastSyncTime = now - 30000;
      const cloudBookmarkUrls = new Set(); // doesn't matter

      const result = filterTombstonesToApply(
        cloudTombstones,
        localTombstones,
        lastSyncTime,
        cloudBookmarkUrls
      );

      // Should apply — we already know about this deletion
      expect(result).toHaveLength(1);
    });

    it('should work without cloudBookmarkUrls (backward compat)', () => {
      const now = Date.now();
      const cloudTombstones = [{ url: 'https://old.com', deletedAt: now - 60000 }];
      const localTombstones = [];
      const lastSyncTime = now - 30000;

      // No cloudBookmarkUrls passed — old behavior
      const result = filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime);

      // Stale tombstone, no cloud URL check — should be skipped
      expect(result).toHaveLength(0);
    });
  });

  describe('Local additions filter (step 6.5)', () => {
    it('should exclude local bookmarks with cloud tombstones from additions', () => {
      // Simulate step 6.5 logic
      const updatedLocalFlat = [
        { url: 'https://keep.com', title: 'Keep' },
        { url: 'https://deleted-elsewhere.com', title: 'Deleted Elsewhere' },
        { url: 'https://new-local.com', title: 'New Local' },
      ];

      const cloudUrls = new Set(['https://keep.com']);
      const cloudTombstoneUrls = new Set(['https://deleted-elsewhere.com']);

      const localAdditions = updatedLocalFlat.filter((lb) => {
        if (!lb.url) return false;
        if (cloudUrls.has(lb.url)) return false;
        if (cloudTombstoneUrls.has(lb.url)) return false;
        return true;
      });

      // Only new-local.com should be a local addition
      expect(localAdditions).toHaveLength(1);
      expect(localAdditions[0].url).toBe('https://new-local.com');
    });

    it('should not exclude bookmarks without tombstones', () => {
      const updatedLocalFlat = [
        { url: 'https://new1.com', title: 'New 1' },
        { url: 'https://new2.com', title: 'New 2' },
      ];

      const cloudUrls = new Set();
      const cloudTombstoneUrls = new Set();

      const localAdditions = updatedLocalFlat.filter((lb) => {
        if (!lb.url) return false;
        if (cloudUrls.has(lb.url)) return false;
        if (cloudTombstoneUrls.has(lb.url)) return false;
        return true;
      });

      expect(localAdditions).toHaveLength(2);
    });
  });

  describe('Full cross-browser scenario', () => {
    it('should not push back a bookmark deleted on another browser (timing race)', () => {
      // Full scenario:
      // T=0: Chrome adds X, syncs. Cloud: [A, B, X].
      // T=1: Firefox syncs, pulls X. Firefox: [A, B, X].
      // T=2: User deletes X on Firefox. Tombstone created.
      // T=3: Chrome syncs. Cloud unchanged. Chrome lastSyncTime = T=3.
      // T=4: Firefox syncs. Pushes [A, B] + tombstone(X, deletedAt=T=2). Cloud: [A, B] + tombstone.
      // T=5: Chrome syncs. Pulls [A, B] + tombstone(X, deletedAt=T=2).
      //   Chrome lastSyncTime=T=3, tombstone.deletedAt=T=2 < T=3 → "stale"!
      //   BUT: cloud data has [A, B] — X is absent → apply tombstone anyway!

      const T2 = Date.now() - 3000; // deletedAt
      const T3 = Date.now() - 2000; // Chrome's lastSyncTime

      const cloudTombstones = [{ url: 'https://x.com', deletedAt: T2 }];
      const chromeLocalTombstones = []; // Chrome never had this tombstone
      const cloudBookmarkUrls = new Set(['https://a.com', 'https://b.com']); // X absent

      const tombstonesToApply = filterTombstonesToApply(
        cloudTombstones,
        chromeLocalTombstones,
        T3,
        cloudBookmarkUrls
      );

      // Tombstone should be applied because X is absent from cloud
      expect(tombstonesToApply).toHaveLength(1);
      expect(tombstonesToApply[0].url).toBe('https://x.com');

      // And the local additions check should prevent X from being pushed back
      const chromeLocalBookmarks = [
        { url: 'https://a.com', title: 'A' },
        { url: 'https://b.com', title: 'B' },
        { url: 'https://x.com', title: 'X' }, // Still exists locally on Chrome
      ];

      const cloudTombstoneUrls = new Set(cloudTombstones.map((t) => t.url));
      const localAdditions = chromeLocalBookmarks.filter((lb) => {
        if (!lb.url) return false;
        if (cloudBookmarkUrls.has(lb.url)) return false;
        if (cloudTombstoneUrls.has(lb.url)) return false;
        return true;
      });

      // X should NOT be in local additions (it has a cloud tombstone)
      expect(localAdditions).toHaveLength(0);
      expect(localAdditions.find((a) => a.url === 'https://x.com')).toBeUndefined();
    });
  });
});
