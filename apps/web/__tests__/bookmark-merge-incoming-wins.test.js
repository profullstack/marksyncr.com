/**
 * Tests for server-side bookmark merge: incoming always wins
 *
 * Previously, the server-side merge used dateAdded (creation time) to decide
 * which version of a bookmark to keep when both cloud and incoming had the
 * same URL. Since dateAdded never changes when a user moves or renames a
 * bookmark, this caused local changes to be silently discarded.
 *
 * The fix: incoming bookmarks always win for matching URLs, because the
 * extension already pulled from cloud, merged locally, and pushed. The
 * server should trust the incoming data as the user's latest intended state.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Function under test (copied from route.js with the incoming-always-wins fix)
// ============================================================================

function extractBookmarksFromNested(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const result = [];
  function traverse(obj) {
    if (Array.isArray(obj)) {
      for (const item of obj) traverse(item);
    } else if (obj && typeof obj === 'object') {
      if (obj.url || obj.type === 'folder') {
        result.push(obj);
      }
      if (obj.children) traverse(obj.children);
      if (obj.roots) {
        for (const root of Object.values(obj.roots)) {
          if (root.children) traverse(root.children);
        }
      }
    }
  }
  traverse(data);
  return result;
}

function mergeBookmarks(existingBookmarks, incomingBookmarks) {
  const bookmarkMap = new Map();
  const folderMap = new Map();

  const existingArray = extractBookmarksFromNested(existingBookmarks);
  const incomingArray = Array.isArray(incomingBookmarks) ? incomingBookmarks : [];

  const getFolderKey = (item) => `${item.folderPath || ''}::${item.title || ''}`;

  for (const item of existingArray) {
    if (!item) continue;
    if (item.type === 'folder') {
      const key = getFolderKey(item);
      folderMap.set(key, item);
    } else if (item.url) {
      bookmarkMap.set(item.url, item);
    }
  }

  let added = 0;
  let updated = 0;

  for (const incoming of incomingArray) {
    if (!incoming) continue;

    if (incoming.type === 'folder') {
      const key = getFolderKey(incoming);
      const existing = folderMap.get(key);
      if (!existing) {
        folderMap.set(key, incoming);
        added++;
      } else {
        folderMap.set(key, {
          ...incoming,
          id: existing.id || incoming.id,
        });
        updated++;
      }
    } else if (incoming.url) {
      const existing = bookmarkMap.get(incoming.url);

      if (!existing) {
        bookmarkMap.set(incoming.url, incoming);
        added++;
      } else {
        // Incoming always wins — the extension already merged locally
        bookmarkMap.set(incoming.url, {
          ...incoming,
          id: existing.id || incoming.id,
        });
        updated++;
      }
    }
  }

  const allItems = [...Array.from(bookmarkMap.values()), ...Array.from(folderMap.values())];

  const merged = allItems.sort((a, b) => {
    const aPath = a.folderPath || '';
    const bPath = b.folderPath || '';
    const pathCompare = aPath.localeCompare(bPath);
    if (pathCompare !== 0) return pathCompare;
    return (a.index ?? 0) - (b.index ?? 0);
  });

  return { merged, added, updated };
}

// ============================================================================
// Tests
// ============================================================================

describe('Server-side mergeBookmarks: incoming always wins', () => {
  it('should add new bookmarks from incoming', () => {
    const existing = [
      { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', dateAdded: 1000 },
    ];
    const incoming = [
      { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', dateAdded: 1000 },
      { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', dateAdded: 2000 },
    ];

    const { merged, added } = mergeBookmarks(existing, incoming);

    expect(added).toBe(1);
    expect(merged).toHaveLength(2);
    expect(merged.find((b) => b.url === 'https://b.com')).toBeDefined();
  });

  it('should update existing bookmark with incoming even when dateAdded is the same', () => {
    // This is the KEY fix: previously this would keep the cloud version
    const existing = [
      {
        url: 'https://example.com',
        title: 'Old Title',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1000,
        id: 'cloud-id',
      },
    ];
    const incoming = [
      {
        url: 'https://example.com',
        title: 'New Title',
        folderPath: 'Bookmarks Bar/Work',
        dateAdded: 1000, // same dateAdded!
        id: 'local-id',
      },
    ];

    const { merged, updated } = mergeBookmarks(existing, incoming);

    expect(updated).toBe(1);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('New Title');
    expect(merged[0].folderPath).toBe('Bookmarks Bar/Work');
    // Should preserve existing ID
    expect(merged[0].id).toBe('cloud-id');
  });

  it('should update existing bookmark with incoming even when incoming dateAdded is older', () => {
    // Previously this would keep the cloud version because incoming was "older"
    const existing = [
      {
        url: 'https://example.com',
        title: 'Cloud Title',
        folderPath: 'Bookmarks Bar',
        dateAdded: 2000,
        id: 'cloud-id',
      },
    ];
    const incoming = [
      {
        url: 'https://example.com',
        title: 'Local Title',
        folderPath: 'Bookmarks Bar/Work',
        dateAdded: 1000, // older dateAdded
        id: 'local-id',
      },
    ];

    const { merged, updated } = mergeBookmarks(existing, incoming);

    expect(updated).toBe(1);
    expect(merged).toHaveLength(1);
    // Incoming should win regardless of dateAdded
    expect(merged[0].title).toBe('Local Title');
    expect(merged[0].folderPath).toBe('Bookmarks Bar/Work');
  });

  it('should preserve bookmarks that only exist in cloud (not in incoming)', () => {
    // Bookmarks from other browsers that this browser hasn't seen yet
    const existing = [
      { url: 'https://from-firefox.com', title: 'Firefox BM', folderPath: 'Bookmarks Bar' },
      { url: 'https://shared.com', title: 'Shared', folderPath: 'Bookmarks Bar' },
    ];
    const incoming = [
      { url: 'https://shared.com', title: 'Shared Updated', folderPath: 'Bookmarks Bar' },
      { url: 'https://from-chrome.com', title: 'Chrome BM', folderPath: 'Bookmarks Bar' },
    ];

    const { merged, added } = mergeBookmarks(existing, incoming);

    expect(merged).toHaveLength(3);
    expect(merged.find((b) => b.url === 'https://from-firefox.com')).toBeDefined();
    expect(merged.find((b) => b.url === 'https://from-chrome.com')).toBeDefined();
    expect(merged.find((b) => b.url === 'https://shared.com').title).toBe('Shared Updated');
    expect(added).toBe(1);
  });

  it('should handle bookmark folder move correctly (same dateAdded)', () => {
    // User moved a bookmark to a different folder — dateAdded stays the same
    const existing = [
      {
        url: 'https://work.com',
        title: 'Work Site',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1704067200000,
        index: 0,
      },
    ];
    const incoming = [
      {
        url: 'https://work.com',
        title: 'Work Site',
        folderPath: 'Bookmarks Bar/Work',
        dateAdded: 1704067200000, // same — move doesn't change dateAdded
        index: 0,
      },
    ];

    const { merged } = mergeBookmarks(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].folderPath).toBe('Bookmarks Bar/Work');
  });

  it('should handle bookmark title rename correctly (same dateAdded)', () => {
    const existing = [
      {
        url: 'https://example.com',
        title: 'Old Name',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1000,
      },
    ];
    const incoming = [
      {
        url: 'https://example.com',
        title: 'New Name',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1000,
      },
    ];

    const { merged } = mergeBookmarks(existing, incoming);

    expect(merged[0].title).toBe('New Name');
  });

  it('should handle multiple browsers pushing sequentially (last-write-wins)', () => {
    // Simulate: Chrome pushed, then Firefox pushes
    // Cloud has Chrome's state
    const cloudAfterChrome = [
      {
        url: 'https://shared.com',
        title: 'Chrome Title',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1000,
      },
      {
        url: 'https://chrome-only.com',
        title: 'Chrome Bookmark',
        folderPath: 'Bookmarks Bar',
        dateAdded: 2000,
      },
    ];

    // Firefox pushes its state (it pulled from cloud first, so it has chrome-only.com)
    const firefoxPush = [
      {
        url: 'https://shared.com',
        title: 'Firefox Title',
        folderPath: 'Bookmarks Toolbar',
        dateAdded: 1000,
      },
      {
        url: 'https://chrome-only.com',
        title: 'Chrome Bookmark',
        folderPath: 'Bookmarks Bar',
        dateAdded: 2000,
      },
      {
        url: 'https://firefox-only.com',
        title: 'Firefox Bookmark',
        folderPath: 'Bookmarks Toolbar',
        dateAdded: 3000,
      },
    ];

    const { merged } = mergeBookmarks(cloudAfterChrome, firefoxPush);

    expect(merged).toHaveLength(3);
    // Firefox was last to push, so its title wins for the shared bookmark
    expect(merged.find((b) => b.url === 'https://shared.com').title).toBe('Firefox Title');
    // Both unique bookmarks preserved
    expect(merged.find((b) => b.url === 'https://chrome-only.com')).toBeDefined();
    expect(merged.find((b) => b.url === 'https://firefox-only.com')).toBeDefined();
  });

  it('should preserve existing ID when incoming has different ID', () => {
    const existing = [
      { url: 'https://example.com', title: 'Title', id: 'server-id-1', dateAdded: 1000 },
    ];
    const incoming = [
      { url: 'https://example.com', title: 'Updated', id: 'browser-id-1', dateAdded: 1000 },
    ];

    const { merged } = mergeBookmarks(existing, incoming);

    expect(merged[0].id).toBe('server-id-1');
    expect(merged[0].title).toBe('Updated');
  });

  it('should use incoming ID when existing has no ID', () => {
    const existing = [{ url: 'https://example.com', title: 'Title', dateAdded: 1000 }];
    const incoming = [
      { url: 'https://example.com', title: 'Updated', id: 'browser-id-1', dateAdded: 1000 },
    ];

    const { merged } = mergeBookmarks(existing, incoming);

    expect(merged[0].id).toBe('browser-id-1');
  });

  it('should handle empty existing bookmarks', () => {
    const incoming = [
      { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', dateAdded: 1000 },
      { url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', dateAdded: 2000 },
    ];

    const { merged, added, updated } = mergeBookmarks([], incoming);

    expect(merged).toHaveLength(2);
    expect(added).toBe(2);
    expect(updated).toBe(0);
  });

  it('should handle empty incoming bookmarks (preserves all existing)', () => {
    const existing = [
      { url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', dateAdded: 1000 },
    ];

    const { merged, added, updated } = mergeBookmarks(existing, []);

    expect(merged).toHaveLength(1);
    expect(added).toBe(0);
    expect(updated).toBe(0);
  });
});
