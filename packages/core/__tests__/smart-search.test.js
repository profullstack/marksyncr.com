/**
 * @fileoverview Tests for Smart Search Engine
 * Using Vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSearchEngine,
  searchBookmarks,
  filterByFolder,
  filterByTag,
  filterByDomain,
  filterByDateRange,
  applyFilters,
} from '../src/smart-search.js';

// Sample bookmark data for testing
const sampleBookmarks = [
  {
    id: '1',
    title: 'React Documentation',
    url: 'https://react.dev/learn',
    dateAdded: '2025-01-15T10:00:00Z',
    parentId: 'folder-1',
    tags: [{ id: 't1', name: 'javascript' }, { id: 't2', name: 'frontend' }],
    notes: 'Official React docs for learning',
  },
  {
    id: '2',
    title: 'Vue.js Guide',
    url: 'https://vuejs.org/guide/introduction.html',
    dateAdded: '2025-01-10T10:00:00Z',
    parentId: 'folder-1',
    tags: [{ id: 't1', name: 'javascript' }, { id: 't2', name: 'frontend' }],
    notes: 'Vue framework documentation',
  },
  {
    id: '3',
    title: 'Node.js Best Practices',
    url: 'https://github.com/goldbergyoni/nodebestpractices',
    dateAdded: '2025-01-05T10:00:00Z',
    parentId: 'folder-2',
    tags: [{ id: 't1', name: 'javascript' }, { id: 't3', name: 'backend' }],
    notes: 'Comprehensive Node.js best practices guide',
  },
  {
    id: '4',
    title: 'Python Tutorial',
    url: 'https://docs.python.org/3/tutorial/',
    dateAdded: '2024-12-20T10:00:00Z',
    parentId: 'folder-3',
    tags: [{ id: 't4', name: 'python' }, { id: 't3', name: 'backend' }],
    notes: 'Official Python tutorial',
  },
  {
    id: '5',
    title: 'CSS Tricks',
    url: 'https://css-tricks.com/',
    dateAdded: '2024-12-15T10:00:00Z',
    parentId: 'folder-1',
    tags: [{ id: 't5', name: 'css' }, { id: 't2', name: 'frontend' }],
    notes: 'CSS tips and tricks website',
  },
  {
    id: '6',
    title: 'GitHub Repository',
    url: 'https://github.com/example/repo',
    dateAdded: '2024-12-10T10:00:00Z',
    parentId: 'folder-2',
    tags: [],
    notes: '',
  },
];

describe('Smart Search Engine', () => {
  describe('createSearchEngine', () => {
    it('should create a search engine instance', () => {
      const engine = createSearchEngine(sampleBookmarks);
      expect(engine).toBeDefined();
      expect(typeof engine.search).toBe('function');
    });

    it('should handle empty bookmark array', () => {
      const engine = createSearchEngine([]);
      expect(engine).toBeDefined();
    });

    it('should handle bookmarks without optional fields', () => {
      const bookmarks = [
        { id: '1', title: 'Test', url: 'https://test.com' },
      ];
      const engine = createSearchEngine(bookmarks);
      expect(engine).toBeDefined();
    });
  });

  describe('searchBookmarks', () => {
    let engine;

    beforeEach(() => {
      engine = createSearchEngine(sampleBookmarks);
    });

    it('should find bookmarks by title', () => {
      const results = searchBookmarks(engine, 'React');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.title).toContain('React');
    });

    it('should find bookmarks by partial title match', () => {
      const results = searchBookmarks(engine, 'Doc');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.item.title.includes('Documentation'))).toBe(true);
    });

    it('should find bookmarks by URL', () => {
      const results = searchBookmarks(engine, 'github.com');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.item.url.includes('github.com'))).toBe(true);
    });

    it('should find bookmarks by notes content', () => {
      const results = searchBookmarks(engine, 'best practices');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].item.notes).toContain('best practices');
    });

    it('should find bookmarks by tag name', () => {
      const results = searchBookmarks(engine, 'python');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.item.tags?.some(t => t.name === 'python'))).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = searchBookmarks(engine, 'xyznonexistent');
      expect(results).toEqual([]);
    });

    it('should handle empty search query', () => {
      const results = searchBookmarks(engine, '');
      expect(results).toEqual([]);
    });

    it('should return results with scores', () => {
      const results = searchBookmarks(engine, 'React');
      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0].score).toBe('number');
    });

    it('should support fuzzy matching', () => {
      const results = searchBookmarks(engine, 'Reakt'); // typo
      expect(results.length).toBeGreaterThan(0);
    });

    it('should limit results when specified', () => {
      const results = searchBookmarks(engine, 'javascript', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should respect threshold option', () => {
      const looseResults = searchBookmarks(engine, 'Reakt', { threshold: 0.6 });
      const strictResults = searchBookmarks(engine, 'Reakt', { threshold: 0.1 });
      expect(looseResults.length).toBeGreaterThanOrEqual(strictResults.length);
    });
  });

  describe('filterByFolder', () => {
    it('should filter bookmarks by folder ID', () => {
      const results = filterByFolder(sampleBookmarks, 'folder-1');
      expect(results.length).toBe(3);
      expect(results.every(b => b.parentId === 'folder-1')).toBe(true);
    });

    it('should return empty array for non-existent folder', () => {
      const results = filterByFolder(sampleBookmarks, 'folder-999');
      expect(results).toEqual([]);
    });

    it('should return all bookmarks when folder is null', () => {
      const results = filterByFolder(sampleBookmarks, null);
      expect(results.length).toBe(sampleBookmarks.length);
    });
  });

  describe('filterByTag', () => {
    it('should filter bookmarks by tag ID', () => {
      const results = filterByTag(sampleBookmarks, 't1');
      expect(results.length).toBe(3);
      expect(results.every(b => b.tags?.some(t => t.id === 't1'))).toBe(true);
    });

    it('should filter bookmarks by tag name', () => {
      const results = filterByTag(sampleBookmarks, 'frontend');
      expect(results.length).toBe(3);
    });

    it('should return empty array for non-existent tag', () => {
      const results = filterByTag(sampleBookmarks, 'nonexistent');
      expect(results).toEqual([]);
    });

    it('should return all bookmarks when tag is null', () => {
      const results = filterByTag(sampleBookmarks, null);
      expect(results.length).toBe(sampleBookmarks.length);
    });

    it('should handle bookmarks without tags', () => {
      const results = filterByTag(sampleBookmarks, 'javascript');
      expect(results.every(b => b.tags?.length > 0)).toBe(true);
    });
  });

  describe('filterByDomain', () => {
    it('should filter bookmarks by domain', () => {
      const results = filterByDomain(sampleBookmarks, 'github.com');
      expect(results.length).toBe(2);
      expect(results.every(b => b.url.includes('github.com'))).toBe(true);
    });

    it('should be case-insensitive', () => {
      const results = filterByDomain(sampleBookmarks, 'GITHUB.COM');
      expect(results.length).toBe(2);
    });

    it('should return empty array for non-existent domain', () => {
      const results = filterByDomain(sampleBookmarks, 'nonexistent.com');
      expect(results).toEqual([]);
    });

    it('should return all bookmarks when domain is null', () => {
      const results = filterByDomain(sampleBookmarks, null);
      expect(results.length).toBe(sampleBookmarks.length);
    });
  });

  describe('filterByDateRange', () => {
    it('should filter bookmarks within date range', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');
      const results = filterByDateRange(sampleBookmarks, startDate, endDate);
      expect(results.length).toBe(3);
    });

    it('should include bookmarks on boundary dates', () => {
      // Bookmark 1 has dateAdded: '2025-01-15T10:00:00Z'
      // Using the same date should include it
      const startDate = new Date('2025-01-15T00:00:00Z');
      const endDate = new Date('2025-01-15T23:59:59Z');
      const results = filterByDateRange(sampleBookmarks, startDate, endDate);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('1');
    });

    it('should return all bookmarks when dates are null', () => {
      const results = filterByDateRange(sampleBookmarks, null, null);
      expect(results.length).toBe(sampleBookmarks.length);
    });

    it('should filter with only start date', () => {
      const startDate = new Date('2025-01-01');
      const results = filterByDateRange(sampleBookmarks, startDate, null);
      expect(results.length).toBe(3);
    });

    it('should filter with only end date', () => {
      const endDate = new Date('2024-12-31');
      const results = filterByDateRange(sampleBookmarks, null, endDate);
      expect(results.length).toBe(3);
    });
  });

  describe('applyFilters', () => {
    it('should apply multiple filters', () => {
      const filters = {
        folder: 'folder-1',
        tag: 'javascript',
      };
      const results = applyFilters(sampleBookmarks, filters);
      expect(results.length).toBe(2);
    });

    it('should apply all filter types', () => {
      const filters = {
        folder: 'folder-1',
        tag: 'frontend',
        domain: 'react.dev',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      };
      const results = applyFilters(sampleBookmarks, filters);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('1');
    });

    it('should return all bookmarks with empty filters', () => {
      const results = applyFilters(sampleBookmarks, {});
      expect(results.length).toBe(sampleBookmarks.length);
    });

    it('should handle undefined filters', () => {
      const results = applyFilters(sampleBookmarks, undefined);
      expect(results.length).toBe(sampleBookmarks.length);
    });
  });
});
