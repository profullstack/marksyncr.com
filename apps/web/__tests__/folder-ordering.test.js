/**
 * Tests for folder ordering preservation in bookmark sync
 * 
 * The issue: Folders need to have their order preserved across sync operations.
 * Previously, only bookmarks had index tracking, but folders also need index
 * to maintain their position within their parent folder.
 * 
 * Solution: Include folder metadata (with index) in the sync data, so that:
 * 1. Folder reordering is detected by checksum changes
 * 2. Folders can be recreated in the correct order during restore
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/**
 * Normalize bookmarks AND folders for checksum comparison
 * This includes folder entries to detect folder reordering
 * 
 * @param {Array} items - Array of bookmarks and folders to normalize
 * @returns {Array} - Normalized items with only comparable fields
 */
function normalizeItemsForChecksum(items) {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => {
    if (item.type === 'folder') {
      // Folder entry
      return {
        type: 'folder',
        title: item.title ?? '',
        folderPath: item.folderPath || '',
        index: item.index ?? 0,
      };
    } else {
      // Bookmark entry
      return {
        type: 'bookmark',
        url: item.url,
        title: item.title ?? '',
        folderPath: item.folderPath || '',
        dateAdded: item.dateAdded || 0,
        index: item.index ?? 0,
      };
    }
  }).sort((a, b) => {
    // Sort by type first (folders before bookmarks for consistent ordering)
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
 * Generate checksum for items (bookmarks + folders)
 */
function generateChecksum(items) {
  const normalized = normalizeItemsForChecksum(items);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Flatten bookmark tree to array, including folder metadata
 * @param {Array} tree - Browser bookmark tree
 * @returns {Array} - Flat array of bookmarks AND folders with ordering information
 */
function flattenBookmarkTreeWithFolders(tree) {
  const items = [];

  function traverse(nodes, parentPath = '') {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeIndex = node.index ?? i;
      
      if (node.url) {
        // It's a bookmark
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
        // It's a folder - add folder metadata
        const folderPath = node.title ? (parentPath ? `${parentPath}/${node.title}` : node.title) : parentPath;
        
        // Only add folder entry if it has a title (skip root nodes)
        if (node.title) {
          items.push({
            type: 'folder',
            id: node.id,
            title: node.title,
            folderPath: parentPath, // Parent path (where this folder lives)
            dateAdded: node.dateAdded,
            index: nodeIndex,
          });
        }
        
        // Recurse into children
        traverse(node.children, folderPath);
      }
    }
  }

  traverse(tree);
  return items;
}

describe('Folder Ordering', () => {
  describe('flattenBookmarkTreeWithFolders', () => {
    it('should include folder entries in the flattened array', () => {
      const tree = [
        {
          id: 'root',
          title: '',
          children: [
            {
              id: 'folder1',
              title: 'Work',
              index: 0,
              children: [
                { id: 'b1', url: 'https://work.com', title: 'Work Site', index: 0 },
              ],
            },
            {
              id: 'folder2',
              title: 'Personal',
              index: 1,
              children: [
                { id: 'b2', url: 'https://personal.com', title: 'Personal Site', index: 0 },
              ],
            },
          ],
        },
      ];

      const items = flattenBookmarkTreeWithFolders(tree);
      
      // Should have 2 folders + 2 bookmarks = 4 items
      expect(items).toHaveLength(4);
      
      // Check folder entries
      const folders = items.filter(i => i.type === 'folder');
      expect(folders).toHaveLength(2);
      expect(folders[0]).toMatchObject({
        type: 'folder',
        title: 'Work',
        folderPath: '',
        index: 0,
      });
      expect(folders[1]).toMatchObject({
        type: 'folder',
        title: 'Personal',
        folderPath: '',
        index: 1,
      });
      
      // Check bookmark entries
      const bookmarks = items.filter(i => i.type === 'bookmark');
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0]).toMatchObject({
        type: 'bookmark',
        url: 'https://work.com',
        folderPath: 'Work',
        index: 0,
      });
    });

    it('should track nested folder indices', () => {
      const tree = [
        {
          id: 'root',
          title: '',
          children: [
            {
              id: 'folder1',
              title: 'Parent',
              index: 0,
              children: [
                {
                  id: 'subfolder1',
                  title: 'Child A',
                  index: 0,
                  children: [],
                },
                {
                  id: 'subfolder2',
                  title: 'Child B',
                  index: 1,
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      const items = flattenBookmarkTreeWithFolders(tree);
      const folders = items.filter(i => i.type === 'folder');
      
      expect(folders).toHaveLength(3);
      
      // Parent folder
      expect(folders.find(f => f.title === 'Parent')).toMatchObject({
        folderPath: '',
        index: 0,
      });
      
      // Child folders
      expect(folders.find(f => f.title === 'Child A')).toMatchObject({
        folderPath: 'Parent',
        index: 0,
      });
      expect(folders.find(f => f.title === 'Child B')).toMatchObject({
        folderPath: 'Parent',
        index: 1,
      });
    });
  });

  describe('normalizeItemsForChecksum', () => {
    it('should normalize both bookmarks and folders', () => {
      const items = [
        { type: 'bookmark', url: 'https://example.com', title: 'Example', folderPath: 'Work', index: 0, dateAdded: 1000 },
        { type: 'folder', title: 'Work', folderPath: '', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: '', index: 1 },
      ];

      const normalized = normalizeItemsForChecksum(items);
      
      expect(normalized).toHaveLength(3);
      
      // Folders should come first (sorted by type)
      expect(normalized[0].type).toBe('folder');
      expect(normalized[1].type).toBe('folder');
      expect(normalized[2].type).toBe('bookmark');
    });

    it('should sort folders by folderPath then index', () => {
      const items = [
        { type: 'folder', title: 'B', folderPath: '', index: 1 },
        { type: 'folder', title: 'A', folderPath: '', index: 0 },
        { type: 'folder', title: 'C', folderPath: 'A', index: 0 },
      ];

      const normalized = normalizeItemsForChecksum(items);
      
      // Should be sorted: A (path='', index=0), B (path='', index=1), C (path='A', index=0)
      expect(normalized[0].title).toBe('A');
      expect(normalized[1].title).toBe('B');
      expect(normalized[2].title).toBe('C');
    });
  });

  describe('Checksum with folder ordering', () => {
    it('should produce different checksums when folder order changes', () => {
      const items1 = [
        { type: 'folder', title: 'Work', folderPath: '', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: '', index: 1 },
        { type: 'bookmark', url: 'https://example.com', title: 'Example', folderPath: 'Work', index: 0, dateAdded: 1000 },
      ];

      const items2 = [
        { type: 'folder', title: 'Work', folderPath: '', index: 1 }, // Changed index
        { type: 'folder', title: 'Personal', folderPath: '', index: 0 }, // Changed index
        { type: 'bookmark', url: 'https://example.com', title: 'Example', folderPath: 'Work', index: 0, dateAdded: 1000 },
      ];

      const checksum1 = generateChecksum(items1);
      const checksum2 = generateChecksum(items2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should produce same checksum when folder order is the same', () => {
      const items1 = [
        { type: 'folder', title: 'Work', folderPath: '', index: 0 },
        { type: 'folder', title: 'Personal', folderPath: '', index: 1 },
      ];

      const items2 = [
        { type: 'folder', title: 'Personal', folderPath: '', index: 1 }, // Different array order
        { type: 'folder', title: 'Work', folderPath: '', index: 0 },
      ];

      const checksum1 = generateChecksum(items1);
      const checksum2 = generateChecksum(items2);

      // Should be same because normalization sorts them
      expect(checksum1).toBe(checksum2);
    });

    it('should detect nested folder reordering', () => {
      const items1 = [
        { type: 'folder', title: 'Parent', folderPath: '', index: 0 },
        { type: 'folder', title: 'Child A', folderPath: 'Parent', index: 0 },
        { type: 'folder', title: 'Child B', folderPath: 'Parent', index: 1 },
      ];

      const items2 = [
        { type: 'folder', title: 'Parent', folderPath: '', index: 0 },
        { type: 'folder', title: 'Child A', folderPath: 'Parent', index: 1 }, // Swapped
        { type: 'folder', title: 'Child B', folderPath: 'Parent', index: 0 }, // Swapped
      ];

      const checksum1 = generateChecksum(items1);
      const checksum2 = generateChecksum(items2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Mixed bookmark and folder ordering', () => {
    it('should detect when a folder moves before/after bookmarks', () => {
      // Scenario: Folder at index 0, bookmark at index 1
      const items1 = [
        { type: 'folder', title: 'Folder', folderPath: '', index: 0 },
        { type: 'bookmark', url: 'https://example.com', title: 'Example', folderPath: '', index: 1, dateAdded: 1000 },
      ];

      // Scenario: Bookmark at index 0, folder at index 1
      const items2 = [
        { type: 'folder', title: 'Folder', folderPath: '', index: 1 },
        { type: 'bookmark', url: 'https://example.com', title: 'Example', folderPath: '', index: 0, dateAdded: 1000 },
      ];

      const checksum1 = generateChecksum(items1);
      const checksum2 = generateChecksum(items2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty folder array', () => {
      const items = [];
      const normalized = normalizeItemsForChecksum(items);
      expect(normalized).toEqual([]);
    });

    it('should handle folders without index', () => {
      const items = [
        { type: 'folder', title: 'Work', folderPath: '' },
        { type: 'folder', title: 'Personal', folderPath: '' },
      ];

      const normalized = normalizeItemsForChecksum(items);
      
      // Should default to index 0
      expect(normalized[0].index).toBe(0);
      expect(normalized[1].index).toBe(0);
    });

    it('should handle bookmarks-only array (backwards compatibility)', () => {
      const items = [
        { url: 'https://a.com', title: 'A', folderPath: '', index: 0, dateAdded: 1000 },
        { url: 'https://b.com', title: 'B', folderPath: '', index: 1, dateAdded: 2000 },
      ];

      const normalized = normalizeItemsForChecksum(items);
      
      // Should treat as bookmarks (no type field defaults to bookmark)
      expect(normalized).toHaveLength(2);
      expect(normalized[0].type).toBe('bookmark');
      expect(normalized[1].type).toBe('bookmark');
    });
  });
});
