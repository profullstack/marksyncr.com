/**
 * Tests for checksum normalization functionality
 * Ensures consistent checksums between extension and server
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Normalize bookmarks for checksum comparison
 * This is a copy of the server-side function for testing
 *
 * IMPORTANT: We include index to detect order changes within folders.
 * We sort by folderPath + index to ensure consistent ordering that
 * reflects the actual bookmark order in the browser.
 *
 * @param {Array} bookmarks - Array of bookmarks to normalize
 * @returns {Array} - Normalized bookmarks with only comparable fields
 */
function normalizeBookmarksForChecksum(bookmarks) {
  if (!Array.isArray(bookmarks)) return [];
  return bookmarks.map(b => ({
    url: b.url,
    title: b.title ?? '',
    folderPath: b.folderPath || b.folder_path || '',
    dateAdded: b.dateAdded || 0,
    // Include index to detect order changes within folders
    index: b.index ?? 0,
  })).sort((a, b) => {
    // Sort by folderPath first, then by index within the folder
    // This preserves the actual bookmark order
    const folderCompare = a.folderPath.localeCompare(b.folderPath);
    if (folderCompare !== 0) return folderCompare;
    return (a.index ?? 0) - (b.index ?? 0);
  });
}

/**
 * Generate checksum for bookmark data
 * This is a copy of the server-side function for testing
 */
function generateChecksum(data) {
  const normalized = normalizeBookmarksForChecksum(data);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

describe('Checksum Normalization', () => {
  describe('normalizeBookmarksForChecksum', () => {
    it('should extract only comparable fields including index', () => {
      const bookmarks = [
        {
          id: 'browser-id-123',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          dateAdded: 1700000000000,
          index: 5,
          source: 'chrome',
          extraField: 'should be ignored',
        },
      ];

      const normalized = normalizeBookmarksForChecksum(bookmarks);

      expect(normalized).toHaveLength(1);
      expect(normalized[0]).toEqual({
        url: 'https://example.com',
        title: 'Example',
        folderPath: 'Bookmarks Bar',
        dateAdded: 1700000000000,
        index: 5, // index is now included for order detection
      });
      expect(normalized[0]).not.toHaveProperty('id');
      expect(normalized[0]).not.toHaveProperty('source');
      expect(normalized[0]).not.toHaveProperty('extraField');
    });

    it('should sort bookmarks by folderPath then index for consistent ordering', () => {
      const bookmarks = [
        { url: 'https://zebra.com', title: 'Zebra', folderPath: 'Folder A', dateAdded: 1, index: 2 },
        { url: 'https://apple.com', title: 'Apple', folderPath: 'Folder A', dateAdded: 2, index: 0 },
        { url: 'https://mango.com', title: 'Mango', folderPath: 'Folder A', dateAdded: 3, index: 1 },
        { url: 'https://banana.com', title: 'Banana', folderPath: 'Folder B', dateAdded: 4, index: 0 },
      ];

      const normalized = normalizeBookmarksForChecksum(bookmarks);

      // Should be sorted by folderPath first, then by index within folder
      expect(normalized[0].url).toBe('https://apple.com'); // Folder A, index 0
      expect(normalized[1].url).toBe('https://mango.com'); // Folder A, index 1
      expect(normalized[2].url).toBe('https://zebra.com'); // Folder A, index 2
      expect(normalized[3].url).toBe('https://banana.com'); // Folder B, index 0
    });

    it('should handle empty title with empty string', () => {
      const bookmarks = [
        { url: 'https://example.com', title: null, dateAdded: 1 },
        { url: 'https://test.com', title: undefined, dateAdded: 2 },
        { url: 'https://other.com', dateAdded: 3 },
      ];

      const normalized = normalizeBookmarksForChecksum(bookmarks);

      expect(normalized[0].title).toBe('');
      expect(normalized[1].title).toBe('');
      expect(normalized[2].title).toBe('');
    });

    it('should handle both folderPath and folder_path', () => {
      const bookmarks = [
        { url: 'https://a.com', folderPath: 'Path A', dateAdded: 1, index: 0 },
        { url: 'https://b.com', folder_path: 'Path B', dateAdded: 2, index: 0 },
        { url: 'https://c.com', dateAdded: 3, index: 0 },
      ];

      const normalized = normalizeBookmarksForChecksum(bookmarks);

      // Sorted by folderPath then index: '' < 'Path A' < 'Path B'
      expect(normalized[0].folderPath).toBe(''); // Empty string sorts first
      expect(normalized[1].folderPath).toBe('Path A');
      expect(normalized[2].folderPath).toBe('Path B');
    });

    it('should handle missing dateAdded with 0', () => {
      const bookmarks = [
        { url: 'https://example.com', title: 'Test' },
      ];

      const normalized = normalizeBookmarksForChecksum(bookmarks);

      expect(normalized[0].dateAdded).toBe(0);
    });

    it('should return empty array for non-array input', () => {
      expect(normalizeBookmarksForChecksum(null)).toEqual([]);
      expect(normalizeBookmarksForChecksum(undefined)).toEqual([]);
      expect(normalizeBookmarksForChecksum('string')).toEqual([]);
      expect(normalizeBookmarksForChecksum({})).toEqual([]);
    });

    it('should return empty array for empty array input', () => {
      expect(normalizeBookmarksForChecksum([])).toEqual([]);
    });
  });

  describe('generateChecksum', () => {
    it('should generate consistent checksum for same data', () => {
      const bookmarks = [
        { url: 'https://example.com', title: 'Example', dateAdded: 1700000000000 },
      ];

      const checksum1 = generateChecksum(bookmarks);
      const checksum2 = generateChecksum(bookmarks);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate same checksum regardless of input array order when same folder and index', () => {
      // Bookmarks in different folders with same index should produce same checksum
      // regardless of input array order (sorted by folderPath then index)
      const bookmarks1 = [
        { url: 'https://zebra.com', title: 'Zebra', folderPath: 'Folder B', dateAdded: 1, index: 0 },
        { url: 'https://apple.com', title: 'Apple', folderPath: 'Folder A', dateAdded: 2, index: 0 },
      ];

      const bookmarks2 = [
        { url: 'https://apple.com', title: 'Apple', folderPath: 'Folder A', dateAdded: 2, index: 0 },
        { url: 'https://zebra.com', title: 'Zebra', folderPath: 'Folder B', dateAdded: 1, index: 0 },
      ];

      const checksum1 = generateChecksum(bookmarks1);
      const checksum2 = generateChecksum(bookmarks2);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksum when bookmark order changes within folder', () => {
      // Same bookmarks but different order within the same folder
      const bookmarks1 = [
        { url: 'https://apple.com', title: 'Apple', folderPath: 'Folder A', dateAdded: 1, index: 0 },
        { url: 'https://zebra.com', title: 'Zebra', folderPath: 'Folder A', dateAdded: 2, index: 1 },
      ];

      const bookmarks2 = [
        { url: 'https://zebra.com', title: 'Zebra', folderPath: 'Folder A', dateAdded: 2, index: 0 },
        { url: 'https://apple.com', title: 'Apple', folderPath: 'Folder A', dateAdded: 1, index: 1 },
      ];

      const checksum1 = generateChecksum(bookmarks1);
      const checksum2 = generateChecksum(bookmarks2);

      // Checksums should be different because the order (index) changed
      expect(checksum1).not.toBe(checksum2);
    });

    it('should generate same checksum regardless of extra fields (excluding index)', () => {
      const bookmarksWithExtras = [
        {
          id: 'browser-123',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bar',
          dateAdded: 1700000000000,
          index: 5,
          source: 'chrome',
        },
      ];

      const bookmarksMinimal = [
        {
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bar',
          dateAdded: 1700000000000,
          index: 5, // index must match since it's now part of checksum
        },
      ];

      const checksum1 = generateChecksum(bookmarksWithExtras);
      const checksum2 = generateChecksum(bookmarksMinimal);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksum for different data', () => {
      const bookmarks1 = [
        { url: 'https://example.com', title: 'Example', dateAdded: 1 },
      ];

      const bookmarks2 = [
        { url: 'https://different.com', title: 'Different', dateAdded: 1 },
      ];

      const checksum1 = generateChecksum(bookmarks1);
      const checksum2 = generateChecksum(bookmarks2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should generate different checksum when title changes', () => {
      const bookmarks1 = [
        { url: 'https://example.com', title: 'Original', dateAdded: 1 },
      ];

      const bookmarks2 = [
        { url: 'https://example.com', title: 'Changed', dateAdded: 1 },
      ];

      const checksum1 = generateChecksum(bookmarks1);
      const checksum2 = generateChecksum(bookmarks2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should generate different checksum when folderPath changes', () => {
      const bookmarks1 = [
        { url: 'https://example.com', title: 'Test', folderPath: 'Folder A', dateAdded: 1 },
      ];

      const bookmarks2 = [
        { url: 'https://example.com', title: 'Test', folderPath: 'Folder B', dateAdded: 1 },
      ];

      const checksum1 = generateChecksum(bookmarks1);
      const checksum2 = generateChecksum(bookmarks2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should generate different checksum when dateAdded changes', () => {
      const bookmarks1 = [
        { url: 'https://example.com', title: 'Test', dateAdded: 1000 },
      ];

      const bookmarks2 = [
        { url: 'https://example.com', title: 'Test', dateAdded: 2000 },
      ];

      const checksum1 = generateChecksum(bookmarks1);
      const checksum2 = generateChecksum(bookmarks2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should return valid SHA-256 hex string', () => {
      const bookmarks = [
        { url: 'https://example.com', title: 'Test', dateAdded: 1 },
      ];

      const checksum = generateChecksum(bookmarks);

      // SHA-256 produces 64 hex characters
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty array', () => {
      const checksum = generateChecksum([]);

      // Should still produce a valid checksum
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Extension and Server Checksum Compatibility', () => {
    it('should produce identical checksums for browser-style and server-style bookmarks', () => {
      // Browser extension style (with id, index)
      const browserBookmarks = [
        {
          id: '123',
          url: 'https://example.com',
          title: 'Example Site',
          folderPath: 'Bookmarks Bar/Work',
          dateAdded: 1700000000000,
          index: 0,
        },
        {
          id: '456',
          url: 'https://test.com',
          title: 'Test Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: 1700000001000,
          index: 0, // Different folder, so index 0 is valid
        },
      ];

      // Server style (normalized, with folder_path variant and index)
      const serverBookmarks = [
        {
          url: 'https://example.com',
          title: 'Example Site',
          folder_path: 'Bookmarks Bar/Work',
          dateAdded: 1700000000000,
          index: 0, // index must match for checksum compatibility
          source: 'chrome',
        },
        {
          url: 'https://test.com',
          title: 'Test Site',
          folder_path: 'Bookmarks Bar',
          dateAdded: 1700000001000,
          index: 0, // index must match for checksum compatibility
          source: 'chrome',
        },
      ];

      const browserChecksum = generateChecksum(browserBookmarks);
      const serverChecksum = generateChecksum(serverBookmarks);

      expect(browserChecksum).toBe(serverChecksum);
    });

    it('should generate different checksum when index changes (order detection)', () => {
      // Browser bookmarks with original order
      const originalOrder = [
        {
          url: 'https://example.com',
          title: 'Example Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: 1700000000000,
          index: 0,
        },
        {
          url: 'https://test.com',
          title: 'Test Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: 1700000001000,
          index: 1,
        },
      ];

      // Same bookmarks but reordered (swapped positions)
      const reorderedBookmarks = [
        {
          url: 'https://test.com',
          title: 'Test Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: 1700000001000,
          index: 0, // Now first
        },
        {
          url: 'https://example.com',
          title: 'Example Site',
          folderPath: 'Bookmarks Bar',
          dateAdded: 1700000000000,
          index: 1, // Now second
        },
      ];

      const originalChecksum = generateChecksum(originalOrder);
      const reorderedChecksum = generateChecksum(reorderedBookmarks);

      // Checksums should be different because order changed
      expect(originalChecksum).not.toBe(reorderedChecksum);
    });

    it('should handle mixed folderPath and folder_path in same array', () => {
      const mixedBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Path', dateAdded: 1 },
        { url: 'https://b.com', title: 'B', folder_path: 'Path', dateAdded: 2 },
      ];

      const consistentBookmarks = [
        { url: 'https://a.com', title: 'A', folderPath: 'Path', dateAdded: 1 },
        { url: 'https://b.com', title: 'B', folderPath: 'Path', dateAdded: 2 },
      ];

      const checksum1 = generateChecksum(mixedBookmarks);
      const checksum2 = generateChecksum(consistentBookmarks);

      expect(checksum1).toBe(checksum2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle bookmarks with special characters in URL', () => {
      const bookmarks = [
        { url: 'https://example.com/path?query=value&other=123#hash', title: 'Test', dateAdded: 1 },
      ];

      const checksum = generateChecksum(bookmarks);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle bookmarks with unicode in title', () => {
      const bookmarks = [
        { url: 'https://example.com', title: '日本語タイトル 🎉', dateAdded: 1 },
      ];

      const checksum = generateChecksum(bookmarks);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle bookmarks with very long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2000);
      const bookmarks = [
        { url: longUrl, title: 'Long URL', dateAdded: 1 },
      ];

      const checksum = generateChecksum(bookmarks);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle large number of bookmarks', () => {
      const bookmarks = Array.from({ length: 10000 }, (_, i) => ({
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
        dateAdded: i,
      }));

      const checksum = generateChecksum(bookmarks);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle duplicate URLs (keeps all)', () => {
      const bookmarks = [
        { url: 'https://example.com', title: 'First', dateAdded: 1 },
        { url: 'https://example.com', title: 'Second', dateAdded: 2 },
      ];

      const normalized = normalizeBookmarksForChecksum(bookmarks);
      expect(normalized).toHaveLength(2);
    });
  });
});
