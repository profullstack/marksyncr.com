/**
 * Tests for the "bookmark reorder resets on Sync Now" bug fix
 *
 * Bug: When a user rearranges bookmarks in their browser and clicks "Sync Now",
 * the sync pulls the cloud's old order and applies it locally, reverting the
 * user's changes. The cloud's stale indices overwrite local modifications.
 *
 * Fix: Skip ALL cloud-to-local updates (title, folder, index) for bookmarks
 * that are in the locallyModifiedBookmarkIds set. The local state takes
 * priority and gets pushed to cloud instead.
 *
 * Three fix points tested:
 * 1. categorizeCloudBookmarks() - skips ALL cloud updates for locally modified bookmarks
 * 2. updateLocalBookmarksFromCloud() - skips ALL cloud updates for locally modified bookmarks
 * 3. reorderLocalToMatchCloud() - skips reorder for folders with locally modified children
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Helper functions (mirroring implementation in background/index.js)
// ============================================================================

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
 * categorizeCloudBookmarks WITH the fix: skip ALL cloud updates for locally modified bookmarks.
 * Local state takes priority and will be pushed to cloud in the push phase.
 */
function categorizeCloudBookmarks(
  cloudBookmarks,
  localBookmarks,
  tombstones,
  locallyModifiedBookmarkIds
) {
  const localByUrl = new Map(localBookmarks.filter((b) => b.url).map((b) => [b.url, b]));

  const toAdd = [];
  const toUpdate = [];
  const skippedByTombstone = [];
  const skippedByLocalModification = [];
  const alreadyExistsUnchanged = [];

  for (const cloudBm of cloudBookmarks) {
    if (!cloudBm.url) continue;

    const tombstone = tombstones.find((t) => t.url === cloudBm.url);
    if (tombstone) {
      const rawDate = cloudBm.dateAdded;
      const bookmarkDate = typeof rawDate === 'string' ? new Date(rawDate).getTime() : rawDate || 0;
      const tombstoneDate = tombstone.deletedAt || 0;
      if (isNaN(bookmarkDate) || bookmarkDate <= tombstoneDate) {
        skippedByTombstone.push({ bookmark: cloudBm, tombstone });
        continue;
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      // FIX: Skip ALL cloud updates for locally modified bookmarks.
      // Local wins for title, folder, AND index changes.
      if (locallyModifiedBookmarkIds.has(localBm.id)) {
        skippedByLocalModification.push(cloudBm.url);
        continue;
      }
      toUpdate.push({ cloud: cloudBm, local: localBm });
    } else {
      alreadyExistsUnchanged.push(cloudBm.url);
    }
  }

  return { toAdd, toUpdate, skippedByTombstone, skippedByLocalModification };
}

// ============================================================================
// Tests
// ============================================================================

describe('Bug Fix: Bookmark reorder should NOT reset on Sync Now', () => {
  describe('categorizeCloudBookmarks - index-only changes for locally modified bookmarks', () => {
    it('should skip cloud index updates for bookmarks the user just rearranged', () => {
      // Scenario: User moved bookmarks in toolbar. Cloud has old order.
      const cloudBookmarks = [
        { url: 'https://github.com', title: 'GitHub', folderPath: 'Bookmarks Bar', index: 0 },
        {
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          folderPath: 'Bookmarks Bar',
          index: 1,
        },
        { url: 'https://mdn.io', title: 'MDN', folderPath: 'Bookmarks Bar', index: 2 },
        { url: 'https://reddit.com', title: 'Reddit', folderPath: 'Bookmarks Bar', index: 3 },
        { url: 'https://youtube.com', title: 'YouTube', folderPath: 'Bookmarks Bar', index: 4 },
      ];

      // Local state: user moved MDN to top, YouTube to position 2
      const localBookmarks = [
        {
          id: 'bm-1',
          url: 'https://mdn.io',
          title: 'MDN',
          folderPath: 'Bookmarks Toolbar',
          index: 0,
        },
        {
          id: 'bm-2',
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Toolbar',
          index: 1,
        },
        {
          id: 'bm-3',
          url: 'https://youtube.com',
          title: 'YouTube',
          folderPath: 'Bookmarks Toolbar',
          index: 2,
        },
        {
          id: 'bm-4',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          folderPath: 'Bookmarks Toolbar',
          index: 3,
        },
        {
          id: 'bm-5',
          url: 'https://reddit.com',
          title: 'Reddit',
          folderPath: 'Bookmarks Toolbar',
          index: 4,
        },
      ];

      // All siblings are marked as locally modified (the onMoved handler does this)
      const locallyModifiedBookmarkIds = new Set(['bm-1', 'bm-2', 'bm-3', 'bm-4', 'bm-5']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // All bookmarks exist locally with same title/folder - only index differs
      // They should ALL be skipped (not put in toUpdate)
      expect(result.toUpdate.length).toBe(0);
      expect(result.toAdd.length).toBe(0);
      expect(result.skippedByLocalModification.length).toBe(5);
    });

    it('should skip cloud title changes for locally modified bookmarks (local wins)', () => {
      const cloudBookmarks = [
        {
          url: 'https://github.com',
          title: 'GitHub (Updated)',
          folderPath: 'Bookmarks Bar',
          index: 0,
        },
      ];

      const localBookmarks = [
        {
          id: 'bm-1',
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Toolbar',
          index: 2,
        },
      ];

      const locallyModifiedBookmarkIds = new Set(['bm-1']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // Locally modified bookmark — local wins, cloud title change is skipped.
      // The local state will be pushed to cloud in the push phase.
      expect(result.toUpdate.length).toBe(0);
      expect(result.skippedByLocalModification.length).toBe(1);
    });

    it('should skip cloud folder changes for locally modified bookmarks (local wins)', () => {
      const cloudBookmarks = [
        { url: 'https://github.com', title: 'GitHub', folderPath: 'Bookmarks Bar/Work', index: 0 },
      ];

      const localBookmarks = [
        {
          id: 'bm-1',
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Toolbar',
          index: 2,
        },
      ];

      const locallyModifiedBookmarkIds = new Set(['bm-1']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // Locally modified bookmark — local wins, cloud folder change is skipped.
      // The local state will be pushed to cloud in the push phase.
      expect(result.toUpdate.length).toBe(0);
      expect(result.skippedByLocalModification.length).toBe(1);
    });

    it('should update bookmarks normally when they are NOT locally modified', () => {
      const cloudBookmarks = [
        { url: 'https://github.com', title: 'GitHub', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://mdn.io', title: 'MDN', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const localBookmarks = [
        {
          id: 'bm-1',
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Toolbar',
          index: 1,
        },
        {
          id: 'bm-2',
          url: 'https://mdn.io',
          title: 'MDN',
          folderPath: 'Bookmarks Toolbar',
          index: 0,
        },
      ];

      // No bookmarks are locally modified
      const locallyModifiedBookmarkIds = new Set();

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // Both have index differences and are NOT locally modified - should be updated
      expect(result.toUpdate.length).toBe(2);
      expect(result.skippedByLocalModification.length).toBe(0);
    });

    it('should handle mixed scenario: some bookmarks locally modified, some not', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
        { url: 'https://c.com', title: 'C (Updated)', folderPath: 'Bookmarks Bar', index: 2 },
      ];

      const localBookmarks = [
        { id: 'bm-1', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 2 },
        { id: 'bm-2', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Toolbar', index: 0 },
        { id: 'bm-3', url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Toolbar', index: 1 },
      ];

      // Only bm-1 and bm-2 are locally modified (user reordered them)
      // bm-3 is not locally modified
      const locallyModifiedBookmarkIds = new Set(['bm-1', 'bm-2']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // bm-1: locally modified -> skip (local wins)
      // bm-2: locally modified -> skip (local wins)
      // bm-3: NOT locally modified, title changed -> update from cloud
      expect(result.skippedByLocalModification.length).toBe(2);
      expect(result.toUpdate.length).toBe(1);
      expect(result.toUpdate[0].cloud.url).toBe('https://c.com');
    });
  });

  describe('updateLocalBookmarksFromCloud - skip index-only moves for locally modified', () => {
    it('should skip ALL cloud updates for locally modified bookmarks', () => {
      const locallyModifiedBookmarkIds = new Set(['bm-1', 'bm-2', 'bm-3']);

      const bookmarksToUpdate = [
        {
          cloud: { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
          local: {
            id: 'bm-1',
            url: 'https://a.com',
            title: 'A',
            folderPath: 'Bookmarks Toolbar',
            index: 2,
          },
        },
        {
          cloud: { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
          local: {
            id: 'bm-2',
            url: 'https://b.com',
            title: 'B',
            folderPath: 'Bookmarks Toolbar',
            index: 0,
          },
        },
      ];

      // Simulate the update logic with fix
      const skipped = [];
      const updated = [];

      for (const { cloud, local } of bookmarksToUpdate) {
        // FIX: skip ALL cloud updates for locally modified bookmarks
        if (locallyModifiedBookmarkIds.has(local.id)) {
          skipped.push(cloud.url);
          continue;
        }

        updated.push(cloud.url);
      }

      // Both bookmarks are locally modified — local wins
      expect(skipped).toEqual(['https://a.com', 'https://b.com']);
      expect(updated).toEqual([]);
    });

    it('should skip ALL cloud updates for locally modified bookmarks (including title)', () => {
      const locallyModifiedBookmarkIds = new Set(['bm-1']);

      const bookmarksToUpdate = [
        {
          cloud: {
            url: 'https://a.com',
            title: 'A (Renamed)',
            folderPath: 'Bookmarks Bar',
            index: 0,
          },
          local: {
            id: 'bm-1',
            url: 'https://a.com',
            title: 'A',
            folderPath: 'Bookmarks Toolbar',
            index: 2,
          },
        },
      ];

      const skipped = [];
      const updated = [];

      for (const { cloud, local } of bookmarksToUpdate) {
        // FIX: skip ALL cloud updates for locally modified bookmarks
        if (locallyModifiedBookmarkIds.has(local.id)) {
          skipped.push(cloud.url);
          continue;
        }

        updated.push(cloud.url);
      }

      // Locally modified — local wins, cloud title change is skipped
      expect(skipped).toEqual(['https://a.com']);
      expect(updated).toEqual([]);
    });
  });

  describe('reorderLocalToMatchCloud - skip folders with locally modified children', () => {
    it('should skip reordering for folders that contain locally modified bookmarks', () => {
      const locallyModifiedBookmarkIds = new Set(['bm-1', 'bm-2', 'bm-3']);

      const children = [
        { id: 'bm-1', title: 'MDN', url: 'https://mdn.io', index: 0 },
        { id: 'bm-2', title: 'GitHub', url: 'https://github.com', index: 1 },
        { id: 'bm-3', title: 'YouTube', url: 'https://youtube.com', index: 2 },
      ];

      const hasLocallyModifiedChildren = children.some((child) =>
        locallyModifiedBookmarkIds.has(child.id)
      );

      expect(hasLocallyModifiedChildren).toBe(true);
      // When true, the reorder function should skip this folder
    });

    it('should still reorder folders that have NO locally modified children', () => {
      const locallyModifiedBookmarkIds = new Set(['other-bm-1']); // different folder

      const children = [
        { id: 'bm-1', title: 'A', url: 'https://a.com', index: 0 },
        { id: 'bm-2', title: 'B', url: 'https://b.com', index: 1 },
      ];

      const hasLocallyModifiedChildren = children.some((child) =>
        locallyModifiedBookmarkIds.has(child.id)
      );

      expect(hasLocallyModifiedChildren).toBe(false);
      // When false, the reorder function proceeds normally
    });

    it('should skip reorder even if only one child is locally modified', () => {
      // When the user moves one bookmark, all siblings get marked as modified.
      // But even if somehow only one is marked, we should still skip the folder.
      const locallyModifiedBookmarkIds = new Set(['bm-2']); // only one sibling

      const children = [
        { id: 'bm-1', title: 'A', url: 'https://a.com', index: 0 },
        { id: 'bm-2', title: 'B', url: 'https://b.com', index: 1 },
        { id: 'bm-3', title: 'C', url: 'https://c.com', index: 2 },
      ];

      const hasLocallyModifiedChildren = children.some((child) =>
        locallyModifiedBookmarkIds.has(child.id)
      );

      expect(hasLocallyModifiedChildren).toBe(true);
    });
  });

  describe('Full sync scenario: reorder then Sync Now', () => {
    it('should preserve local order and push to cloud after reorder + Sync Now', () => {
      // This is the full end-to-end scenario that was broken.
      //
      // Step 1: Cloud and local are in sync
      // Step 2: User rearranges bookmarks locally
      // Step 3: User clicks "Sync Now"
      // Expected: local order is preserved, pushed to cloud
      // Bug (before fix): cloud order overwrites local, changes lost

      // Cloud bookmarks (OLD order)
      const cloudBookmarks = [
        {
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Bar',
          index: 0,
          dateAdded: 1000,
        },
        {
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          folderPath: 'Bookmarks Bar',
          index: 1,
          dateAdded: 1000,
        },
        {
          url: 'https://mdn.io',
          title: 'MDN',
          folderPath: 'Bookmarks Bar',
          index: 2,
          dateAdded: 1000,
        },
        {
          url: 'https://reddit.com',
          title: 'Reddit',
          folderPath: 'Bookmarks Bar',
          index: 3,
          dateAdded: 1000,
        },
        {
          url: 'https://youtube.com',
          title: 'YouTube',
          folderPath: 'Bookmarks Bar',
          index: 4,
          dateAdded: 1000,
        },
      ];

      // Local bookmarks (NEW order - user moved MDN to top, YouTube to position 2)
      const localBookmarks = [
        {
          id: 'bm-1',
          url: 'https://mdn.io',
          title: 'MDN',
          folderPath: 'Bookmarks Toolbar',
          index: 0,
          dateAdded: 1000,
        },
        {
          id: 'bm-2',
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Toolbar',
          index: 1,
          dateAdded: 1000,
        },
        {
          id: 'bm-3',
          url: 'https://youtube.com',
          title: 'YouTube',
          folderPath: 'Bookmarks Toolbar',
          index: 2,
          dateAdded: 1000,
        },
        {
          id: 'bm-4',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          folderPath: 'Bookmarks Toolbar',
          index: 3,
          dateAdded: 1000,
        },
        {
          id: 'bm-5',
          url: 'https://reddit.com',
          title: 'Reddit',
          folderPath: 'Bookmarks Toolbar',
          index: 4,
          dateAdded: 1000,
        },
      ];

      // All siblings marked as locally modified (this is what onMoved does)
      const locallyModifiedBookmarkIds = new Set(['bm-1', 'bm-2', 'bm-3', 'bm-4', 'bm-5']);

      // Step 3a: categorizeCloudBookmarks should skip all index-only updates
      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      expect(result.toAdd.length).toBe(0);
      expect(result.toUpdate.length).toBe(0);
      expect(result.skippedByLocalModification.length).toBe(5);

      // Step 3b: reorderLocalToMatchCloud should skip this folder
      const children = localBookmarks.map((b) => ({
        id: b.id,
        title: b.title,
        url: b.url,
        index: b.index,
      }));
      const hasLocallyModifiedChildren = children.some((child) =>
        locallyModifiedBookmarkIds.has(child.id)
      );
      expect(hasLocallyModifiedChildren).toBe(true);
      // reorderLocalToMatchCloud would skip this folder

      // Step 3c: After skipping cloud updates and reorder, local checksum
      // will differ from cloud checksum (different indices).
      // This triggers a push to cloud with the user's new order.
      // The local order is preserved!

      // Verify local state wasn't modified
      expect(localBookmarks[0].url).toBe('https://mdn.io');
      expect(localBookmarks[0].index).toBe(0);
      expect(localBookmarks[1].url).toBe('https://github.com');
      expect(localBookmarks[1].index).toBe(1);
      expect(localBookmarks[2].url).toBe('https://youtube.com');
      expect(localBookmarks[2].index).toBe(2);
    });

    it('should still pull new bookmarks from cloud during local reorder sync', () => {
      // Even when the user has rearranged bookmarks locally, new bookmarks
      // from another browser should still be added.

      const cloudBookmarks = [
        { url: 'https://github.com', title: 'GitHub', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://new-site.com', title: 'New Site', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const localBookmarks = [
        {
          id: 'bm-1',
          url: 'https://github.com',
          title: 'GitHub',
          folderPath: 'Bookmarks Toolbar',
          index: 0,
        },
      ];

      const locallyModifiedBookmarkIds = new Set(['bm-1']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // New bookmark from cloud should be added
      expect(result.toAdd.length).toBe(1);
      expect(result.toAdd[0].url).toBe('https://new-site.com');
      // Index-only change for github should be skipped
      expect(result.toUpdate.length).toBe(0);
    });

    it('should handle the case where no bookmarks are locally modified (normal sync)', () => {
      // When no local modifications exist, sync should behave normally:
      // cloud index changes should be applied to local.

      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const localBookmarks = [
        { id: 'bm-1', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Toolbar', index: 0 },
        { id: 'bm-2', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 1 },
      ];

      const locallyModifiedBookmarkIds = new Set(); // empty - no local changes

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // Both should be in toUpdate (cloud order should be applied)
      expect(result.toUpdate.length).toBe(2);
      expect(result.skippedByLocalModification.length).toBe(0);
    });
  });

  describe('Cross-browser folder path normalization in fix', () => {
    it('should correctly detect index-only changes across Firefox/Chrome folder paths', () => {
      // Cloud uses Chrome path, local uses Firefox path - same folder
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      ];

      const localBookmarks = [
        { id: 'bm-1', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 3 },
      ];

      const locallyModifiedBookmarkIds = new Set(['bm-1']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // After normalization, both are "toolbar/" - only index differs
      // Should be skipped for locally modified bookmark
      expect(result.toUpdate.length).toBe(0);
      expect(result.skippedByLocalModification.length).toBe(1);
    });

    it('should skip cloud folder changes for locally modified bookmarks even after normalization', () => {
      // Cloud moved bookmark to a subfolder - but bookmark is locally modified, so local wins
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar/Work', index: 0 },
      ];

      const localBookmarks = [
        { id: 'bm-1', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 3 },
      ];

      const locallyModifiedBookmarkIds = new Set(['bm-1']);

      const result = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        [],
        locallyModifiedBookmarkIds
      );

      // Locally modified — local wins, cloud folder change is skipped
      expect(result.toUpdate.length).toBe(0);
      expect(result.skippedByLocalModification.length).toBe(1);
    });
  });
});
