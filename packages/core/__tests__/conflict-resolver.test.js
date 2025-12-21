/**
 * @fileoverview Tests for the ConflictResolver
 * Tests various conflict resolution strategies and edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictResolver, CONFLICT_STRATEGY } from '../src/conflict-resolver.js';
import { BOOKMARK_LOCATION } from '@marksyncr/types';

// Helper to create a bookmark
const createBookmark = (overrides = {}) => ({
  id: `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'bookmark',
  title: 'Test Bookmark',
  url: 'https://example.com',
  location: BOOKMARK_LOCATION.TOOLBAR,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  tags: [],
  ...overrides,
});

// Helper to create a folder
const createFolder = (overrides = {}) => ({
  id: `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'folder',
  title: 'Test Folder',
  location: BOOKMARK_LOCATION.TOOLBAR,
  children: [],
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  ...overrides,
});

describe('ConflictResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  describe('constructor', () => {
    it('should create resolver with default strategy', () => {
      const r = new ConflictResolver();
      expect(r.strategy).toBe(CONFLICT_STRATEGY.NEWER_WINS);
    });

    it('should accept custom strategy', () => {
      const r = new ConflictResolver({ strategy: CONFLICT_STRATEGY.LOCAL_WINS });
      expect(r.strategy).toBe(CONFLICT_STRATEGY.LOCAL_WINS);
    });

    it('should accept all valid strategies', () => {
      Object.values(CONFLICT_STRATEGY).forEach((strategy) => {
        const r = new ConflictResolver({ strategy });
        expect(r.strategy).toBe(strategy);
      });
    });
  });

  describe('resolve', () => {
    describe('NEWER_WINS strategy', () => {
      beforeEach(() => {
        resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.NEWER_WINS });
      });

      it('should choose local when local is newer', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
          modifiedAt: new Date('2024-01-02').toISOString(),
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
          modifiedAt: new Date('2024-01-01').toISOString(),
        });

        const result = resolver.resolve(local, remote);

        expect(result.title).toBe('Local Title');
      });

      it('should choose remote when remote is newer', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
          modifiedAt: new Date('2024-01-01').toISOString(),
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
          modifiedAt: new Date('2024-01-02').toISOString(),
        });

        const result = resolver.resolve(local, remote);

        expect(result.title).toBe('Remote Title');
      });

      it('should choose local when timestamps are equal', () => {
        const timestamp = new Date('2024-01-01').toISOString();
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
          modifiedAt: timestamp,
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
          modifiedAt: timestamp,
        });

        const result = resolver.resolve(local, remote);

        // When equal, local wins as tiebreaker
        expect(result.title).toBe('Local Title');
      });
    });

    describe('LOCAL_WINS strategy', () => {
      beforeEach(() => {
        resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.LOCAL_WINS });
      });

      it('should always choose local regardless of timestamp', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
          modifiedAt: new Date('2024-01-01').toISOString(), // Older
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
          modifiedAt: new Date('2024-01-02').toISOString(), // Newer
        });

        const result = resolver.resolve(local, remote);

        expect(result.title).toBe('Local Title');
      });
    });

    describe('REMOTE_WINS strategy', () => {
      beforeEach(() => {
        resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.REMOTE_WINS });
      });

      it('should always choose remote regardless of timestamp', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
          modifiedAt: new Date('2024-01-02').toISOString(), // Newer
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
          modifiedAt: new Date('2024-01-01').toISOString(), // Older
        });

        const result = resolver.resolve(local, remote);

        expect(result.title).toBe('Remote Title');
      });
    });

    describe('MERGE strategy', () => {
      beforeEach(() => {
        resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.MERGE });
      });

      it('should merge non-conflicting fields', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Same Title',
          url: 'https://local.example.com',
          tags: ['local-tag'],
          modifiedAt: new Date('2024-01-01').toISOString(),
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Same Title',
          url: 'https://remote.example.com',
          tags: ['remote-tag'],
          modifiedAt: new Date('2024-01-02').toISOString(),
        });

        const result = resolver.resolve(local, remote);

        // Should merge tags
        expect(result.tags).toContain('local-tag');
        expect(result.tags).toContain('remote-tag');
      });

      it('should use newer value for conflicting scalar fields', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
          modifiedAt: new Date('2024-01-01').toISOString(),
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
          modifiedAt: new Date('2024-01-02').toISOString(),
        });

        const result = resolver.resolve(local, remote);

        // Remote is newer, so its title should win
        expect(result.title).toBe('Remote Title');
      });
    });

    describe('MANUAL strategy', () => {
      beforeEach(() => {
        resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.MANUAL });
      });

      it('should return conflict object for manual resolution', () => {
        const local = createBookmark({
          id: 'same-id',
          title: 'Local Title',
        });
        const remote = createBookmark({
          id: 'same-id',
          title: 'Remote Title',
        });

        const result = resolver.resolve(local, remote);

        expect(result.conflict).toBe(true);
        expect(result.local).toEqual(local);
        expect(result.remote).toEqual(remote);
      });
    });
  });

  describe('resolveFolder', () => {
    it('should resolve folder title conflicts', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.NEWER_WINS });

      const local = createFolder({
        id: 'folder-id',
        title: 'Local Folder',
        modifiedAt: new Date('2024-01-02').toISOString(),
      });
      const remote = createFolder({
        id: 'folder-id',
        title: 'Remote Folder',
        modifiedAt: new Date('2024-01-01').toISOString(),
      });

      const result = resolver.resolveFolder(local, remote);

      expect(result.title).toBe('Local Folder');
    });

    it('should merge children from both folders', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.MERGE });

      const localChild = createBookmark({ id: 'local-child', title: 'Local Child' });
      const remoteChild = createBookmark({ id: 'remote-child', title: 'Remote Child' });

      const local = createFolder({
        id: 'folder-id',
        children: [localChild],
      });
      const remote = createFolder({
        id: 'folder-id',
        children: [remoteChild],
      });

      const result = resolver.resolveFolder(local, remote);

      expect(result.children).toHaveLength(2);
      expect(result.children.map((c) => c.id)).toContain('local-child');
      expect(result.children.map((c) => c.id)).toContain('remote-child');
    });

    it('should handle nested folder conflicts', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.NEWER_WINS });

      const nestedLocal = createFolder({
        id: 'nested-folder',
        title: 'Nested Local',
        modifiedAt: new Date('2024-01-02').toISOString(),
      });
      const nestedRemote = createFolder({
        id: 'nested-folder',
        title: 'Nested Remote',
        modifiedAt: new Date('2024-01-01').toISOString(),
      });

      const local = createFolder({
        id: 'parent-folder',
        children: [nestedLocal],
      });
      const remote = createFolder({
        id: 'parent-folder',
        children: [nestedRemote],
      });

      const result = resolver.resolveFolder(local, remote);

      const nestedResult = result.children.find((c) => c.id === 'nested-folder');
      expect(nestedResult.title).toBe('Nested Local');
    });
  });

  describe('detectConflict', () => {
    it('should detect conflict when same ID has different content', () => {
      const local = createBookmark({
        id: 'same-id',
        title: 'Local Title',
      });
      const remote = createBookmark({
        id: 'same-id',
        title: 'Remote Title',
      });

      const hasConflict = resolver.detectConflict(local, remote);

      expect(hasConflict).toBe(true);
    });

    it('should not detect conflict when content is identical', () => {
      const timestamp = new Date().toISOString();
      const local = createBookmark({
        id: 'same-id',
        title: 'Same Title',
        url: 'https://same.example.com',
        modifiedAt: timestamp,
      });
      const remote = createBookmark({
        id: 'same-id',
        title: 'Same Title',
        url: 'https://same.example.com',
        modifiedAt: timestamp,
      });

      const hasConflict = resolver.detectConflict(local, remote);

      expect(hasConflict).toBe(false);
    });

    it('should detect conflict when URL differs', () => {
      const local = createBookmark({
        id: 'same-id',
        url: 'https://local.example.com',
      });
      const remote = createBookmark({
        id: 'same-id',
        url: 'https://remote.example.com',
      });

      const hasConflict = resolver.detectConflict(local, remote);

      expect(hasConflict).toBe(true);
    });

    it('should detect conflict when location differs', () => {
      const local = createBookmark({
        id: 'same-id',
        location: BOOKMARK_LOCATION.TOOLBAR,
      });
      const remote = createBookmark({
        id: 'same-id',
        location: BOOKMARK_LOCATION.MENU,
      });

      const hasConflict = resolver.detectConflict(local, remote);

      expect(hasConflict).toBe(true);
    });
  });

  describe('resolveMultiple', () => {
    it('should resolve multiple conflicts at once', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.NEWER_WINS });

      const conflicts = [
        {
          local: createBookmark({
            id: 'id-1',
            title: 'Local 1',
            modifiedAt: new Date('2024-01-02').toISOString(),
          }),
          remote: createBookmark({
            id: 'id-1',
            title: 'Remote 1',
            modifiedAt: new Date('2024-01-01').toISOString(),
          }),
        },
        {
          local: createBookmark({
            id: 'id-2',
            title: 'Local 2',
            modifiedAt: new Date('2024-01-01').toISOString(),
          }),
          remote: createBookmark({
            id: 'id-2',
            title: 'Remote 2',
            modifiedAt: new Date('2024-01-02').toISOString(),
          }),
        },
      ];

      const results = resolver.resolveMultiple(conflicts);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Local 1'); // Local is newer
      expect(results[1].title).toBe('Remote 2'); // Remote is newer
    });
  });

  describe('edge cases', () => {
    it('should handle null local', () => {
      const remote = createBookmark({ title: 'Remote Only' });

      const result = resolver.resolve(null, remote);

      expect(result).toEqual(remote);
    });

    it('should handle null remote', () => {
      const local = createBookmark({ title: 'Local Only' });

      const result = resolver.resolve(local, null);

      expect(result).toEqual(local);
    });

    it('should handle both null', () => {
      const result = resolver.resolve(null, null);

      expect(result).toBeNull();
    });

    it('should handle missing modifiedAt timestamps', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.NEWER_WINS });

      const local = createBookmark({
        id: 'same-id',
        title: 'Local Title',
      });
      delete local.modifiedAt;

      const remote = createBookmark({
        id: 'same-id',
        title: 'Remote Title',
        modifiedAt: new Date().toISOString(),
      });

      // Should not throw
      const result = resolver.resolve(local, remote);
      expect(result).toBeDefined();
    });

    it('should handle invalid timestamps gracefully', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.NEWER_WINS });

      const local = createBookmark({
        id: 'same-id',
        title: 'Local Title',
        modifiedAt: 'invalid-date',
      });
      const remote = createBookmark({
        id: 'same-id',
        title: 'Remote Title',
        modifiedAt: new Date().toISOString(),
      });

      // Should not throw
      const result = resolver.resolve(local, remote);
      expect(result).toBeDefined();
    });

    it('should preserve all fields during resolution', () => {
      resolver = new ConflictResolver({ strategy: CONFLICT_STRATEGY.LOCAL_WINS });

      const local = createBookmark({
        id: 'same-id',
        title: 'Local Title',
        url: 'https://local.example.com',
        favicon: 'https://local.example.com/favicon.ico',
        tags: ['tag1', 'tag2'],
        description: 'Local description',
        customField: 'custom value',
      });
      const remote = createBookmark({
        id: 'same-id',
        title: 'Remote Title',
      });

      const result = resolver.resolve(local, remote);

      expect(result.favicon).toBe(local.favicon);
      expect(result.tags).toEqual(local.tags);
      expect(result.description).toBe(local.description);
      expect(result.customField).toBe(local.customField);
    });
  });

  describe('strategy change', () => {
    it('should allow changing strategy after creation', () => {
      const r = new ConflictResolver({ strategy: CONFLICT_STRATEGY.LOCAL_WINS });
      expect(r.strategy).toBe(CONFLICT_STRATEGY.LOCAL_WINS);

      r.setStrategy(CONFLICT_STRATEGY.REMOTE_WINS);
      expect(r.strategy).toBe(CONFLICT_STRATEGY.REMOTE_WINS);
    });
  });
});
