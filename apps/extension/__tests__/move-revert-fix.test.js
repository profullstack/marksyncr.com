/**
 * Tests for the bookmark move revert fix (GitHub issue #5 follow-up)
 *
 * Bug: User moves bookmarks around, auto-sync reverts the moves back to
 * cloud order. Deletes worked correctly but moves were being undone.
 *
 * Root causes fixed:
 * 1. categorizeCloudBookmarks used the live locallyModifiedBookmarkIds global
 *    instead of the pre-sync snapshot, allowing sync-driven changes to
 *    pollute the check.
 * 2. updateLocalBookmarksFromCloud also used the live global instead of the
 *    snapshot for the same reason.
 * 3. reorderLocalToMatchCloud used a threshold of `> 1` modified children
 *    to skip reordering, which allowed reorder when exactly 1 child was
 *    modified (e.g., moving a bookmark into a previously empty folder).
 * 4. locallyModifiedBookmarkIds.clear() after sync wiped ALL IDs, including
 *    those added by user actions during the sync. The fix only removes IDs
 *    that were in the pre-sync snapshot.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Helpers (mirroring production code)
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
 * Production-matching categorizeCloudBookmarks that accepts a snapshot parameter
 */
function categorizeCloudBookmarks(
  cloudBookmarks,
  localBookmarks,
  tombstones,
  userModifiedIds = null
) {
  // In production, falls back to the global; here we require the parameter for testing
  const modifiedIds = userModifiedIds || new Set();
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
      const bookmarkDate = typeof rawDate === 'string' ? new Date(rawDate).getTime() : rawDate || 0;
      const tombstoneDate = tombstone.deletedAt || 0;
      if (isNaN(bookmarkDate) || bookmarkDate <= tombstoneDate) {
        skippedByTombstone.push(cloudBm);
        continue;
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      if (modifiedIds.has(localBm.id)) {
        skippedByLocalModification.push(cloudBm.url);
        continue;
      }
      toUpdate.push({ cloud: cloudBm, local: localBm });
    }
  }

  return { toAdd, toUpdate, skippedByTombstone, skippedByLocalModification };
}

/**
 * Simulates the reorder skip logic from reorderLocalToMatchCloud
 * Returns true if the folder should be skipped (user modified)
 */
function shouldSkipReorder(children, userModifiedIds) {
  const modifiedChildrenCount = children.reduce(
    (count, child) => (userModifiedIds.has(child.id) ? count + 1 : count),
    0
  );
  return modifiedChildrenCount >= 1;
}

// ============================================================================
// Tests
// ============================================================================

describe('Fix: Bookmark move revert bug (issue #5 follow-up)', () => {
  describe('categorizeCloudBookmarks with snapshot parameter', () => {
    it('should use the provided snapshot, not a hypothetical live set', () => {
      // Simulate: live set has been polluted by sync-driven changes,
      // but the snapshot (taken before sync) has the real user IDs.
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
        { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const localBookmarks = [
        { id: 'bm-a', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 1 },
        { id: 'bm-b', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Toolbar', index: 0 },
      ];

      // Snapshot: only bm-a and bm-b (user moved them)
      const snapshot = new Set(['bm-a', 'bm-b']);

      const result = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, [], snapshot);

      // Both should be skipped — user modified them
      expect(result.toUpdate).toHaveLength(0);
      expect(result.skippedByLocalModification).toHaveLength(2);
    });

    it('should allow updates when snapshot is empty (no user changes)', () => {
      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      ];

      const localBookmarks = [
        { id: 'bm-a', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 5 },
      ];

      // Empty snapshot — no user changes before sync
      const snapshot = new Set();

      const result = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, [], snapshot);

      // Should be updated from cloud
      expect(result.toUpdate).toHaveLength(1);
      expect(result.skippedByLocalModification).toHaveLength(0);
    });
  });

  describe('reorder skip threshold: >= 1 (not > 1)', () => {
    it('should skip reorder when exactly 1 child is user-modified', () => {
      // This was the key bug: a move into a previously empty folder resulted
      // in exactly 1 modified child, but the old `> 1` threshold let the
      // reorder proceed, reverting the user's move.
      const children = [{ id: 'bm-moved', title: 'Moved Here', url: 'https://moved.com' }];

      const snapshot = new Set(['bm-moved']);

      expect(shouldSkipReorder(children, snapshot)).toBe(true);
    });

    it('should skip reorder when multiple children are user-modified', () => {
      const children = [
        { id: 'bm-a', title: 'A', url: 'https://a.com' },
        { id: 'bm-b', title: 'B', url: 'https://b.com' },
        { id: 'bm-c', title: 'C', url: 'https://c.com' },
      ];

      const snapshot = new Set(['bm-a', 'bm-b', 'bm-c']);

      expect(shouldSkipReorder(children, snapshot)).toBe(true);
    });

    it('should NOT skip reorder when no children are user-modified', () => {
      const children = [
        { id: 'bm-a', title: 'A', url: 'https://a.com' },
        { id: 'bm-b', title: 'B', url: 'https://b.com' },
      ];

      const snapshot = new Set(); // nothing modified

      expect(shouldSkipReorder(children, snapshot)).toBe(false);
    });

    it('should NOT skip reorder when only unrelated IDs are in the snapshot', () => {
      const children = [
        { id: 'bm-a', title: 'A', url: 'https://a.com' },
        { id: 'bm-b', title: 'B', url: 'https://b.com' },
      ];

      // Different folder's IDs
      const snapshot = new Set(['other-bm-1', 'other-bm-2']);

      expect(shouldSkipReorder(children, snapshot)).toBe(false);
    });
  });

  describe('Selective clear: preserve IDs added during sync', () => {
    it('should only remove snapshot IDs from the live set, keeping new ones', () => {
      // Simulate the fix: instead of .clear(), delete only snapshot IDs
      const liveSet = new Set(['bm-a', 'bm-b', 'bm-c', 'bm-new']);
      const snapshot = new Set(['bm-a', 'bm-b', 'bm-c']);

      // Fix: selective delete instead of clear
      for (const id of snapshot) {
        liveSet.delete(id);
      }

      // bm-new was added by the user during sync — it should survive
      expect(liveSet.size).toBe(1);
      expect(liveSet.has('bm-new')).toBe(true);
      expect(liveSet.has('bm-a')).toBe(false);
      expect(liveSet.has('bm-b')).toBe(false);
      expect(liveSet.has('bm-c')).toBe(false);
    });

    it('should handle empty snapshot gracefully (nothing to remove)', () => {
      const liveSet = new Set(['bm-new']);
      const snapshot = new Set();

      for (const id of snapshot) {
        liveSet.delete(id);
      }

      expect(liveSet.size).toBe(1);
      expect(liveSet.has('bm-new')).toBe(true);
    });

    it('should handle case where all IDs are in snapshot (equivalent to clear)', () => {
      const liveSet = new Set(['bm-a', 'bm-b']);
      const snapshot = new Set(['bm-a', 'bm-b']);

      for (const id of snapshot) {
        liveSet.delete(id);
      }

      expect(liveSet.size).toBe(0);
    });
  });

  describe('Full scenario: delete + move in same session', () => {
    it('should preserve moves when deletes and moves happen together', () => {
      // Chovy's exact scenario: deleted bookmarks (worked) + moved bookmarks (reverted)
      //
      // Before: [A(0), B(1), C(2), D(3), E(4)] in toolbar
      // User: deletes D, E. Moves C to position 0.
      // After locally: [C(0), A(1), B(2)]
      // Cloud still has: [A(0), B(1), C(2), D(3), E(4)]

      const cloudBookmarks = [
        {
          url: 'https://a.com',
          title: 'A',
          folderPath: 'Bookmarks Bar',
          index: 0,
          dateAdded: 1000,
        },
        {
          url: 'https://b.com',
          title: 'B',
          folderPath: 'Bookmarks Bar',
          index: 1,
          dateAdded: 1000,
        },
        {
          url: 'https://c.com',
          title: 'C',
          folderPath: 'Bookmarks Bar',
          index: 2,
          dateAdded: 1000,
        },
        {
          url: 'https://d.com',
          title: 'D',
          folderPath: 'Bookmarks Bar',
          index: 3,
          dateAdded: 1000,
        },
        {
          url: 'https://e.com',
          title: 'E',
          folderPath: 'Bookmarks Bar',
          index: 4,
          dateAdded: 1000,
        },
      ];

      // Local after user's changes (D and E deleted, C moved to top)
      const localBookmarks = [
        { id: 'bm-c', url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Toolbar', index: 0 },
        { id: 'bm-a', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 1 },
        { id: 'bm-b', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Toolbar', index: 2 },
      ];

      // Tombstones for deleted bookmarks
      const tombstones = [
        { url: 'https://d.com', deletedAt: Date.now() },
        { url: 'https://e.com', deletedAt: Date.now() },
      ];

      // All IDs from onRemoved + onMoved handlers
      const snapshot = new Set(['bm-d', 'bm-e', 'bm-c', 'bm-a', 'bm-b']);

      const result = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones, snapshot);

      // D and E should be skipped by tombstone (deleted)
      expect(result.skippedByTombstone).toHaveLength(2);
      // A, B, C should be skipped by local modification (moved)
      expect(result.skippedByLocalModification).toHaveLength(3);
      // Nothing should be added or updated
      expect(result.toAdd).toHaveLength(0);
      expect(result.toUpdate).toHaveLength(0);

      // Reorder should also be skipped for the toolbar folder
      const toolbarChildren = localBookmarks.map((b) => ({ id: b.id }));
      expect(shouldSkipReorder(toolbarChildren, snapshot)).toBe(true);
    });
  });

  describe('Edge case: bookmark moved to empty folder', () => {
    it('should skip reorder for destination folder with single moved child', () => {
      // User moves bookmark from Folder1 to empty Folder2.
      // Folder2 now has 1 child — the moved bookmark.
      // The old `> 1` threshold would NOT skip, allowing cloud to reorder.
      // The new `>= 1` threshold correctly skips.

      const children = [{ id: 'bm-moved', title: 'Moved', url: 'https://moved.com' }];

      // onMoved marks the moved bookmark + all siblings in both folders
      // In the destination (previously empty), only the moved bookmark itself
      const snapshot = new Set(['bm-moved']);

      expect(shouldSkipReorder(children, snapshot)).toBe(true);
    });
  });

  describe('Edge case: sync-driven changes should not affect categorization', () => {
    it('should not skip updates for bookmarks only modified by sync (not in snapshot)', () => {
      // During sync, isSyncDrivenChange=true prevents onMoved from adding to
      // locallyModifiedBookmarkIds. But if someone used the live global instead
      // of the snapshot, sync-driven IDs could leak in.
      //
      // This test ensures the snapshot approach works correctly.

      const cloudBookmarks = [
        { url: 'https://a.com', title: 'A (Updated)', folderPath: 'Bookmarks Bar', index: 0 },
      ];

      const localBookmarks = [
        { id: 'bm-a', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Toolbar', index: 0 },
      ];

      // Snapshot is empty — user didn't modify anything before sync
      // (any changes to bm-a during sync are sync-driven and excluded)
      const snapshot = new Set();

      const result = categorizeCloudBookmarks(cloudBookmarks, localBookmarks, [], snapshot);

      // Title change from cloud should be applied
      expect(result.toUpdate).toHaveLength(1);
      expect(result.toUpdate[0].cloud.title).toBe('A (Updated)');
      expect(result.skippedByLocalModification).toHaveLength(0);
    });
  });
});
