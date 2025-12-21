import { describe, it, expect } from 'vitest';
import {
  flattenBookmarks,
  areBookmarksEqual,
  detectChanges,
  findConflicts,
  getParentPath,
  summarizeChanges,
} from '../src/diff-engine.js';
import { CHANGE_TYPE } from '@marksyncr/types';

describe('diff-engine', () => {
  const createTestBookmarks = () => ({
    toolbar: {
      id: 'toolbar_root',
      title: 'Bookmarks Toolbar',
      children: [
        {
          id: 'b1',
          type: 'bookmark',
          title: 'Example',
          url: 'https://example.com',
          dateAdded: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'f1',
          type: 'folder',
          title: 'Work',
          dateAdded: '2025-01-01T00:00:00.000Z',
          children: [
            {
              id: 'b2',
              type: 'bookmark',
              title: 'GitHub',
              url: 'https://github.com',
              dateAdded: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    },
    menu: {
      id: 'menu_root',
      title: 'Bookmarks Menu',
      children: [],
    },
    other: {
      id: 'other_root',
      title: 'Other Bookmarks',
      children: [],
    },
  });

  describe('flattenBookmarks', () => {
    it('should flatten bookmark tree into a map', () => {
      const bookmarks = createTestBookmarks();
      const map = flattenBookmarks(bookmarks);

      expect(map.size).toBe(3); // b1, f1, b2
      expect(map.has('b1')).toBe(true);
      expect(map.has('f1')).toBe(true);
      expect(map.has('b2')).toBe(true);
    });

    it('should include correct paths for each item', () => {
      const bookmarks = createTestBookmarks();
      const map = flattenBookmarks(bookmarks);

      expect(map.get('b1').path).toBe('toolbar/Example');
      expect(map.get('f1').path).toBe('toolbar/Work');
      expect(map.get('b2').path).toBe('toolbar/Work/GitHub');
    });

    it('should handle empty bookmark data', () => {
      const bookmarks = {
        toolbar: { id: 'toolbar', title: 'Toolbar', children: [] },
        menu: { id: 'menu', title: 'Menu', children: [] },
        other: { id: 'other', title: 'Other', children: [] },
      };
      const map = flattenBookmarks(bookmarks);

      expect(map.size).toBe(0);
    });

    it('should handle deeply nested folders', () => {
      const bookmarks = {
        toolbar: {
          id: 'toolbar',
          title: 'Toolbar',
          children: [
            {
              id: 'f1',
              type: 'folder',
              title: 'Level1',
              children: [
                {
                  id: 'f2',
                  type: 'folder',
                  title: 'Level2',
                  children: [
                    {
                      id: 'b1',
                      type: 'bookmark',
                      title: 'Deep',
                      url: 'https://deep.com',
                    },
                  ],
                },
              ],
            },
          ],
        },
        menu: { id: 'menu', title: 'Menu', children: [] },
        other: { id: 'other', title: 'Other', children: [] },
      };
      const map = flattenBookmarks(bookmarks);

      expect(map.get('b1').path).toBe('toolbar/Level1/Level2/Deep');
    });
  });

  describe('areBookmarksEqual', () => {
    it('should return true for identical bookmarks', () => {
      const b1 = { type: 'bookmark', title: 'Test', url: 'https://test.com' };
      const b2 = { type: 'bookmark', title: 'Test', url: 'https://test.com' };

      expect(areBookmarksEqual(b1, b2)).toBe(true);
    });

    it('should return false for different types', () => {
      const b1 = { type: 'bookmark', title: 'Test', url: 'https://test.com' };
      const b2 = { type: 'folder', title: 'Test' };

      expect(areBookmarksEqual(b1, b2)).toBe(false);
    });

    it('should return false for different titles', () => {
      const b1 = { type: 'bookmark', title: 'Test 1', url: 'https://test.com' };
      const b2 = { type: 'bookmark', title: 'Test 2', url: 'https://test.com' };

      expect(areBookmarksEqual(b1, b2)).toBe(false);
    });

    it('should return false for different URLs', () => {
      const b1 = { type: 'bookmark', title: 'Test', url: 'https://test1.com' };
      const b2 = { type: 'bookmark', title: 'Test', url: 'https://test2.com' };

      expect(areBookmarksEqual(b1, b2)).toBe(false);
    });

    it('should return true for identical folders', () => {
      const f1 = { type: 'folder', title: 'Work', children: [] };
      const f2 = { type: 'folder', title: 'Work', children: [] };

      expect(areBookmarksEqual(f1, f2)).toBe(true);
    });
  });

  describe('detectChanges', () => {
    it('should detect no changes when bookmarks are identical', () => {
      const bookmarks = createTestBookmarks();
      const { localChanges, remoteChanges } = detectChanges(bookmarks, bookmarks);

      expect(localChanges).toHaveLength(0);
      expect(remoteChanges).toHaveLength(0);
    });

    it('should detect added bookmark locally', () => {
      const local = createTestBookmarks();
      const remote = createTestBookmarks();

      // Add a new bookmark locally
      local.toolbar.children.push({
        id: 'b3',
        type: 'bookmark',
        title: 'New Site',
        url: 'https://newsite.com',
        dateAdded: '2025-01-02T00:00:00.000Z',
      });

      const { localChanges, remoteChanges } = detectChanges(local, remote);

      expect(localChanges).toHaveLength(1);
      expect(localChanges[0].id).toBe('b3');
      expect(localChanges[0].type).toBe(CHANGE_TYPE.ADDED);
    });

    it('should detect added bookmark remotely', () => {
      const local = createTestBookmarks();
      const remote = createTestBookmarks();

      // Add a new bookmark remotely
      remote.toolbar.children.push({
        id: 'b3',
        type: 'bookmark',
        title: 'New Site',
        url: 'https://newsite.com',
        dateAdded: '2025-01-02T00:00:00.000Z',
      });

      const { localChanges, remoteChanges } = detectChanges(local, remote);

      expect(remoteChanges).toHaveLength(1);
      expect(remoteChanges[0].id).toBe('b3');
      expect(remoteChanges[0].type).toBe(CHANGE_TYPE.ADDED);
    });

    it('should detect modified bookmark', () => {
      const local = createTestBookmarks();
      const remote = createTestBookmarks();

      // Modify bookmark locally
      local.toolbar.children[0].title = 'Modified Example';

      const { localChanges } = detectChanges(local, remote);

      expect(localChanges).toHaveLength(1);
      expect(localChanges[0].id).toBe('b1');
      expect(localChanges[0].type).toBe(CHANGE_TYPE.MODIFIED);
    });
  });

  describe('findConflicts', () => {
    it('should find conflicts when same item changed in both places', () => {
      const localChanges = [
        { id: 'b1', type: CHANGE_TYPE.MODIFIED, after: { title: 'Local Title' } },
      ];
      const remoteChanges = [
        { id: 'b1', type: CHANGE_TYPE.MODIFIED, after: { title: 'Remote Title' } },
      ];

      const conflicts = findConflicts(localChanges, remoteChanges);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].localChange.id).toBe('b1');
      expect(conflicts[0].remoteChange.id).toBe('b1');
    });

    it('should not find conflicts for different items', () => {
      const localChanges = [
        { id: 'b1', type: CHANGE_TYPE.MODIFIED, after: { title: 'Local Title' } },
      ];
      const remoteChanges = [
        { id: 'b2', type: CHANGE_TYPE.MODIFIED, after: { title: 'Remote Title' } },
      ];

      const conflicts = findConflicts(localChanges, remoteChanges);

      expect(conflicts).toHaveLength(0);
    });

    it('should return empty array when no changes', () => {
      const conflicts = findConflicts([], []);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('getParentPath', () => {
    it('should return parent path for nested item', () => {
      expect(getParentPath('toolbar/Work/Projects/Item')).toBe('toolbar/Work/Projects');
    });

    it('should return root for top-level item', () => {
      expect(getParentPath('toolbar/Item')).toBe('toolbar');
    });

    it('should return empty string for root item', () => {
      expect(getParentPath('toolbar')).toBe('');
    });
  });

  describe('summarizeChanges', () => {
    it('should count changes by type', () => {
      const changes = [
        { type: CHANGE_TYPE.ADDED },
        { type: CHANGE_TYPE.ADDED },
        { type: CHANGE_TYPE.MODIFIED },
        { type: CHANGE_TYPE.DELETED },
      ];

      const summary = summarizeChanges(changes);

      expect(summary.added).toBe(2);
      expect(summary.modified).toBe(1);
      expect(summary.deleted).toBe(1);
      expect(summary.moved).toBe(0);
      expect(summary.total).toBe(4);
    });

    it('should handle empty changes array', () => {
      const summary = summarizeChanges([]);

      expect(summary.total).toBe(0);
      expect(summary.added).toBe(0);
      expect(summary.modified).toBe(0);
      expect(summary.deleted).toBe(0);
    });
  });
});
