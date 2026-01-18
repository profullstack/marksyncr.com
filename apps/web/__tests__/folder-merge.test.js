/**
 * Tests for folder merge functionality in bookmarks API
 *
 * These tests verify that:
 * 1. Folders are properly merged (not just bookmarks)
 * 2. Folder index/position is preserved during merge
 * 3. Incoming folder data wins over existing (to preserve order changes)
 * 4. Folders use folderPath + title as unique key
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the merge function from the bookmarks route
// We'll test the logic directly

/**
 * Merge incoming bookmarks and folders with existing cloud data
 * This is a copy of the function from route.js for testing
 */
function mergeBookmarks(existingBookmarks, incomingBookmarks) {
  const bookmarkMap = new Map();
  const folderMap = new Map();

  const existingArray = Array.isArray(existingBookmarks) ? existingBookmarks : [];
  const incomingArray = Array.isArray(incomingBookmarks) ? incomingBookmarks : [];

  const getFolderKey = (item) => `${item.folderPath || ''}::${item.title || ''}`;

  // Add existing items to maps
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

  // Merge incoming items
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
  }

  const merged = [...Array.from(bookmarkMap.values()), ...Array.from(folderMap.values())];

  return {
    merged,
    added,
    updated,
  };
}

describe('Folder Merge Logic', () => {
  describe('mergeBookmarks with folders', () => {
    it('should add new folders from incoming data', () => {
      const existing = [];
      const incoming = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.merged).toHaveLength(2);
      expect(result.merged.find((f) => f.title === 'Work')).toBeDefined();
      expect(result.merged.find((f) => f.title === 'Personal')).toBeDefined();
    });

    it('should update existing folders with incoming data (incoming wins)', () => {
      const existing = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0, id: 'folder-1' },
      ];
      const incoming = [
        {
          type: 'folder',
          title: 'Work',
          folderPath: 'Bookmarks Bar',
          index: 5,
          id: 'folder-1-new',
        },
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0].index).toBe(5); // Incoming index wins
      expect(result.merged[0].id).toBe('folder-1'); // Original ID preserved
    });

    it('should use folderPath + title as unique key for folders', () => {
      const existing = [{ type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 }];
      const incoming = [
        { type: 'folder', title: 'Work', folderPath: 'Other Bookmarks', index: 0 }, // Different path
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.added).toBe(1); // New folder (different path)
      expect(result.updated).toBe(0);
      expect(result.merged).toHaveLength(2);
    });

    it('should handle mixed bookmarks and folders', () => {
      const existing = [
        {
          type: 'bookmark',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          index: 0,
          dateAdded: 1000,
        },
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 1 },
      ];
      const incoming = [
        {
          type: 'bookmark',
          url: 'https://new.com',
          title: 'New',
          folderPath: 'Bookmarks Bar',
          index: 2,
          dateAdded: 2000,
        },
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 3 }, // Updated index
        { type: 'folder', title: 'Personal', folderPath: 'Bookmarks Bar', index: 4 }, // New folder
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.added).toBe(2); // New bookmark + new folder
      expect(result.updated).toBe(1); // Updated Work folder
      expect(result.merged).toHaveLength(4);

      const workFolder = result.merged.find((f) => f.type === 'folder' && f.title === 'Work');
      expect(workFolder.index).toBe(3); // Updated index
    });

    it('should preserve folder index when updating', () => {
      const existing = [
        { type: 'folder', title: 'Folder A', folderPath: 'Bookmarks Bar', index: 0 },
        { type: 'folder', title: 'Folder B', folderPath: 'Bookmarks Bar', index: 1 },
        { type: 'folder', title: 'Folder C', folderPath: 'Bookmarks Bar', index: 2 },
      ];
      const incoming = [
        { type: 'folder', title: 'Folder A', folderPath: 'Bookmarks Bar', index: 2 }, // Moved to end
        { type: 'folder', title: 'Folder B', folderPath: 'Bookmarks Bar', index: 0 }, // Moved to front
        { type: 'folder', title: 'Folder C', folderPath: 'Bookmarks Bar', index: 1 }, // Moved to middle
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.updated).toBe(3);

      const folderA = result.merged.find((f) => f.title === 'Folder A');
      const folderB = result.merged.find((f) => f.title === 'Folder B');
      const folderC = result.merged.find((f) => f.title === 'Folder C');

      expect(folderA.index).toBe(2);
      expect(folderB.index).toBe(0);
      expect(folderC.index).toBe(1);
    });

    it('should handle nested folders correctly', () => {
      const existing = [
        { type: 'folder', title: 'Parent', folderPath: 'Bookmarks Bar', index: 0 },
        { type: 'folder', title: 'Child', folderPath: 'Bookmarks Bar/Parent', index: 0 },
      ];
      const incoming = [
        { type: 'folder', title: 'Parent', folderPath: 'Bookmarks Bar', index: 5 }, // Parent moved
        { type: 'folder', title: 'Child', folderPath: 'Bookmarks Bar/Parent', index: 0 }, // Child unchanged
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.updated).toBe(2);

      const parent = result.merged.find(
        (f) => f.title === 'Parent' && f.folderPath === 'Bookmarks Bar'
      );
      const child = result.merged.find((f) => f.title === 'Child');

      expect(parent.index).toBe(5);
      expect(child.index).toBe(0);
    });

    it('should not lose folders when merging', () => {
      const existing = [
        { type: 'folder', title: 'Existing Folder', folderPath: 'Bookmarks Bar', index: 0 },
        {
          type: 'bookmark',
          url: 'https://existing.com',
          title: 'Existing',
          folderPath: 'Bookmarks Bar',
          index: 1,
          dateAdded: 1000,
        },
      ];
      const incoming = [
        {
          type: 'bookmark',
          url: 'https://new.com',
          title: 'New',
          folderPath: 'Bookmarks Bar',
          index: 2,
          dateAdded: 2000,
        },
      ];

      const result = mergeBookmarks(existing, incoming);

      // Existing folder should still be there
      const existingFolder = result.merged.find(
        (f) => f.type === 'folder' && f.title === 'Existing Folder'
      );
      expect(existingFolder).toBeDefined();
      expect(result.merged).toHaveLength(3); // 2 bookmarks + 1 folder
    });

    it('should handle empty incoming data', () => {
      const existing = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 },
        {
          type: 'bookmark',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          index: 1,
          dateAdded: 1000,
        },
      ];
      const incoming = [];

      const result = mergeBookmarks(existing, incoming);

      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.merged).toHaveLength(2);
    });

    it('should handle empty existing data', () => {
      const existing = [];
      const incoming = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 },
        {
          type: 'bookmark',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          index: 1,
          dateAdded: 1000,
        },
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.merged).toHaveLength(2);
    });

    it('should handle folders without type field (backwards compatibility)', () => {
      const existing = [
        { title: 'Old Folder', folderPath: 'Bookmarks Bar', index: 0 }, // No type field
      ];
      const incoming = [
        { type: 'folder', title: 'New Folder', folderPath: 'Bookmarks Bar', index: 1 },
      ];

      const result = mergeBookmarks(existing, incoming);

      // Old folder without type should be treated as bookmark (no URL, so skipped)
      // New folder should be added
      expect(result.added).toBe(1);
      expect(result.merged).toHaveLength(1);
    });

    it('should preserve original ID when updating folder', () => {
      const existing = [
        {
          type: 'folder',
          title: 'Work',
          folderPath: 'Bookmarks Bar',
          index: 0,
          id: 'original-id-123',
        },
      ];
      const incoming = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 5, id: 'new-id-456' },
      ];

      const result = mergeBookmarks(existing, incoming);

      expect(result.merged[0].id).toBe('original-id-123');
      expect(result.merged[0].index).toBe(5);
    });
  });

  describe('folder key generation', () => {
    it('should generate unique keys for folders with same title but different paths', () => {
      const getFolderKey = (item) => `${item.folderPath || ''}::${item.title || ''}`;

      const folder1 = { title: 'Work', folderPath: 'Bookmarks Bar' };
      const folder2 = { title: 'Work', folderPath: 'Other Bookmarks' };
      const folder3 = { title: 'Work', folderPath: 'Bookmarks Bar/Projects' };

      expect(getFolderKey(folder1)).toBe('Bookmarks Bar::Work');
      expect(getFolderKey(folder2)).toBe('Other Bookmarks::Work');
      expect(getFolderKey(folder3)).toBe('Bookmarks Bar/Projects::Work');

      // All keys should be different
      expect(getFolderKey(folder1)).not.toBe(getFolderKey(folder2));
      expect(getFolderKey(folder1)).not.toBe(getFolderKey(folder3));
      expect(getFolderKey(folder2)).not.toBe(getFolderKey(folder3));
    });

    it('should handle empty folderPath', () => {
      const getFolderKey = (item) => `${item.folderPath || ''}::${item.title || ''}`;

      const folder = { title: 'Root Folder', folderPath: '' };
      expect(getFolderKey(folder)).toBe('::Root Folder');
    });

    it('should handle undefined folderPath', () => {
      const getFolderKey = (item) => `${item.folderPath || ''}::${item.title || ''}`;

      const folder = { title: 'Orphan Folder' };
      expect(getFolderKey(folder)).toBe('::Orphan Folder');
    });
  });
});

describe('Folder Index Preservation', () => {
  it('should detect folder order changes via different indices', () => {
    const existing = [
      { type: 'folder', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      { type: 'folder', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
    ];
    const incoming = [
      { type: 'folder', title: 'B', folderPath: 'Bookmarks Bar', index: 0 }, // B moved to front
      { type: 'folder', title: 'A', folderPath: 'Bookmarks Bar', index: 1 }, // A moved to back
    ];

    const result = mergeBookmarks(existing, incoming);

    const folderA = result.merged.find((f) => f.title === 'A');
    const folderB = result.merged.find((f) => f.title === 'B');

    expect(folderA.index).toBe(1);
    expect(folderB.index).toBe(0);
  });

  it('should handle folder moved to end of list', () => {
    const existing = [
      { type: 'folder', title: 'First', folderPath: 'Bookmarks Bar', index: 0 },
      {
        type: 'bookmark',
        url: 'https://a.com',
        title: 'A',
        folderPath: 'Bookmarks Bar',
        index: 1,
        dateAdded: 1000,
      },
      {
        type: 'bookmark',
        url: 'https://b.com',
        title: 'B',
        folderPath: 'Bookmarks Bar',
        index: 2,
        dateAdded: 1000,
      },
    ];
    const incoming = [
      {
        type: 'bookmark',
        url: 'https://a.com',
        title: 'A',
        folderPath: 'Bookmarks Bar',
        index: 0,
        dateAdded: 2000,
      },
      {
        type: 'bookmark',
        url: 'https://b.com',
        title: 'B',
        folderPath: 'Bookmarks Bar',
        index: 1,
        dateAdded: 2000,
      },
      { type: 'folder', title: 'First', folderPath: 'Bookmarks Bar', index: 2 }, // Moved to end
    ];

    const result = mergeBookmarks(existing, incoming);

    const folder = result.merged.find((f) => f.type === 'folder' && f.title === 'First');
    expect(folder.index).toBe(2);
  });
});
