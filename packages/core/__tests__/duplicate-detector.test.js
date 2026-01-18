/**
 * @fileoverview Tests for Duplicate Detection Engine
 * Using Vitest
 */

import { describe, it, expect } from 'vitest';
import {
  findDuplicates,
  findDuplicatesByUrl,
  findDuplicatesByTitle,
  findSimilarBookmarks,
  groupDuplicates,
  suggestMerge,
  calculateSimilarity,
  normalizeUrl,
} from '../src/duplicate-detector.js';

// Sample bookmark data for testing
const sampleBookmarks = [
  {
    id: '1',
    title: 'React Documentation',
    url: 'https://react.dev/learn',
    dateAdded: '2025-01-15T10:00:00Z',
    parentId: 'folder-1',
  },
  {
    id: '2',
    title: 'React Docs',
    url: 'https://react.dev/learn/',
    dateAdded: '2025-01-10T10:00:00Z',
    parentId: 'folder-2',
  },
  {
    id: '3',
    title: 'React Documentation - Official',
    url: 'https://www.react.dev/learn',
    dateAdded: '2025-01-05T10:00:00Z',
    parentId: 'folder-1',
  },
  {
    id: '4',
    title: 'Vue.js Guide',
    url: 'https://vuejs.org/guide/introduction.html',
    dateAdded: '2025-01-10T10:00:00Z',
    parentId: 'folder-1',
  },
  {
    id: '5',
    title: 'Vue.js Guide',
    url: 'https://vuejs.org/guide/introduction.html',
    dateAdded: '2025-01-08T10:00:00Z',
    parentId: 'folder-3',
  },
  {
    id: '6',
    title: 'GitHub - React',
    url: 'https://github.com/facebook/react',
    dateAdded: '2025-01-01T10:00:00Z',
    parentId: 'folder-2',
  },
  {
    id: '7',
    title: 'GitHub - React Repository',
    url: 'https://github.com/facebook/react/',
    dateAdded: '2024-12-20T10:00:00Z',
    parentId: 'folder-1',
  },
  {
    id: '8',
    title: 'Unique Bookmark',
    url: 'https://unique-site.com/page',
    dateAdded: '2024-12-15T10:00:00Z',
    parentId: 'folder-1',
  },
];

describe('Duplicate Detector', () => {
  describe('normalizeUrl', () => {
    it('should remove trailing slashes', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
      expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
    });

    it('should remove www prefix', () => {
      expect(normalizeUrl('https://www.example.com')).toBe('https://example.com');
    });

    it('should convert to lowercase', () => {
      expect(normalizeUrl('https://EXAMPLE.COM/Path')).toBe('https://example.com/path');
    });

    it('should remove common tracking parameters', () => {
      expect(normalizeUrl('https://example.com?utm_source=test')).toBe('https://example.com');
      expect(normalizeUrl('https://example.com?ref=twitter')).toBe('https://example.com');
    });

    it('should preserve important query parameters', () => {
      expect(normalizeUrl('https://example.com?id=123')).toBe('https://example.com?id=123');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(normalizeUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(calculateSimilarity('abc', 'xyz')).toBe(0);
    });

    it('should return value between 0 and 1 for similar strings', () => {
      const similarity = calculateSimilarity('React Documentation', 'React Docs');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should be case-insensitive', () => {
      expect(calculateSimilarity('Hello', 'hello')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(calculateSimilarity('', '')).toBe(1);
      expect(calculateSimilarity('hello', '')).toBe(0);
    });
  });

  describe('findDuplicatesByUrl', () => {
    it('should find exact URL duplicates', () => {
      const duplicates = findDuplicatesByUrl(sampleBookmarks);
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('should find duplicates with normalized URLs', () => {
      const duplicates = findDuplicatesByUrl(sampleBookmarks);
      // Should find react.dev duplicates (with/without trailing slash and www)
      const reactDuplicates = duplicates.find((group) =>
        group.some((b) => b.url.includes('react.dev'))
      );
      expect(reactDuplicates).toBeDefined();
      expect(reactDuplicates.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for no duplicates', () => {
      const uniqueBookmarks = [
        { id: '1', url: 'https://a.com' },
        { id: '2', url: 'https://b.com' },
      ];
      const duplicates = findDuplicatesByUrl(uniqueBookmarks);
      expect(duplicates).toEqual([]);
    });
  });

  describe('findDuplicatesByTitle', () => {
    it('should find exact title duplicates', () => {
      const duplicates = findDuplicatesByTitle(sampleBookmarks);
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('should find Vue.js Guide duplicates', () => {
      const duplicates = findDuplicatesByTitle(sampleBookmarks);
      const vueDuplicates = duplicates.find((group) =>
        group.some((b) => b.title === 'Vue.js Guide')
      );
      expect(vueDuplicates).toBeDefined();
      expect(vueDuplicates.length).toBe(2);
    });

    it('should be case-insensitive', () => {
      const bookmarks = [
        { id: '1', title: 'Test Title', url: 'https://a.com' },
        { id: '2', title: 'TEST TITLE', url: 'https://b.com' },
      ];
      const duplicates = findDuplicatesByTitle(bookmarks);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].length).toBe(2);
    });
  });

  describe('findSimilarBookmarks', () => {
    it('should find similar bookmarks by title', () => {
      const similar = findSimilarBookmarks(sampleBookmarks, { threshold: 0.5 });
      expect(similar.length).toBeGreaterThan(0);
    });

    it('should respect similarity threshold', () => {
      const highThreshold = findSimilarBookmarks(sampleBookmarks, { threshold: 0.9 });
      const lowThreshold = findSimilarBookmarks(sampleBookmarks, { threshold: 0.3 });
      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
    });

    it('should include similarity score in results', () => {
      const similar = findSimilarBookmarks(sampleBookmarks, { threshold: 0.5 });
      if (similar.length > 0) {
        expect(similar[0]).toHaveProperty('similarity');
        expect(similar[0]).toHaveProperty('bookmarks');
      }
    });
  });

  describe('findDuplicates', () => {
    it('should find all types of duplicates', () => {
      const result = findDuplicates(sampleBookmarks);
      expect(result).toHaveProperty('exact');
      expect(result).toHaveProperty('similar');
      expect(result).toHaveProperty('total');
    });

    it('should count total duplicates correctly', () => {
      const result = findDuplicates(sampleBookmarks);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should handle empty array', () => {
      const result = findDuplicates([]);
      expect(result.exact).toEqual([]);
      expect(result.similar).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('groupDuplicates', () => {
    it('should group duplicates by normalized URL', () => {
      const groups = groupDuplicates(sampleBookmarks);
      expect(groups.size).toBeGreaterThan(0);
    });

    it('should include all bookmarks in groups', () => {
      const groups = groupDuplicates(sampleBookmarks);
      let totalInGroups = 0;
      for (const bookmarks of groups.values()) {
        totalInGroups += bookmarks.length;
      }
      expect(totalInGroups).toBe(sampleBookmarks.length);
    });
  });

  describe('suggestMerge', () => {
    it('should suggest keeping the most recent bookmark', () => {
      const duplicates = [
        { id: '1', title: 'Test', url: 'https://test.com', dateAdded: '2025-01-01T10:00:00Z' },
        { id: '2', title: 'Test', url: 'https://test.com', dateAdded: '2025-01-15T10:00:00Z' },
      ];
      const suggestion = suggestMerge(duplicates);
      expect(suggestion.keep.id).toBe('2');
      expect(suggestion.remove).toHaveLength(1);
      expect(suggestion.remove[0].id).toBe('1');
    });

    it('should prefer bookmark with more metadata', () => {
      const duplicates = [
        { id: '1', title: 'Test', url: 'https://test.com', dateAdded: '2025-01-15T10:00:00Z' },
        {
          id: '2',
          title: 'Test with Description',
          url: 'https://test.com',
          dateAdded: '2025-01-01T10:00:00Z',
          notes: 'Some notes',
        },
      ];
      const suggestion = suggestMerge(duplicates, { preferMetadata: true });
      expect(suggestion.keep.id).toBe('2');
    });

    it('should handle single bookmark', () => {
      const duplicates = [
        { id: '1', title: 'Test', url: 'https://test.com', dateAdded: '2025-01-01T10:00:00Z' },
      ];
      const suggestion = suggestMerge(duplicates);
      expect(suggestion.keep.id).toBe('1');
      expect(suggestion.remove).toHaveLength(0);
    });

    it('should include merge reason', () => {
      const duplicates = [
        { id: '1', title: 'Test', url: 'https://test.com', dateAdded: '2025-01-01T10:00:00Z' },
        { id: '2', title: 'Test', url: 'https://test.com', dateAdded: '2025-01-15T10:00:00Z' },
      ];
      const suggestion = suggestMerge(duplicates);
      expect(suggestion).toHaveProperty('reason');
      expect(typeof suggestion.reason).toBe('string');
    });
  });
});
