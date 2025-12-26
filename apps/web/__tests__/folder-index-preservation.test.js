/**
 * Tests for folder index preservation during sync
 * 
 * BUG: When a folder is moved from position 3 to the last position,
 * the index value should be updated when syncing. However, after sync
 * the folder goes back to position 3. This happens because the
 * normalizeItemsForChecksum function sorts folders before bookmarks,
 * ignoring the actual index values.
 * 
 * The fix: Remove type-based sorting from normalizeItemsForChecksum.
 * Items should be sorted ONLY by folderPath and index, preserving
 * the interleaved order of folders and bookmarks.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * BUGGY VERSION: Sorts folders before bookmarks (breaks index preservation)
 */
function normalizeItemsForChecksumBuggy(items) {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => {
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
  }).sort((a, b) => {
    // BUG: Sort by type first (folders before bookmarks)
    // This breaks the user's intended order!
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    // Then by folderPath
    const folderCompare = a.folderPath.localeCompare(b.folderPath);
    if (folderCompare !== 0) return folderCompare;
    // Then by index within the folder
    return (a.index ?? 0) - (b.index ?? 0);
  });
}

/**
 * FIXED VERSION: Sorts only by folderPath and index (preserves interleaved order)
 */
function normalizeItemsForChecksumFixed(items) {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => {
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
  }).sort((a, b) => {
    // FIXED: Sort by folderPath first, then by index
    // This preserves the interleaved order of folders and bookmarks
    const folderCompare = a.folderPath.localeCompare(b.folderPath);
    if (folderCompare !== 0) return folderCompare;
    // Then by index within the folder
    return (a.index ?? 0) - (b.index ?? 0);
  });
}

function generateChecksum(items, normalizeFn) {
  const normalized = normalizeFn(items);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

describe('Folder Index Preservation Bug', () => {
  describe('Bug reproduction: folder moved from position 3 to last position', () => {
    // Scenario: User has bookmarks bar with:
    // 0: Bookmark A
    // 1: Bookmark B
    // 2: Folder X (user wants to move this to the end)
    // 3: Bookmark C
    // 4: Bookmark D
    
    const itemsBeforeMove = [
      { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      { type: 'folder', title: 'Folder X', folderPath: 'Bookmarks Bar', index: 2 },
      { type: 'bookmark', url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Bar', index: 3 },
      { type: 'bookmark', url: 'https://d.com', title: 'D', folderPath: 'Bookmarks Bar', index: 4 },
    ];
    
    // After user moves Folder X to the end:
    // 0: Bookmark A
    // 1: Bookmark B
    // 2: Bookmark C (moved up)
    // 3: Bookmark D (moved up)
    // 4: Folder X (moved to end)
    
    const itemsAfterMove = [
      { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: 'Bookmarks Bar', index: 0 },
      { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: 'Bookmarks Bar', index: 1 },
      { type: 'bookmark', url: 'https://c.com', title: 'C', folderPath: 'Bookmarks Bar', index: 2 },
      { type: 'bookmark', url: 'https://d.com', title: 'D', folderPath: 'Bookmarks Bar', index: 3 },
      { type: 'folder', title: 'Folder X', folderPath: 'Bookmarks Bar', index: 4 },
    ];

    it('BUGGY: should detect the move but produces wrong order', () => {
      const checksumBefore = generateChecksum(itemsBeforeMove, normalizeItemsForChecksumBuggy);
      const checksumAfter = generateChecksum(itemsAfterMove, normalizeItemsForChecksumBuggy);
      
      // The checksums should be different because the folder moved
      expect(checksumBefore).not.toBe(checksumAfter);
      
      // But the buggy version puts folders first, breaking the order
      const normalizedBefore = normalizeItemsForChecksumBuggy(itemsBeforeMove);
      const normalizedAfter = normalizeItemsForChecksumBuggy(itemsAfterMove);
      
      // BUG: In both cases, the folder appears first (index 0 in normalized array)
      // even though the user moved it to index 4
      expect(normalizedBefore[0].type).toBe('folder');
      expect(normalizedAfter[0].type).toBe('folder');
      
      // This is the bug - folder is always first regardless of actual index
    });

    it('FIXED: should preserve the interleaved order after move', () => {
      const normalizedBefore = normalizeItemsForChecksumFixed(itemsBeforeMove);
      const normalizedAfter = normalizeItemsForChecksumFixed(itemsAfterMove);
      
      // Before move: folder should be at position 2 (index 2)
      expect(normalizedBefore[2].type).toBe('folder');
      expect(normalizedBefore[2].title).toBe('Folder X');
      expect(normalizedBefore[2].index).toBe(2);
      
      // After move: folder should be at position 4 (index 4)
      expect(normalizedAfter[4].type).toBe('folder');
      expect(normalizedAfter[4].title).toBe('Folder X');
      expect(normalizedAfter[4].index).toBe(4);
    });

    it('FIXED: checksums should differ when folder is moved', () => {
      const checksumBefore = generateChecksum(itemsBeforeMove, normalizeItemsForChecksumFixed);
      const checksumAfter = generateChecksum(itemsAfterMove, normalizeItemsForChecksumFixed);
      
      // Checksums should be different because the order changed
      expect(checksumBefore).not.toBe(checksumAfter);
    });
  });

  describe('Edge case: multiple folders interleaved with bookmarks', () => {
    const items = [
      { type: 'bookmark', url: 'https://1.com', title: '1', folderPath: '', index: 0 },
      { type: 'folder', title: 'Folder A', folderPath: '', index: 1 },
      { type: 'bookmark', url: 'https://2.com', title: '2', folderPath: '', index: 2 },
      { type: 'folder', title: 'Folder B', folderPath: '', index: 3 },
      { type: 'bookmark', url: 'https://3.com', title: '3', folderPath: '', index: 4 },
    ];

    it('BUGGY: puts all folders before all bookmarks', () => {
      const normalized = normalizeItemsForChecksumBuggy(items);
      
      // Bug: folders are grouped together at the start
      expect(normalized[0].type).toBe('folder');
      expect(normalized[1].type).toBe('folder');
      expect(normalized[2].type).toBe('bookmark');
      expect(normalized[3].type).toBe('bookmark');
      expect(normalized[4].type).toBe('bookmark');
    });

    it('FIXED: preserves interleaved order', () => {
      const normalized = normalizeItemsForChecksumFixed(items);
      
      // Fixed: order is preserved based on index
      expect(normalized[0].type).toBe('bookmark');
      expect(normalized[0].title).toBe('1');
      
      expect(normalized[1].type).toBe('folder');
      expect(normalized[1].title).toBe('Folder A');
      
      expect(normalized[2].type).toBe('bookmark');
      expect(normalized[2].title).toBe('2');
      
      expect(normalized[3].type).toBe('folder');
      expect(normalized[3].title).toBe('Folder B');
      
      expect(normalized[4].type).toBe('bookmark');
      expect(normalized[4].title).toBe('3');
    });
  });

  describe('Checksum consistency across browsers', () => {
    // Same items but in different array order (as might come from different browsers)
    const itemsFromBrowserA = [
      { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: '', index: 0 },
      { type: 'folder', title: 'Work', folderPath: '', index: 1 },
      { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: '', index: 2 },
    ];
    
    const itemsFromBrowserB = [
      { type: 'folder', title: 'Work', folderPath: '', index: 1 },
      { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: '', index: 2 },
      { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: '', index: 0 },
    ];

    it('FIXED: produces same checksum regardless of input array order', () => {
      const checksumA = generateChecksum(itemsFromBrowserA, normalizeItemsForChecksumFixed);
      const checksumB = generateChecksum(itemsFromBrowserB, normalizeItemsForChecksumFixed);
      
      // Same logical order should produce same checksum
      expect(checksumA).toBe(checksumB);
    });

    it('FIXED: normalized order is consistent', () => {
      const normalizedA = normalizeItemsForChecksumFixed(itemsFromBrowserA);
      const normalizedB = normalizeItemsForChecksumFixed(itemsFromBrowserB);
      
      // Both should produce the same normalized order
      expect(normalizedA).toEqual(normalizedB);
      
      // Order should be: A (index 0), Work (index 1), B (index 2)
      expect(normalizedA[0].title).toBe('A');
      expect(normalizedA[1].title).toBe('Work');
      expect(normalizedA[2].title).toBe('B');
    });
  });

  describe('Nested folders with different parent paths', () => {
    const items = [
      { type: 'folder', title: 'Parent', folderPath: '', index: 0 },
      { type: 'bookmark', url: 'https://root.com', title: 'Root Bookmark', folderPath: '', index: 1 },
      { type: 'folder', title: 'Child', folderPath: 'Parent', index: 0 },
      { type: 'bookmark', url: 'https://child.com', title: 'Child Bookmark', folderPath: 'Parent', index: 1 },
    ];

    it('FIXED: sorts by folderPath first, then by index', () => {
      const normalized = normalizeItemsForChecksumFixed(items);
      
      // Root level items (folderPath='') come first, sorted by index
      expect(normalized[0].folderPath).toBe('');
      expect(normalized[0].index).toBe(0);
      expect(normalized[0].title).toBe('Parent');
      
      expect(normalized[1].folderPath).toBe('');
      expect(normalized[1].index).toBe(1);
      expect(normalized[1].title).toBe('Root Bookmark');
      
      // Parent folder items come next, sorted by index
      expect(normalized[2].folderPath).toBe('Parent');
      expect(normalized[2].index).toBe(0);
      expect(normalized[2].title).toBe('Child');
      
      expect(normalized[3].folderPath).toBe('Parent');
      expect(normalized[3].index).toBe(1);
      expect(normalized[3].title).toBe('Child Bookmark');
    });
  });
});
