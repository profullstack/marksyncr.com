/**
 * @fileoverview Tests for the conflict-resolver module
 * Tests various conflict resolution strategies and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  resolveConflict,
  mergeBookmarks,
  mergeChildren,
  resolveDeleteModifyConflict,
  resolveAllConflicts,
  requiresManualResolution,
  createConflictSummary,
} from '../src/conflict-resolver.js';
import { CONFLICT_RESOLUTION, CHANGE_TYPE } from '@marksyncr/types';

// Helper to create a sync change
const createSyncChange = (overrides = {}) => ({
  id: `change-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: CHANGE_TYPE.MODIFIED,
  path: 'toolbar/Test',
  before: null,
  after: {
    id: 'bm-1',
    type: 'bookmark',
    title: 'Test Bookmark',
    url: 'https://example.com',
    dateAdded: new Date().toISOString(),
  },
  timestamp: new Date().toISOString(),
  ...overrides,
});

// Helper to create a bookmark
const createBookmark = (overrides = {}) => ({
  id: `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'bookmark',
  title: 'Test Bookmark',
  url: 'https://example.com',
  dateAdded: new Date().toISOString(),
  dateModified: new Date().toISOString(),
  ...overrides,
});

describe('conflict-resolver', () => {
  describe('resolveConflict', () => {
    it('should resolve with LOCAL strategy', () => {
      const localChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Local Title' }),
        timestamp: new Date('2024-01-01').toISOString(),
      });
      const remoteChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Remote Title' }),
        timestamp: new Date('2024-01-02').toISOString(),
      });

      const result = resolveConflict(
        { localChange, remoteChange },
        CONFLICT_RESOLUTION.LOCAL
      );

      expect(result.resolution).toBe(CONFLICT_RESOLUTION.LOCAL);
      expect(result.resolvedValue.title).toBe('Local Title');
    });

    it('should resolve with REMOTE strategy', () => {
      const localChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Local Title' }),
        timestamp: new Date('2024-01-02').toISOString(),
      });
      const remoteChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Remote Title' }),
        timestamp: new Date('2024-01-01').toISOString(),
      });

      const result = resolveConflict(
        { localChange, remoteChange },
        CONFLICT_RESOLUTION.REMOTE
      );

      expect(result.resolution).toBe(CONFLICT_RESOLUTION.REMOTE);
      expect(result.resolvedValue.title).toBe('Remote Title');
    });

    it('should resolve with MERGED strategy', () => {
      const localChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Local Title', url: 'https://local.com' }),
        timestamp: new Date('2024-01-01').toISOString(),
      });
      const remoteChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Remote Title', url: 'https://remote.com' }),
        timestamp: new Date('2024-01-02').toISOString(),
      });

      const result = resolveConflict(
        { localChange, remoteChange },
        CONFLICT_RESOLUTION.MERGED
      );

      expect(result.resolution).toBe(CONFLICT_RESOLUTION.MERGED);
      expect(result.resolvedValue).toBeDefined();
    });

    it('should use newest strategy by default', () => {
      const localChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Local Title' }),
        timestamp: new Date('2024-01-01').toISOString(),
      });
      const remoteChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Remote Title' }),
        timestamp: new Date('2024-01-02').toISOString(),
      });

      const result = resolveConflict({ localChange, remoteChange });

      // Remote is newer, so it should win
      expect(result.resolution).toBe(CONFLICT_RESOLUTION.REMOTE);
      expect(result.resolvedValue.title).toBe('Remote Title');
    });

    it('should choose local when local is newer', () => {
      const localChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Local Title' }),
        timestamp: new Date('2024-01-02').toISOString(),
      });
      const remoteChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Remote Title' }),
        timestamp: new Date('2024-01-01').toISOString(),
      });

      const result = resolveConflict({ localChange, remoteChange });

      expect(result.resolution).toBe(CONFLICT_RESOLUTION.LOCAL);
      expect(result.resolvedValue.title).toBe('Local Title');
    });

    it('should choose local when timestamps are equal', () => {
      const timestamp = new Date('2024-01-01').toISOString();
      const localChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Local Title' }),
        timestamp,
      });
      const remoteChange = createSyncChange({
        id: 'same-id',
        after: createBookmark({ title: 'Remote Title' }),
        timestamp,
      });

      const result = resolveConflict({ localChange, remoteChange });

      // When equal, local wins as tiebreaker
      expect(result.resolution).toBe(CONFLICT_RESOLUTION.LOCAL);
    });
  });

  describe('mergeBookmarks', () => {
    it('should return remote if local is null', () => {
      const localChange = createSyncChange({ after: null, before: null });
      const remoteChange = createSyncChange({
        after: createBookmark({ title: 'Remote' }),
      });

      const result = mergeBookmarks(localChange, remoteChange);

      expect(result.title).toBe('Remote');
    });

    it('should return local if remote is null', () => {
      const localChange = createSyncChange({
        after: createBookmark({ title: 'Local' }),
      });
      const remoteChange = createSyncChange({ after: null, before: null });

      const result = mergeBookmarks(localChange, remoteChange);

      expect(result.title).toBe('Local');
    });

    it('should merge folder children', () => {
      const localChange = createSyncChange({
        after: {
          id: 'folder-1',
          type: 'folder',
          title: 'Folder',
          children: [createBookmark({ id: 'local-child' })],
        },
        timestamp: new Date('2024-01-01').toISOString(),
      });
      const remoteChange = createSyncChange({
        after: {
          id: 'folder-1',
          type: 'folder',
          title: 'Folder',
          children: [createBookmark({ id: 'remote-child' })],
        },
        timestamp: new Date('2024-01-02').toISOString(),
      });

      const result = mergeBookmarks(localChange, remoteChange);

      expect(result.children).toHaveLength(2);
    });
  });

  describe('mergeChildren', () => {
    it('should merge children from both arrays', () => {
      const localChildren = [
        createBookmark({ id: 'local-1', title: 'Local 1' }),
        createBookmark({ id: 'shared', title: 'Shared Local' }),
      ];
      const remoteChildren = [
        createBookmark({ id: 'remote-1', title: 'Remote 1' }),
        createBookmark({ id: 'shared', title: 'Shared Remote' }),
      ];

      const result = mergeChildren(localChildren, remoteChildren);

      expect(result).toHaveLength(3); // local-1, shared (local version), remote-1
      expect(result.map((c) => c.id)).toContain('local-1');
      expect(result.map((c) => c.id)).toContain('remote-1');
      expect(result.map((c) => c.id)).toContain('shared');
    });

    it('should keep local version for duplicates', () => {
      const localChildren = [createBookmark({ id: 'shared', title: 'Local Version' })];
      const remoteChildren = [createBookmark({ id: 'shared', title: 'Remote Version' })];

      const result = mergeChildren(localChildren, remoteChildren);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Local Version');
    });
  });

  describe('resolveDeleteModifyConflict', () => {
    it('should keep modified version by default', () => {
      const deleteChange = createSyncChange({
        id: 'bm-1',
        type: CHANGE_TYPE.DELETED,
        before: createBookmark({ title: 'Deleted' }),
        after: null,
      });
      const modifyChange = createSyncChange({
        id: 'bm-1',
        type: CHANGE_TYPE.MODIFIED,
        after: createBookmark({ title: 'Modified' }),
      });

      const result = resolveDeleteModifyConflict(deleteChange, modifyChange);

      expect(result.resolvedValue.title).toBe('Modified');
    });

    it('should honor deletion when strategy is delete', () => {
      const deleteChange = createSyncChange({
        id: 'bm-1',
        type: CHANGE_TYPE.DELETED,
        before: createBookmark({ title: 'Deleted' }),
        after: null,
      });
      const modifyChange = createSyncChange({
        id: 'bm-1',
        type: CHANGE_TYPE.MODIFIED,
        after: createBookmark({ title: 'Modified' }),
      });

      const result = resolveDeleteModifyConflict(deleteChange, modifyChange, 'delete');

      expect(result.resolvedValue).toBeNull();
    });
  });

  describe('resolveAllConflicts', () => {
    it('should resolve multiple conflicts at once', () => {
      const conflicts = [
        {
          localChange: createSyncChange({
            id: 'id-1',
            after: createBookmark({ title: 'Local 1' }),
            timestamp: new Date('2024-01-02').toISOString(),
          }),
          remoteChange: createSyncChange({
            id: 'id-1',
            after: createBookmark({ title: 'Remote 1' }),
            timestamp: new Date('2024-01-01').toISOString(),
          }),
        },
        {
          localChange: createSyncChange({
            id: 'id-2',
            after: createBookmark({ title: 'Local 2' }),
            timestamp: new Date('2024-01-01').toISOString(),
          }),
          remoteChange: createSyncChange({
            id: 'id-2',
            after: createBookmark({ title: 'Remote 2' }),
            timestamp: new Date('2024-01-02').toISOString(),
          }),
        },
      ];

      const results = resolveAllConflicts(conflicts);

      expect(results).toHaveLength(2);
      expect(results[0].resolvedValue.title).toBe('Local 1'); // Local is newer
      expect(results[1].resolvedValue.title).toBe('Remote 2'); // Remote is newer
    });

    it('should handle delete vs modify conflicts', () => {
      const conflicts = [
        {
          localChange: createSyncChange({
            id: 'id-1',
            type: CHANGE_TYPE.DELETED,
            before: createBookmark({ title: 'Deleted' }),
            after: null,
          }),
          remoteChange: createSyncChange({
            id: 'id-1',
            type: CHANGE_TYPE.MODIFIED,
            after: createBookmark({ title: 'Modified' }),
          }),
        },
      ];

      const results = resolveAllConflicts(conflicts);

      expect(results).toHaveLength(1);
      // Default is to keep modified version
      expect(results[0].resolvedValue.title).toBe('Modified');
    });
  });

  describe('requiresManualResolution', () => {
    it('should return true for delete vs modify conflict', () => {
      const conflict = {
        localChange: createSyncChange({
          type: CHANGE_TYPE.DELETED,
        }),
        remoteChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
        }),
      };

      expect(requiresManualResolution(conflict)).toBe(true);
    });

    it('should return true when both modified with different URLs', () => {
      const conflict = {
        localChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
          after: createBookmark({ url: 'https://local.com' }),
        }),
        remoteChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
          after: createBookmark({ url: 'https://remote.com' }),
        }),
      };

      expect(requiresManualResolution(conflict)).toBe(true);
    });

    it('should return false for same URL modifications', () => {
      const conflict = {
        localChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
          after: createBookmark({ url: 'https://same.com', title: 'Local' }),
        }),
        remoteChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
          after: createBookmark({ url: 'https://same.com', title: 'Remote' }),
        }),
      };

      expect(requiresManualResolution(conflict)).toBe(false);
    });
  });

  describe('createConflictSummary', () => {
    it('should create human-readable summary', () => {
      const conflict = {
        id: 'bm-1',
        localChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
          after: createBookmark({ title: 'Local Title' }),
        }),
        remoteChange: createSyncChange({
          type: CHANGE_TYPE.MODIFIED,
          after: createBookmark({ title: 'Remote Title' }),
        }),
        resolution: CONFLICT_RESOLUTION.LOCAL,
        resolvedValue: createBookmark({ title: 'Local Title' }),
      };

      const summary = createConflictSummary(conflict);

      expect(summary.id).toBe('bm-1');
      expect(summary.title).toBe('Local Title');
      expect(summary.localAction).toBe(CHANGE_TYPE.MODIFIED);
      expect(summary.remoteAction).toBe(CHANGE_TYPE.MODIFIED);
      expect(summary.resolution).toBe(CONFLICT_RESOLUTION.LOCAL);
      expect(summary.resolvedTo).toBe('local version');
    });
  });
});
