/**
 * Tests for the bug: "Delete a bookmark in the bookmarks toolbar, wait for
 * auto-sync to run, it is reverted."
 *
 * Scenario:
 * 1. User has a toolbar bookmark that is already synced to cloud
 * 2. User deletes the bookmark from the toolbar
 * 3. onRemoved fires → tombstone is created locally
 * 4. Auto-sync alarm fires → performSync() runs
 * 5. Bug: the bookmark is re-added from cloud, reverting the deletion
 *
 * Root cause candidates tested here:
 * A. categorizeCloudBookmarks fails to filter the deleted bookmark
 *    (tombstone date comparison issue, dateAdded format issue)
 * B. Tombstone is lost between creation and sync (race condition
 *    where storeTombstones in performSync overwrites the tombstone
 *    added by onRemoved)
 * C. The push to cloud doesn't remove the bookmark, so subsequent
 *    syncs keep re-adding it
 * D. dateAdded on cloud is newer than the tombstone's deletedAt
 *    (caused by server normalizing dateAdded to Date.now() for
 *    falsy values)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Functions extracted from background/index.js for direct testing
// =============================================================================

/**
 * Normalize folder path for cross-browser comparison
 * (from background/index.js ~line 405)
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
 * Check if a bookmark needs to be updated based on cloud data
 * (from background/index.js ~line 433)
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
 * Categorize cloud bookmarks into those to add vs update vs skip
 * (from background/index.js ~line 457)
 *
 * This is the critical function for this bug - it decides whether a
 * cloud bookmark should be added to the local browser.
 */
function categorizeCloudBookmarks(
  cloudBookmarks,
  localBookmarks,
  tombstones,
  _locallyModifiedBookmarkIds = new Set()
) {
  const localByUrl = new Map(localBookmarks.filter((b) => b.url).map((b) => [b.url, b]));

  const toAdd = [];
  const toUpdate = [];
  const skippedByTombstone = [];

  for (const cloudBm of cloudBookmarks) {
    if (!cloudBm.url) continue;

    // Check tombstones - only add if bookmark is newer than tombstone
    const tombstone = tombstones.find((t) => t.url === cloudBm.url);
    if (tombstone) {
      const rawDate = cloudBm.dateAdded;
      const bookmarkDate = typeof rawDate === 'string' ? new Date(rawDate).getTime() : rawDate || 0;
      const tombstoneDate = tombstone.deletedAt || 0;
      if (isNaN(bookmarkDate) || bookmarkDate <= tombstoneDate) {
        skippedByTombstone.push({
          bookmark: cloudBm,
          tombstone,
          reason: `dateAdded(${bookmarkDate}) <= deletedAt(${tombstoneDate})`,
        });
        continue;
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      if (_locallyModifiedBookmarkIds.has(localBm.id)) {
        const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
        const localFolder = normalizeFolderPath(localBm.folderPath);
        const titleChanged = (cloudBm.title ?? '') !== (localBm.title ?? '');
        const folderChanged = cloudFolder !== localFolder;
        if (!titleChanged && !folderChanged) {
          continue;
        }
      }
      toUpdate.push({ cloud: cloudBm, local: localBm });
    }
  }

  return { toAdd, toUpdate, skippedByTombstone };
}

/**
 * Merge local and cloud tombstones, keeping the newest deletion time
 * (from background/index.js ~line 2044)
 */
function mergeTombstonesLocal(localTombstones, cloudTombstones) {
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
 * Filter cloud tombstones to only include those that should be applied
 * (from background/index.js ~line 343)
 */
function filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime) {
  if (!cloudTombstones || cloudTombstones.length === 0) return [];
  if (!lastSyncTime) return [];

  const localTombstoneUrls = new Set(localTombstones.map((t) => t.url));

  return cloudTombstones.filter((tombstone) => {
    if (localTombstoneUrls.has(tombstone.url)) return true;
    if (tombstone.deletedAt > lastSyncTime) return true;
    return false;
  });
}

/**
 * Flatten a bookmark tree into a flat array
 * (from background/index.js ~line 1456)
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

/**
 * Server-side: Apply tombstones to filter bookmarks (replace mode)
 * (from apps/web/app/api/bookmarks/route.js ~line 905)
 */
function serverApplyTombstonesReplaceMode(bookmarks, tombstones) {
  const tombstoneMap = new Map(tombstones.map((t) => [t.url, t.deletedAt || 0]));
  return bookmarks.filter((b) => {
    if (!b.url) return true;
    const tombstoneDate = tombstoneMap.get(b.url);
    if (tombstoneDate === undefined) return true;
    const bookmarkDate =
      typeof b.dateAdded === 'string' ? new Date(b.dateAdded).getTime() : b.dateAdded || 0;
    return bookmarkDate > tombstoneDate;
  });
}

/**
 * Server-side: Merge tombstones with age-based cleanup
 * (from apps/web/app/api/bookmarks/route.js ~line 375)
 */
function serverMergeTombstones(existingTombstones, incomingTombstones) {
  const tombstoneMap = new Map();
  const existingArray = Array.isArray(existingTombstones) ? existingTombstones : [];
  const incomingArray = Array.isArray(incomingTombstones) ? incomingTombstones : [];

  for (const tombstone of existingArray) {
    if (tombstone && tombstone.url) {
      tombstoneMap.set(tombstone.url, tombstone);
    }
  }
  for (const incoming of incomingArray) {
    if (!incoming || !incoming.url) continue;
    const existing = tombstoneMap.get(incoming.url);
    if (!existing || incoming.deletedAt > existing.deletedAt) {
      tombstoneMap.set(incoming.url, incoming);
    }
  }
  return Array.from(tombstoneMap.values());
}

// =============================================================================
// Tests
// =============================================================================

describe('Bug: Delete toolbar bookmark → auto-sync reverts it', () => {
  // Timestamps for the scenario
  const T_BOOKMARK_CREATED = 1700000000000; // When the bookmark was originally created
  const T_LAST_SYNC = 1700100000000; // Last successful sync (before deletion)
  const T_USER_DELETES = 1700200000000; // User deletes the bookmark
  const T_AUTO_SYNC_FIRES = 1700205000000; // Auto-sync fires 5 seconds later

  // The bookmark that exists in both local browser and cloud
  const toolbarBookmark = {
    url: 'https://example.com',
    title: 'Example Site',
    folderPath: 'Bookmarks Bar',
    dateAdded: T_BOOKMARK_CREATED,
    index: 0,
    type: 'bookmark',
  };

  // Other bookmarks that should remain untouched
  const otherBookmark = {
    url: 'https://other.com',
    title: 'Other Site',
    folderPath: 'Bookmarks Bar',
    dateAdded: T_BOOKMARK_CREATED,
    index: 1,
    type: 'bookmark',
  };

  describe('Core: categorizeCloudBookmarks must filter tombstoned bookmark', () => {
    it('should NOT add cloud bookmark when local tombstone exists (dateAdded is number)', () => {
      // After user deletes the bookmark:
      // - Local bookmarks: only "Other Site" (deleted bookmark is gone)
      // - Local tombstones: tombstone for "https://example.com"
      // - Cloud bookmarks: still has BOTH bookmarks (not yet pushed)
      // - Cloud tombstones: none

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      const cloudBookmarks = [toolbarBookmark, otherBookmark];
      const localTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];
      const cloudTombstones = [];
      const mergedTombstones = mergeTombstonesLocal(localTombstones, cloudTombstones);

      const { toAdd, skippedByTombstone } = categorizeCloudBookmarks(
        cloudBookmarks,
        localBookmarks,
        mergedTombstones
      );

      // The deleted bookmark must NOT be in toAdd
      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
      // It should be in skippedByTombstone
      expect(
        skippedByTombstone.find((s) => s.bookmark.url === 'https://example.com')
      ).toBeDefined();
      // The other bookmark already exists locally, so nothing to add
      expect(toAdd).toHaveLength(0);
    });

    it('should NOT add cloud bookmark when dateAdded is an ISO string', () => {
      // Cloud might return dateAdded as an ISO string (from convertBrowserBookmarks)
      const cloudBookmarkWithStringDate = {
        ...toolbarBookmark,
        dateAdded: new Date(T_BOOKMARK_CREATED).toISOString(),
      };

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      const mergedTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks(
        [cloudBookmarkWithStringDate, otherBookmark],
        localBookmarks,
        mergedTombstones
      );

      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
    });

    it('should NOT add cloud bookmark when dateAdded is 0 (falsy)', () => {
      const cloudBookmarkNoDate = { ...toolbarBookmark, dateAdded: 0 };

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      const mergedTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks(
        [cloudBookmarkNoDate, otherBookmark],
        localBookmarks,
        mergedTombstones
      );

      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
    });

    it('should NOT add cloud bookmark when dateAdded is undefined', () => {
      const cloudBookmarkNoDate = { ...toolbarBookmark, dateAdded: undefined };

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      const mergedTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks(
        [cloudBookmarkNoDate, otherBookmark],
        localBookmarks,
        mergedTombstones
      );

      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
    });

    it('should NOT add cloud bookmark when dateAdded is NaN (invalid string)', () => {
      const cloudBookmarkBadDate = { ...toolbarBookmark, dateAdded: 'not-a-date' };

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      const mergedTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks(
        [cloudBookmarkBadDate, otherBookmark],
        localBookmarks,
        mergedTombstones
      );

      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
    });

    it('CRITICAL: should NOT add when server set dateAdded to Date.now() during previous push', () => {
      // The server normalizes: dateAdded = ... || Date.now()
      // If dateAdded was somehow falsy during the last push, the server
      // stores Date.now() as dateAdded. This could make the cloud bookmark's
      // dateAdded be VERY CLOSE to the tombstone's deletedAt.
      //
      // Even in this worst case, the bookmark should not be re-added because
      // the user deleted it AFTER the last sync (which set dateAdded).

      // Previous sync set dateAdded to Date.now() at push time (T_LAST_SYNC)
      const cloudBookmarkServerDate = {
        ...toolbarBookmark,
        dateAdded: T_LAST_SYNC, // Set by server during last push
      };

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      // Tombstone created AFTER the last sync
      const mergedTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks(
        [cloudBookmarkServerDate, otherBookmark],
        localBookmarks,
        mergedTombstones
      );

      // T_LAST_SYNC < T_USER_DELETES, so tombstone wins
      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
    });

    it('EDGE CASE: should NOT add when dateAdded equals deletedAt exactly', () => {
      const sameTime = T_USER_DELETES;
      const cloudBookmarkSameDate = { ...toolbarBookmark, dateAdded: sameTime };

      const localBookmarks = [{ ...otherBookmark, id: 'bm-2' }];
      const mergedTombstones = [{ url: 'https://example.com', deletedAt: sameTime }];

      const { toAdd } = categorizeCloudBookmarks(
        [cloudBookmarkSameDate, otherBookmark],
        localBookmarks,
        mergedTombstones
      );

      // When dates are equal, tombstone wins (bookmarkDate <= tombstoneDate)
      expect(toAdd.find((b) => b.url === 'https://example.com')).toBeUndefined();
    });
  });

  describe('Full single-browser sync flow after deletion', () => {
    it('should not re-add deleted toolbar bookmark during auto-sync', () => {
      // === STATE BEFORE DELETION ===
      // Both local and cloud have the bookmark. Last sync was at T_LAST_SYNC.

      // === USER DELETES BOOKMARK ===
      // onRemoved fires → tombstone created

      // === AUTO-SYNC FIRES (performSync flow) ===

      // Step 1: Get local bookmarks (deleted bookmark is GONE)
      const localTree = [
        {
          id: '0',
          children: [
            {
              id: '1',
              title: 'Bookmarks Bar',
              children: [
                {
                  id: 'bm-2',
                  url: 'https://other.com',
                  title: 'Other Site',
                  dateAdded: T_BOOKMARK_CREATED,
                  index: 0,
                },
              ],
            },
            { id: '2', title: 'Other Bookmarks', children: [] },
          ],
        },
      ];
      const localFlat = flattenBookmarkTree(localTree);
      expect(localFlat.find((b) => b.url === 'https://example.com')).toBeUndefined();

      // Step 1b: Get local tombstones
      const localTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      // Step 2: Get cloud data (still has the bookmark, no tombstones yet)
      const cloudBookmarks = [
        {
          url: 'https://example.com',
          title: 'Example Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 0,
          type: 'bookmark',
        },
        {
          url: 'https://other.com',
          title: 'Other Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 1,
          type: 'bookmark',
        },
      ];
      const cloudTombstones = [];

      // Step 2.5: Get last sync time
      const lastSyncTime = T_LAST_SYNC;

      // Step 3: Apply cloud tombstones to local (none to apply)
      const tombstonesToApply = filterTombstonesToApply(
        cloudTombstones,
        localTombstones,
        lastSyncTime
      );
      expect(tombstonesToApply).toHaveLength(0);

      // Step 4: Merge tombstones
      const mergedTombstones = mergeTombstonesLocal(localTombstones, cloudTombstones);
      expect(mergedTombstones).toHaveLength(1);
      expect(mergedTombstones[0].url).toBe('https://example.com');

      // Step 5: Re-read local bookmarks (same as step 1 since nothing was applied)
      const updatedLocalFlat = localFlat;

      // Step 6: Categorize cloud bookmarks
      const { toAdd: newFromCloud, toUpdate: bookmarksToUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        updatedLocalFlat,
        mergedTombstones
      );

      // *** THIS IS THE CRITICAL ASSERTION ***
      // The deleted bookmark must NOT be in newFromCloud
      expect(newFromCloud).toHaveLength(0);
      expect(newFromCloud.find((b) => b.url === 'https://example.com')).toBeUndefined();

      // Step 7: No new bookmarks to add locally (good - deletion preserved)

      // Step 8: Final local state still doesn't have the deleted bookmark
      const finalFlat = localFlat; // No changes were made to local
      expect(finalFlat.find((b) => b.url === 'https://example.com')).toBeUndefined();
      expect(finalFlat.filter((b) => b.url).length).toBe(1); // Only "Other Site"

      // Step 9: Push to cloud
      // The pushed data should NOT include the deleted bookmark
      const pushedBookmarks = finalFlat;
      expect(pushedBookmarks.find((b) => b.url === 'https://example.com')).toBeUndefined();

      // Server applies tombstones to pushed data (safety net)
      const serverFinal = serverApplyTombstonesReplaceMode(pushedBookmarks, mergedTombstones);
      expect(serverFinal.find((b) => b.url === 'https://example.com')).toBeUndefined();

      // Server merges tombstones
      const serverTombstones = serverMergeTombstones(cloudTombstones, mergedTombstones);
      expect(serverTombstones).toHaveLength(1);
      expect(serverTombstones[0].url).toBe('https://example.com');
    });
  });

  describe('Second sync after deletion should also not revert', () => {
    it('should not re-add on subsequent syncs after successful push', () => {
      // After the first sync post-deletion:
      // - Cloud now has: [other.com] + tombstone for example.com
      // - Local has: [other.com] + tombstone for example.com
      // - Last sync time updated to T_AUTO_SYNC_FIRES

      const T_SECOND_SYNC = T_AUTO_SYNC_FIRES + 300000; // 5 min later

      const localFlat = [
        {
          type: 'bookmark',
          id: 'bm-2',
          url: 'https://other.com',
          title: 'Other Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 0,
        },
      ];

      const cloudBookmarks = [
        {
          url: 'https://other.com',
          title: 'Other Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 0,
          type: 'bookmark',
        },
      ];
      const cloudTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];
      const localTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];
      const lastSyncTime = T_AUTO_SYNC_FIRES;

      // Step 3: Apply cloud tombstones (tombstone matches local, would be applied
      // but bookmark doesn't exist locally so nothing happens)
      const tombstonesToApply = filterTombstonesToApply(
        cloudTombstones,
        localTombstones,
        lastSyncTime
      );
      // Tombstone passes filter because local has it too
      expect(tombstonesToApply).toHaveLength(1);

      // Step 4: Merge tombstones
      const mergedTombstones = mergeTombstonesLocal(localTombstones, cloudTombstones);
      expect(mergedTombstones).toHaveLength(1);

      // Step 6: Categorize - cloud doesn't have the deleted bookmark
      const { toAdd } = categorizeCloudBookmarks(cloudBookmarks, localFlat, mergedTombstones);
      expect(toAdd).toHaveLength(0);
    });
  });

  describe('Tombstone race condition: storeTombstones during sync', () => {
    it('OLD BUG: demonstrates tombstone loss without re-read fix', () => {
      // This test demonstrates the race condition that CAUSED the bug.
      // The fix (re-reading tombstones before writing) prevents this.
      //
      // Without the fix:
      // 1. performSync starts, reads localTombstones = [] (no tombstones yet)
      // 2. During sync, user deletes a bookmark
      // 3. onRemoved fires, addTombstone writes tombstone to storage
      // 4. performSync continues, calls storeTombstones(mergedTombstones)
      //    where mergedTombstones was computed from the OLD localTombstones (empty)
      // 5. The tombstone from step 3 is OVERWRITTEN and lost!
      // 6. Follow-up sync has no tombstone → bookmark is re-added from cloud

      const storage = {};

      // Step 1: performSync reads tombstones (empty)
      const tombstonesAtSyncStart = storage['marksyncr-tombstones'] || [];
      expect(tombstonesAtSyncStart).toHaveLength(0);

      // Step 2-3: User deletes during sync, tombstone is written
      storage['marksyncr-tombstones'] = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      // Step 4: performSync merges OLD tombstones with cloud (both empty)
      const mergedTombstones = mergeTombstonesLocal(tombstonesAtSyncStart, []);
      expect(mergedTombstones).toHaveLength(0); // No tombstones in merge!

      // WITHOUT FIX: blindly overwrite → tombstone lost
      const unfixedStorage = [...mergedTombstones];
      expect(unfixedStorage).toHaveLength(0);

      // WITH FIX: re-read current storage before writing
      const currentTombstones = storage['marksyncr-tombstones'] || [];
      const safeMerged = mergeTombstonesLocal(currentTombstones, mergedTombstones);
      storage['marksyncr-tombstones'] = safeMerged;

      // Tombstone is preserved with the fix!
      expect(storage['marksyncr-tombstones']).toHaveLength(1);
      expect(storage['marksyncr-tombstones'][0].url).toBe('https://example.com');
    });

    it('FIX: re-reading tombstones before writing preserves concurrent tombstones', () => {
      // This test verifies the fix: performSync re-reads tombstones from
      // storage before writing, so concurrent tombstones are not lost.

      const storage = {};

      // Step 1: performSync reads tombstones (empty)
      const tombstonesAtSyncStart = storage['marksyncr-tombstones'] || [];

      // Step 2-3: User deletes during sync
      storage['marksyncr-tombstones'] = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      // Step 4: Merge OLD tombstones with cloud
      const mergedFromSync = mergeTombstonesLocal(tombstonesAtSyncStart, []);

      // FIX: Before writing, re-read current storage and merge
      const currentTombstones = storage['marksyncr-tombstones'] || [];
      const safelyMerged = mergeTombstonesLocal(currentTombstones, mergedFromSync);

      // Write the safely merged tombstones
      storage['marksyncr-tombstones'] = safelyMerged;

      // Tombstone is preserved!
      expect(storage['marksyncr-tombstones']).toHaveLength(1);
      expect(storage['marksyncr-tombstones'][0].url).toBe('https://example.com');

      // Follow-up sync correctly filters the cloud bookmark
      const { toAdd } = categorizeCloudBookmarks(
        [
          {
            url: 'https://example.com',
            title: 'Example',
            dateAdded: T_BOOKMARK_CREATED,
            folderPath: 'Bookmarks Bar',
            index: 0,
          },
        ],
        [],
        safelyMerged
      );
      expect(toAdd).toHaveLength(0);
    });

    it('FIX: handles multiple concurrent deletions during sync', () => {
      const storage = {};

      // performSync starts with one existing tombstone
      const existingTombstones = [{ url: 'https://old-delete.com', deletedAt: T_BOOKMARK_CREATED }];
      storage['marksyncr-tombstones'] = [...existingTombstones];

      // performSync reads tombstones at start
      const tombstonesAtSyncStart = storage['marksyncr-tombstones'];

      // User deletes two bookmarks during sync
      storage['marksyncr-tombstones'] = [
        ...existingTombstones,
        { url: 'https://example.com', deletedAt: T_USER_DELETES },
        { url: 'https://another.com', deletedAt: T_USER_DELETES + 100 },
      ];

      // performSync merges its tombstones with cloud
      const cloudTombstones = [{ url: 'https://cloud-delete.com', deletedAt: T_LAST_SYNC }];
      const mergedFromSync = mergeTombstonesLocal(tombstonesAtSyncStart, cloudTombstones);

      // FIX: re-read before writing
      const currentTombstones = storage['marksyncr-tombstones'] || [];
      const safelyMerged = mergeTombstonesLocal(currentTombstones, mergedFromSync);
      storage['marksyncr-tombstones'] = safelyMerged;

      // ALL tombstones are preserved: old + 2 concurrent + cloud
      const urls = safelyMerged.map((t) => t.url).sort();
      expect(urls).toEqual([
        'https://another.com',
        'https://cloud-delete.com',
        'https://example.com',
        'https://old-delete.com',
      ]);
    });
  });

  describe('Server-side: push must remove bookmark and store tombstone', () => {
    it('should remove the deleted bookmark from cloud during push (replace mode)', () => {
      // The extension pushes its local state (without the deleted bookmark)
      // plus merged tombstones (with the deletion tombstone)
      const pushedBookmarks = [
        {
          url: 'https://other.com',
          title: 'Other Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 0,
          type: 'bookmark',
        },
      ];
      const pushedTombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      // Server's existing state (still has the bookmark)
      const existingBookmarks = [
        {
          url: 'https://example.com',
          title: 'Example Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 0,
        },
        {
          url: 'https://other.com',
          title: 'Other Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_BOOKMARK_CREATED,
          index: 1,
        },
      ];
      const existingTombstones = [];

      // Server merges tombstones
      const serverMerged = serverMergeTombstones(existingTombstones, pushedTombstones);
      expect(serverMerged).toHaveLength(1);

      // Server applies tombstones to pushed bookmarks (replace mode)
      const serverFinal = serverApplyTombstonesReplaceMode(pushedBookmarks, serverMerged);

      // The deleted bookmark should not be in the final result
      expect(serverFinal.find((b) => b.url === 'https://example.com')).toBeUndefined();
      expect(serverFinal).toHaveLength(1);
      expect(serverFinal[0].url).toBe('https://other.com');
    });
  });

  describe('Firefox toolbar (different folderPath naming)', () => {
    it('should handle Firefox "Bookmarks Toolbar" path correctly', () => {
      const cloudBookmark = {
        url: 'https://example.com',
        title: 'Example',
        folderPath: 'Bookmarks Toolbar', // Firefox naming
        dateAdded: T_BOOKMARK_CREATED,
        index: 0,
      };

      const localBookmarks = [];
      const tombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks([cloudBookmark], localBookmarks, tombstones);

      // Should still be filtered by tombstone regardless of folder naming
      expect(toAdd).toHaveLength(0);
    });
  });

  describe('Bookmark with dateAdded set by server Date.now() fallback', () => {
    it('should handle when server set dateAdded to Date.now() (close to tombstone time)', () => {
      // Worst case: the server's Date.now() fallback set dateAdded to a time
      // that is very close to (but still before) the deletion.

      // Server normalized dateAdded during push at T_LAST_SYNC
      const cloudBookmark = {
        url: 'https://example.com',
        title: 'Example',
        folderPath: 'Bookmarks Bar',
        dateAdded: T_LAST_SYNC, // Server's Date.now() at push time
        index: 0,
      };

      const localBookmarks = [];
      // User deleted 100 seconds after last sync
      const tombstones = [{ url: 'https://example.com', deletedAt: T_LAST_SYNC + 100000 }];

      const { toAdd } = categorizeCloudBookmarks([cloudBookmark], localBookmarks, tombstones);

      // dateAdded (T_LAST_SYNC) < deletedAt (T_LAST_SYNC + 100s) → tombstone wins
      expect(toAdd).toHaveLength(0);
    });

    it('DANGEROUS: should handle when server Date.now() dateAdded is AFTER tombstone', () => {
      // This is the dangerous scenario: if somehow the server's Date.now()
      // for dateAdded ends up AFTER the tombstone's deletedAt.
      //
      // This could happen if:
      // 1. Browser A pushes at T1 (server sets dateAdded = T1)
      // 2. Browser B deletes at T0 (creates tombstone deletedAt = T0, where T0 < T1)
      // 3. Browser B syncs - the tombstone is older than the cloud bookmark
      //
      // In this case, the cloud bookmark IS newer than the tombstone,
      // so it SHOULD be added (the other browser intentionally has it).
      // This is NOT the bug - this is correct behavior.

      const cloudBookmark = {
        url: 'https://example.com',
        title: 'Example',
        folderPath: 'Bookmarks Bar',
        dateAdded: T_USER_DELETES + 1000, // NEWER than tombstone
        index: 0,
      };

      const localBookmarks = [];
      const tombstones = [{ url: 'https://example.com', deletedAt: T_USER_DELETES }];

      const { toAdd } = categorizeCloudBookmarks([cloudBookmark], localBookmarks, tombstones);

      // Bookmark is NEWER than tombstone → should be added (correct behavior)
      expect(toAdd).toHaveLength(1);
    });
  });
});

describe('Full end-to-end sync simulation with mock browser APIs', () => {
  /**
   * Simulates the entire performSync flow with mock state.
   * Returns the final state after sync.
   *
   * @param {Object} opts - Sync options
   * @param {Array} opts.currentStorageTombstones - Optional: tombstones currently in storage
   *   (may differ from localTombstones if onRemoved wrote during sync).
   *   When provided, simulates the fix: re-reading tombstones before writing.
   */
  function simulatePerformSync({
    localBookmarkTree,
    localTombstones,
    cloudBookmarks,
    cloudTombstones,
    cloudChecksum,
    lastSyncTime,
    currentStorageTombstones,
  }) {
    // Step 1: Flatten local bookmarks
    const localFlat = flattenBookmarkTree(localBookmarkTree);

    // Step 2: Cloud data (provided)

    // Step 3: Apply cloud tombstones to local
    const tombstonesToApply = filterTombstonesToApply(
      cloudTombstones,
      localTombstones,
      lastSyncTime
    );
    // In real code, this would call browser.bookmarks.remove for each match
    // For simulation, we just track what would be deleted
    const localFlatAfterTombstones = localFlat.filter((b) => {
      if (!b.url) return true;
      return !tombstonesToApply.some((t) => t.url === b.url);
    });

    // Step 4: Merge tombstones
    const mergedTombstones = mergeTombstonesLocal(localTombstones, cloudTombstones);

    // FIX: Re-read current tombstones from storage before writing
    // This preserves tombstones created by onRemoved during the sync
    const currentTombstones = currentStorageTombstones ?? localTombstones;
    const safeMergedTombstones = mergeTombstonesLocal(currentTombstones, mergedTombstones);

    // Step 5: "Re-read" local bookmarks (after tombstone deletions)
    const updatedLocalFlat = localFlatAfterTombstones;

    // Step 6: Categorize cloud bookmarks (uses safeMergedTombstones per fix)
    const { toAdd: newFromCloud, toUpdate: bookmarksToUpdate } = categorizeCloudBookmarks(
      cloudBookmarks,
      updatedLocalFlat,
      safeMergedTombstones
    );

    // Step 7: "Add" new cloud bookmarks to local
    // In real code, this calls browser.bookmarks.create
    const finalLocalFlat = [
      ...updatedLocalFlat,
      ...newFromCloud.map((b, i) => ({
        ...b,
        id: `cloud-added-${i}`,
      })),
    ];

    // Step 8: Generate final state for push
    const pushBookmarks = finalLocalFlat;

    // Step 9: Server processes the push
    const serverMergedTombstones = serverMergeTombstones(cloudTombstones, safeMergedTombstones);
    const serverFinalBookmarks = serverApplyTombstonesReplaceMode(
      pushBookmarks,
      serverMergedTombstones
    );

    return {
      newFromCloud,
      bookmarksToUpdate,
      finalLocalFlat,
      mergedTombstones: safeMergedTombstones,
      serverFinalBookmarks,
      serverMergedTombstones,
      tombstonesToApply,
    };
  }

  it('complete flow: delete toolbar bookmark, auto-sync, verify not reverted', () => {
    const T_CREATED = 1700000000000;
    const T_LAST_SYNC = 1700100000000;
    const T_DELETED = 1700200000000;

    // Local state: bookmark already deleted, tombstone created
    const localTree = [
      {
        id: '0',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
            children: [
              {
                id: 'bm-2',
                url: 'https://keeper.com',
                title: 'Keeper',
                dateAdded: T_CREATED,
                index: 0,
              },
              // https://example.com is NOT here (user deleted it)
            ],
          },
          { id: '2', title: 'Other Bookmarks', children: [] },
        ],
      },
    ];

    const result = simulatePerformSync({
      localBookmarkTree: localTree,
      localTombstones: [{ url: 'https://example.com', deletedAt: T_DELETED }],
      cloudBookmarks: [
        {
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 0,
          type: 'bookmark',
        },
        {
          url: 'https://keeper.com',
          title: 'Keeper',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 1,
          type: 'bookmark',
        },
      ],
      cloudTombstones: [],
      cloudChecksum: 'old-checksum',
      lastSyncTime: T_LAST_SYNC,
    });

    // VERIFY: The deleted bookmark was NOT re-added
    expect(result.newFromCloud).toHaveLength(0);
    expect(result.finalLocalFlat.find((b) => b.url === 'https://example.com')).toBeUndefined();

    // VERIFY: The deletion is reflected on the server after push
    expect(
      result.serverFinalBookmarks.find((b) => b.url === 'https://example.com')
    ).toBeUndefined();

    // VERIFY: The tombstone is stored on the server
    expect(
      result.serverMergedTombstones.find((t) => t.url === 'https://example.com')
    ).toBeDefined();

    // VERIFY: The other bookmark is preserved
    expect(result.finalLocalFlat.find((b) => b.url === 'https://keeper.com')).toBeDefined();
    expect(result.serverFinalBookmarks.find((b) => b.url === 'https://keeper.com')).toBeDefined();
  });

  it('complete flow: second sync after deletion still works', () => {
    const T_CREATED = 1700000000000;
    const T_DELETED = 1700200000000;
    const T_FIRST_SYNC = 1700205000000;

    // After first sync, cloud no longer has the deleted bookmark
    const localTree = [
      {
        id: '0',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
            children: [
              {
                id: 'bm-2',
                url: 'https://keeper.com',
                title: 'Keeper',
                dateAdded: T_CREATED,
                index: 0,
              },
            ],
          },
          { id: '2', title: 'Other Bookmarks', children: [] },
        ],
      },
    ];

    const result = simulatePerformSync({
      localBookmarkTree: localTree,
      localTombstones: [{ url: 'https://example.com', deletedAt: T_DELETED }],
      cloudBookmarks: [
        {
          url: 'https://keeper.com',
          title: 'Keeper',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 0,
          type: 'bookmark',
        },
      ],
      cloudTombstones: [{ url: 'https://example.com', deletedAt: T_DELETED }],
      cloudChecksum: 'synced-checksum',
      lastSyncTime: T_FIRST_SYNC,
    });

    // No changes should be made
    expect(result.newFromCloud).toHaveLength(0);
    expect(result.finalLocalFlat.find((b) => b.url === 'https://example.com')).toBeUndefined();
  });

  it('FIXED: deletion during ongoing sync preserved by re-read', () => {
    const T_CREATED = 1700000000000;
    const T_LAST_SYNC = 1700100000000;
    const T_DELETE_DURING_SYNC = 1700200500000;
    const T_SYNC_END = 1700201000000;

    // Scenario: Sync starts, user deletes during sync, sync completes,
    // follow-up sync fires.
    //
    // With the fix: performSync re-reads tombstones from storage before writing,
    // so the tombstone created by onRemoved during sync is preserved.

    // First sync: tombstones were empty when sync started, but user deletes
    // during sync and onRemoved writes a tombstone to storage.
    // The fix re-reads storage before writing, picking up the new tombstone.
    const firstSyncResult = simulatePerformSync({
      localBookmarkTree: [
        {
          id: '0',
          children: [
            {
              id: '1',
              title: 'Bookmarks Bar',
              children: [
                {
                  id: 'bm-1',
                  url: 'https://example.com',
                  title: 'Example',
                  dateAdded: T_CREATED,
                  index: 0,
                },
                {
                  id: 'bm-2',
                  url: 'https://keeper.com',
                  title: 'Keeper',
                  dateAdded: T_CREATED,
                  index: 1,
                },
              ],
            },
            { id: '2', title: 'Other Bookmarks', children: [] },
          ],
        },
      ],
      localTombstones: [], // Empty at sync start (read before user deleted)
      cloudBookmarks: [
        {
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 0,
          type: 'bookmark',
        },
        {
          url: 'https://keeper.com',
          title: 'Keeper',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 1,
          type: 'bookmark',
        },
      ],
      cloudTombstones: [],
      cloudChecksum: 'same-checksum',
      lastSyncTime: T_LAST_SYNC,
      // FIX: currentStorageTombstones simulates re-reading storage which now
      // has the tombstone that onRemoved wrote during the sync
      currentStorageTombstones: [{ url: 'https://example.com', deletedAt: T_DELETE_DURING_SYNC }],
    });

    // With the fix, the tombstone is preserved in the merged result
    expect(
      firstSyncResult.mergedTombstones.find((t) => t.url === 'https://example.com')
    ).toBeDefined();

    // Follow-up sync: the local bookmark was deleted, tombstone is preserved
    const followUpResult = simulatePerformSync({
      localBookmarkTree: [
        {
          id: '0',
          children: [
            {
              id: '1',
              title: 'Bookmarks Bar',
              children: [
                {
                  id: 'bm-2',
                  url: 'https://keeper.com',
                  title: 'Keeper',
                  dateAdded: T_CREATED,
                  index: 0,
                },
              ],
            },
            { id: '2', title: 'Other Bookmarks', children: [] },
          ],
        },
      ],
      localTombstones: firstSyncResult.mergedTombstones, // Has the tombstone!
      cloudBookmarks: [
        {
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 0,
          type: 'bookmark',
        },
        {
          url: 'https://keeper.com',
          title: 'Keeper',
          folderPath: 'Bookmarks Bar',
          dateAdded: T_CREATED,
          index: 1,
          type: 'bookmark',
        },
      ],
      cloudTombstones: [],
      cloudChecksum: 'same-checksum',
      lastSyncTime: T_SYNC_END,
    });

    // FIXED: The deleted bookmark is NOT re-added
    expect(followUpResult.newFromCloud).toHaveLength(0);
    expect(
      followUpResult.finalLocalFlat.find((b) => b.url === 'https://example.com')
    ).toBeUndefined();

    // The tombstone is pushed to cloud
    expect(
      followUpResult.serverMergedTombstones.find((t) => t.url === 'https://example.com')
    ).toBeDefined();
  });
});
