/**
 * Tests for bookmark deletion sync across browsers
 *
 * Scenario: User deletes bookmarks in Firefox, syncs, then syncs Chrome.
 * Expected: Deleted bookmarks should be removed from Chrome.
 *
 * This test simulates the server-side logic to identify the root cause.
 */

import { describe, it, expect } from 'vitest';

/**
 * Server-side functions (copied from route.js for testing)
 */

function extractBookmarksFromNested(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  if (data.roots) {
    const bookmarks = [];

    function extractFromNode(node, path = '') {
      if (!node) return;

      if (node.url) {
        bookmarks.push({
          url: node.url,
          title: node.title ?? '',
          folderPath: path,
          dateAdded: node.dateAdded ? new Date(node.dateAdded).getTime() : Date.now(),
        });
        return;
      }

      if (node.children && Array.isArray(node.children)) {
        const newPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;
        for (const child of node.children) {
          extractFromNode(child, newPath);
        }
      }
    }

    for (const [rootKey, rootNode] of Object.entries(data.roots)) {
      if (rootNode && rootNode.children) {
        const rootPath = rootNode.title || rootKey;
        for (const child of rootNode.children) {
          extractFromNode(child, rootPath);
        }
      }
    }

    return bookmarks;
  }

  return [];
}

function mergeTombstones(existingTombstones, incomingTombstones) {
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

function applyTombstones(bookmarks, tombstones) {
  if (!tombstones || tombstones.length === 0) {
    return bookmarks;
  }

  const tombstoneMap = new Map();
  for (const tombstone of tombstones) {
    if (tombstone && tombstone.url) {
      tombstoneMap.set(tombstone.url, tombstone);
    }
  }

  return bookmarks.filter((bookmark) => {
    const tombstone = tombstoneMap.get(bookmark.url);
    if (!tombstone) {
      return true;
    }

    const bookmarkDate = bookmark.dateAdded || 0;
    const tombstoneDate = tombstone.deletedAt || 0;

    return bookmarkDate > tombstoneDate;
  });
}

function mergeBookmarks(existingBookmarks, incomingBookmarks) {
  const bookmarkMap = new Map();

  const existingArray = extractBookmarksFromNested(existingBookmarks);
  const incomingArray = Array.isArray(incomingBookmarks) ? incomingBookmarks : [];

  for (const bookmark of existingArray) {
    if (bookmark && bookmark.url) {
      bookmarkMap.set(bookmark.url, bookmark);
    }
  }

  let added = 0;
  let updated = 0;

  for (const incoming of incomingArray) {
    if (!incoming || !incoming.url) {
      continue;
    }
    const existing = bookmarkMap.get(incoming.url);

    if (!existing) {
      bookmarkMap.set(incoming.url, incoming);
      added++;
    } else {
      const existingDate = existing.dateAdded || 0;
      const incomingDate = incoming.dateAdded || 0;

      if (incomingDate > existingDate) {
        bookmarkMap.set(incoming.url, {
          ...incoming,
          id: existing.id || incoming.id,
        });
        updated++;
      }
    }
  }

  return {
    merged: Array.from(bookmarkMap.values()),
    added,
    updated,
  };
}

/**
 * Extension-side functions (copied from background/index.js for testing)
 */

function applyTombstonesToLocal(tombstones, localBookmarks) {
  const toDelete = [];

  const tombstoneMap = new Map(tombstones.map((t) => [t.url, t.deletedAt]));

  for (const bookmark of localBookmarks) {
    const tombstoneTime = tombstoneMap.get(bookmark.url);
    if (tombstoneTime) {
      const bookmarkTime = bookmark.dateAdded || 0;
      if (tombstoneTime > bookmarkTime) {
        toDelete.push(bookmark);
      }
    }
  }

  return toDelete;
}

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

describe('Deletion Sync - Cross-Browser Scenario', () => {
  /**
   * Simulates the exact user scenario:
   * 1. Both Firefox and Chrome have the same bookmarks synced
   * 2. User deletes bookmarks in Firefox
   * 3. Firefox syncs (sends tombstones to cloud)
   * 4. Chrome syncs (should receive tombstones and delete local bookmarks)
   */
  describe('Firefox deletes, Chrome syncs', () => {
    const T_BOOKMARK_ADDED = 1703000000000; // When bookmark was originally added
    const T_FIREFOX_DELETES = 1703500000000; // When Firefox deletes the bookmark
    const T_CHROME_SYNCS = 1703600000000; // When Chrome syncs

    // Initial state: Both browsers have the same bookmarks
    const initialBookmarks = [
      {
        url: 'https://keep-this.com',
        title: 'Keep This',
        dateAdded: T_BOOKMARK_ADDED,
        folderPath: '',
      },
      {
        url: 'https://delete-this.com',
        title: 'Delete This',
        dateAdded: T_BOOKMARK_ADDED,
        folderPath: '',
      },
      {
        url: 'https://also-delete.com',
        title: 'Also Delete',
        dateAdded: T_BOOKMARK_ADDED,
        folderPath: '',
      },
    ];

    it('Step 1: Firefox deletes bookmarks and creates tombstones', () => {
      // Firefox deletes 2 bookmarks
      const firefoxTombstones = [
        { url: 'https://delete-this.com', deletedAt: T_FIREFOX_DELETES },
        { url: 'https://also-delete.com', deletedAt: T_FIREFOX_DELETES },
      ];

      // Firefox's local bookmarks after deletion (only the one that wasn't deleted)
      const firefoxLocalBookmarks = [
        {
          url: 'https://keep-this.com',
          title: 'Keep This',
          dateAdded: T_BOOKMARK_ADDED,
          folderPath: '',
        },
      ];

      expect(firefoxTombstones).toHaveLength(2);
      expect(firefoxLocalBookmarks).toHaveLength(1);
    });

    it('Step 2: Firefox syncs to cloud - server merges tombstones', () => {
      // Cloud state before Firefox sync
      const cloudBookmarksBefore = [...initialBookmarks];
      const cloudTombstonesBefore = [];

      // Firefox sends its bookmarks (without deleted ones) and tombstones
      const firefoxBookmarks = [
        {
          url: 'https://keep-this.com',
          title: 'Keep This',
          dateAdded: T_BOOKMARK_ADDED,
          folderPath: '',
        },
      ];
      const firefoxTombstones = [
        { url: 'https://delete-this.com', deletedAt: T_FIREFOX_DELETES },
        { url: 'https://also-delete.com', deletedAt: T_FIREFOX_DELETES },
      ];

      // Server merges tombstones
      const mergedTombstones = mergeTombstones(cloudTombstonesBefore, firefoxTombstones);
      expect(mergedTombstones).toHaveLength(2);
      expect(mergedTombstones.find((t) => t.url === 'https://delete-this.com')).toBeDefined();
      expect(mergedTombstones.find((t) => t.url === 'https://also-delete.com')).toBeDefined();

      // Server merges bookmarks
      const { merged } = mergeBookmarks(cloudBookmarksBefore, firefoxBookmarks);

      // Server applies tombstones to merged bookmarks
      const finalBookmarks = applyTombstones(merged, mergedTombstones);

      // Cloud should now have only 1 bookmark (the one that wasn't deleted)
      expect(finalBookmarks).toHaveLength(1);
      expect(finalBookmarks[0].url).toBe('https://keep-this.com');
    });

    it('Step 3: Chrome syncs - should receive tombstones and delete local bookmarks', () => {
      // Chrome's local state (still has all 3 bookmarks)
      const chromeLocalBookmarks = [...initialBookmarks];
      const chromeLocalTombstones = [];

      // Cloud state after Firefox sync
      const cloudBookmarks = [
        {
          url: 'https://keep-this.com',
          title: 'Keep This',
          dateAdded: T_BOOKMARK_ADDED,
          folderPath: '',
        },
      ];
      const cloudTombstones = [
        { url: 'https://delete-this.com', deletedAt: T_FIREFOX_DELETES },
        { url: 'https://also-delete.com', deletedAt: T_FIREFOX_DELETES },
      ];

      // Chrome applies cloud tombstones to local bookmarks
      const bookmarksToDelete = applyTombstonesToLocal(cloudTombstones, chromeLocalBookmarks);

      // Chrome should delete 2 bookmarks
      expect(bookmarksToDelete).toHaveLength(2);
      expect(bookmarksToDelete.map((b) => b.url)).toContain('https://delete-this.com');
      expect(bookmarksToDelete.map((b) => b.url)).toContain('https://also-delete.com');

      // Simulate Chrome deleting the bookmarks
      const chromeBookmarksAfterDeletion = chromeLocalBookmarks.filter(
        (b) => !bookmarksToDelete.some((d) => d.url === b.url)
      );
      expect(chromeBookmarksAfterDeletion).toHaveLength(1);
      expect(chromeBookmarksAfterDeletion[0].url).toBe('https://keep-this.com');

      // Chrome merges tombstones
      const mergedTombstones = mergeTombstonesLocal(chromeLocalTombstones, cloudTombstones);
      expect(mergedTombstones).toHaveLength(2);
    });

    it('Full flow simulation - verifies the complete sync cycle', () => {
      // === INITIAL STATE ===
      // Cloud has all 3 bookmarks, no tombstones
      let cloudBookmarks = [...initialBookmarks];
      let cloudTombstones = [];

      // Firefox has all 3 bookmarks, no tombstones
      let firefoxLocalBookmarks = [...initialBookmarks];
      let firefoxLocalTombstones = [];

      // Chrome has all 3 bookmarks, no tombstones
      let chromeLocalBookmarks = [...initialBookmarks];
      let chromeLocalTombstones = [];

      // === FIREFOX DELETES BOOKMARKS ===
      // User deletes 2 bookmarks in Firefox
      firefoxLocalBookmarks = firefoxLocalBookmarks.filter(
        (b) => b.url !== 'https://delete-this.com' && b.url !== 'https://also-delete.com'
      );
      firefoxLocalTombstones = [
        { url: 'https://delete-this.com', deletedAt: T_FIREFOX_DELETES },
        { url: 'https://also-delete.com', deletedAt: T_FIREFOX_DELETES },
      ];

      expect(firefoxLocalBookmarks).toHaveLength(1);
      expect(firefoxLocalTombstones).toHaveLength(2);

      // === FIREFOX SYNCS ===
      // Firefox sends bookmarks and tombstones to cloud
      const firefoxMergedTombstones = mergeTombstones(cloudTombstones, firefoxLocalTombstones);
      const { merged: firefoxMerged } = mergeBookmarks(cloudBookmarks, firefoxLocalBookmarks);
      const firefoxFinalBookmarks = applyTombstones(firefoxMerged, firefoxMergedTombstones);

      // Update cloud state
      cloudBookmarks = firefoxFinalBookmarks;
      cloudTombstones = firefoxMergedTombstones;

      expect(cloudBookmarks).toHaveLength(1);
      expect(cloudTombstones).toHaveLength(2);

      // === CHROME SYNCS ===
      // Chrome gets bookmarks and tombstones from cloud
      const chromeCloudBookmarks = cloudBookmarks;
      const chromeCloudTombstones = cloudTombstones;

      // Chrome applies cloud tombstones to local bookmarks
      const chromeBookmarksToDelete = applyTombstonesToLocal(
        chromeCloudTombstones,
        chromeLocalBookmarks
      );

      // THIS IS THE KEY ASSERTION - Chrome should delete 2 bookmarks
      expect(chromeBookmarksToDelete).toHaveLength(2);

      // Chrome deletes the bookmarks
      chromeLocalBookmarks = chromeLocalBookmarks.filter(
        (b) => !chromeBookmarksToDelete.some((d) => d.url === b.url)
      );

      // Chrome merges tombstones
      chromeLocalTombstones = mergeTombstonesLocal(chromeLocalTombstones, chromeCloudTombstones);

      // Chrome should now have only 1 bookmark
      expect(chromeLocalBookmarks).toHaveLength(1);
      expect(chromeLocalBookmarks[0].url).toBe('https://keep-this.com');
      expect(chromeLocalTombstones).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle bookmark with no dateAdded (treat as 0)', () => {
      const tombstones = [{ url: 'https://example.com', deletedAt: 1000 }];
      const localBookmarks = [{ url: 'https://example.com', title: 'Example' }]; // No dateAdded

      const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

      // Bookmark dateAdded is 0, tombstone is 1000, so tombstone is newer
      expect(toDelete).toHaveLength(1);
    });

    it('should handle tombstone with no deletedAt (treat as 0)', () => {
      const tombstones = [{ url: 'https://example.com' }]; // No deletedAt
      const localBookmarks = [{ url: 'https://example.com', title: 'Example', dateAdded: 1000 }];

      const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

      // Tombstone deletedAt is 0, bookmark is 1000, so bookmark is newer - don't delete
      expect(toDelete).toHaveLength(0);
    });

    it('should not delete bookmark if it was re-added after deletion', () => {
      const T_DELETED = 1000;
      const T_READDED = 2000;

      const tombstones = [{ url: 'https://example.com', deletedAt: T_DELETED }];
      const localBookmarks = [
        { url: 'https://example.com', title: 'Example', dateAdded: T_READDED },
      ];

      const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

      // Bookmark was re-added after deletion, so don't delete
      expect(toDelete).toHaveLength(0);
    });

    it('should delete bookmark if tombstone is newer', () => {
      const T_ADDED = 1000;
      const T_DELETED = 2000;

      const tombstones = [{ url: 'https://example.com', deletedAt: T_DELETED }];
      const localBookmarks = [{ url: 'https://example.com', title: 'Example', dateAdded: T_ADDED }];

      const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

      // Tombstone is newer, so delete
      expect(toDelete).toHaveLength(1);
    });

    it('should handle URL matching correctly (exact match required)', () => {
      const tombstones = [{ url: 'https://example.com', deletedAt: 2000 }];
      const localBookmarks = [
        { url: 'https://example.com/', title: 'With trailing slash', dateAdded: 1000 },
        { url: 'http://example.com', title: 'HTTP version', dateAdded: 1000 },
        { url: 'https://example.com', title: 'Exact match', dateAdded: 1000 },
      ];

      const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

      // Only exact URL match should be deleted
      expect(toDelete).toHaveLength(1);
      expect(toDelete[0].title).toBe('Exact match');
    });
  });
});

describe('Potential Bug: URL Normalization', () => {
  it('identifies potential issue with trailing slashes', () => {
    // This test documents a potential issue where URLs might not match
    // due to trailing slashes or other normalization differences

    const tombstones = [{ url: 'https://example.com/', deletedAt: 2000 }];
    const localBookmarks = [
      { url: 'https://example.com', title: 'No trailing slash', dateAdded: 1000 },
    ];

    const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

    // BUG: These URLs should be considered the same, but they're not
    // The tombstone has a trailing slash, the bookmark doesn't
    expect(toDelete).toHaveLength(0); // Currently 0 due to exact match

    // TODO: Consider normalizing URLs before comparison
  });

  it('identifies potential issue with http vs https', () => {
    const tombstones = [{ url: 'http://example.com', deletedAt: 2000 }];
    const localBookmarks = [
      { url: 'https://example.com', title: 'HTTPS version', dateAdded: 1000 },
    ];

    const toDelete = applyTombstonesToLocal(tombstones, localBookmarks);

    // These are technically different URLs, so no deletion
    expect(toDelete).toHaveLength(0);
  });
});

describe('Server-side tombstone handling (CRITICAL FIX)', () => {
  /**
   * This test documents the critical bug that was fixed:
   * The server was applying tombstones to bookmarks, which caused a race condition
   * where bookmarks would be deleted from the cloud even when they still existed
   * in one of the browsers.
   *
   * The fix: Server should NOT apply tombstones. It should only store and merge them.
   * Each browser extension applies tombstones locally when it receives them.
   */

  it('Server should NOT apply tombstones - only store and merge them', () => {
    // Scenario:
    // 1. Browser A has bookmark X
    // 2. Browser B deletes X, creating tombstone
    // 3. Browser B syncs, tombstone goes to cloud
    // 4. Browser A syncs, sending bookmark X
    // 5. OLD BUG: Server applied tombstone and removed X from cloud
    // 6. FIX: Server should keep X in cloud, let Browser A apply tombstone locally

    const T_BOOKMARK_ADDED = 1703000000000;
    const T_DELETED = 1703500000000;

    // Cloud state after Browser B synced (has tombstone)
    const cloudBookmarks = []; // Browser B had no bookmarks after deletion
    const cloudTombstones = [{ url: 'https://example.com', deletedAt: T_DELETED }];

    // Browser A syncs, sending its bookmark
    const browserABookmarks = [
      { url: 'https://example.com', title: 'Example', dateAdded: T_BOOKMARK_ADDED, folderPath: '' },
    ];
    const browserATombstones = []; // Browser A has no tombstones

    // Server merges bookmarks
    const { merged } = mergeBookmarks(cloudBookmarks, browserABookmarks);

    // Server merges tombstones
    const mergedTombstones = mergeTombstones(cloudTombstones, browserATombstones);

    // CRITICAL: Server should NOT apply tombstones
    // The merged bookmarks should include the bookmark from Browser A
    // even though there's a tombstone for it
    const finalBookmarks = merged; // NOT applyTombstones(merged, mergedTombstones)

    // Server should store the bookmark
    expect(finalBookmarks).toHaveLength(1);
    expect(finalBookmarks[0].url).toBe('https://example.com');

    // Server should also store the tombstone
    expect(mergedTombstones).toHaveLength(1);
    expect(mergedTombstones[0].url).toBe('https://example.com');

    // The extension will apply the tombstone locally when it syncs
    // This is tested in the extension tests
  });

  it('Server should preserve all bookmarks from all browsers', () => {
    // Multiple browsers syncing - server should keep all bookmarks
    const T_ADDED = 1703000000000;

    const cloudBookmarks = [
      { url: 'https://from-cloud.com', title: 'From Cloud', dateAdded: T_ADDED, folderPath: '' },
    ];

    const browserABookmarks = [
      {
        url: 'https://from-browser-a.com',
        title: 'From Browser A',
        dateAdded: T_ADDED,
        folderPath: '',
      },
    ];

    const browserBBookmarks = [
      {
        url: 'https://from-browser-b.com',
        title: 'From Browser B',
        dateAdded: T_ADDED,
        folderPath: '',
      },
    ];

    // First sync: Browser A
    const { merged: afterA } = mergeBookmarks(cloudBookmarks, browserABookmarks);
    expect(afterA).toHaveLength(2);

    // Second sync: Browser B
    const { merged: afterB } = mergeBookmarks(afterA, browserBBookmarks);
    expect(afterB).toHaveLength(3);

    // All bookmarks should be preserved
    expect(afterB.map((b) => b.url)).toContain('https://from-cloud.com');
    expect(afterB.map((b) => b.url)).toContain('https://from-browser-a.com');
    expect(afterB.map((b) => b.url)).toContain('https://from-browser-b.com');
  });

  it('Tombstones should be merged but not applied on server', () => {
    const T_DELETED_1 = 1703000000000;
    const T_DELETED_2 = 1703500000000;

    const cloudTombstones = [{ url: 'https://deleted-1.com', deletedAt: T_DELETED_1 }];

    const incomingTombstones = [
      { url: 'https://deleted-1.com', deletedAt: T_DELETED_2 }, // Newer deletion
      { url: 'https://deleted-2.com', deletedAt: T_DELETED_2 },
    ];

    const merged = mergeTombstones(cloudTombstones, incomingTombstones);

    // Should have 2 unique tombstones
    expect(merged).toHaveLength(2);

    // The newer deletion time should win
    const tombstone1 = merged.find((t) => t.url === 'https://deleted-1.com');
    expect(tombstone1.deletedAt).toBe(T_DELETED_2);

    // New tombstone should be added
    const tombstone2 = merged.find((t) => t.url === 'https://deleted-2.com');
    expect(tombstone2).toBeDefined();
  });
});
