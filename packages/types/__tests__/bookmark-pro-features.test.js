/**
 * @fileoverview Comprehensive tests for bookmark Pro features (tags, notes, link status)
 * Using Vitest (project's existing test framework)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Constants
  CURRENT_SCHEMA_VERSION,
  CURRENT_VERSION_STRING,
  BOOKMARK_TYPES,
  ROOT_FOLDER_IDS,
  LINK_STATUS,
  DEFAULT_TAG_COLORS,
  // Factory functions
  createEmptyBookmarkFile,
  createBookmarkItem,
  createFolderItem,
  createSeparatorItem,
  createBookmarkItemWithProFeatures,
  createTag,
  // Bookmark modification functions
  addTagsToBookmark,
  removeTagsFromBookmark,
  updateBookmarkNotes,
  updateBookmarkLinkStatus,
  // Migration functions
  migrateToSchemaV2,
  needsMigration,
  // Query functions
  getAllTagsFromBookmarks,
  findBookmarksByTag,
  findBrokenLinks,
} from '../src/bookmark.js';

describe('Bookmark Pro Features', () => {
  describe('Constants', () => {
    it('should have correct schema version', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(2);
      expect(CURRENT_VERSION_STRING).toBe('1.1');
    });

    it('should have all bookmark types defined', () => {
      expect(BOOKMARK_TYPES.BOOKMARK).toBe('bookmark');
      expect(BOOKMARK_TYPES.FOLDER).toBe('folder');
      expect(BOOKMARK_TYPES.SEPARATOR).toBe('separator');
    });

    it('should have all root folder IDs defined', () => {
      expect(ROOT_FOLDER_IDS.TOOLBAR).toBe('toolbar_root');
      expect(ROOT_FOLDER_IDS.MENU).toBe('menu_root');
      expect(ROOT_FOLDER_IDS.OTHER).toBe('other_root');
    });

    it('should have all link statuses defined', () => {
      expect(LINK_STATUS.VALID).toBe('valid');
      expect(LINK_STATUS.BROKEN).toBe('broken');
      expect(LINK_STATUS.REDIRECT).toBe('redirect');
      expect(LINK_STATUS.TIMEOUT).toBe('timeout');
      expect(LINK_STATUS.UNKNOWN).toBe('unknown');
    });

    it('should have default tag colors', () => {
      expect(DEFAULT_TAG_COLORS).toBeInstanceOf(Array);
      expect(DEFAULT_TAG_COLORS.length).toBeGreaterThan(0);
      expect(DEFAULT_TAG_COLORS[0]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  describe('createEmptyBookmarkFile', () => {
    it('should create empty bookmark file with default options', () => {
      const file = createEmptyBookmarkFile();

      expect(file.version).toBe(CURRENT_VERSION_STRING);
      expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(file.metadata).toBeDefined();
      expect(file.metadata.lastModified).toBeDefined();
      expect(file.metadata.lastSyncedBy).toBe('');
      expect(file.metadata.checksum).toBe('');
      expect(file.bookmarks.toolbar.id).toBe('toolbar_root');
      expect(file.bookmarks.menu.id).toBe('menu_root');
      expect(file.bookmarks.other.id).toBe('other_root');
      expect(file.tags).toBeUndefined();
    });

    it('should create empty bookmark file with Pro features', () => {
      const file = createEmptyBookmarkFile({ includeProFeatures: true });

      expect(file.tags).toBeDefined();
      expect(file.tags).toEqual([]);
    });

    it('should have empty children arrays', () => {
      const file = createEmptyBookmarkFile();

      expect(file.bookmarks.toolbar.children).toEqual([]);
      expect(file.bookmarks.menu.children).toEqual([]);
      expect(file.bookmarks.other.children).toEqual([]);
    });
  });

  describe('createBookmarkItem', () => {
    it('should create a basic bookmark item', () => {
      const bookmark = createBookmarkItem({
        id: 'test-id',
        title: 'Test Bookmark',
        url: 'https://example.com',
      });

      expect(bookmark.id).toBe('test-id');
      expect(bookmark.type).toBe('bookmark');
      expect(bookmark.title).toBe('Test Bookmark');
      expect(bookmark.url).toBe('https://example.com');
      expect(bookmark.dateAdded).toBeDefined();
      expect(new Date(bookmark.dateAdded).getTime()).not.toBeNaN();
    });

    it('should not include Pro features by default', () => {
      const bookmark = createBookmarkItem({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      expect(bookmark.tags).toBeUndefined();
      expect(bookmark.notes).toBeUndefined();
      expect(bookmark.linkStatus).toBeUndefined();
    });
  });

  describe('createBookmarkItemWithProFeatures', () => {
    it('should create bookmark with Pro features', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test Bookmark',
        url: 'https://example.com',
      });

      expect(bookmark.id).toBe('test-id');
      expect(bookmark.type).toBe('bookmark');
      expect(bookmark.title).toBe('Test Bookmark');
      expect(bookmark.url).toBe('https://example.com');
      expect(bookmark.tags).toEqual([]);
      expect(bookmark.notes).toBe('');
      expect(bookmark.linkStatus).toBe('unknown');
    });

    it('should accept initial tags', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
        tags: ['work', 'important'],
      });

      expect(bookmark.tags).toEqual(['work', 'important']);
    });

    it('should accept initial notes', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
        notes: 'This is a test note',
      });

      expect(bookmark.notes).toBe('This is a test note');
    });
  });

  describe('createFolderItem', () => {
    it('should create a folder item', () => {
      const folder = createFolderItem({
        id: 'folder-id',
        title: 'Test Folder',
      });

      expect(folder.id).toBe('folder-id');
      expect(folder.type).toBe('folder');
      expect(folder.title).toBe('Test Folder');
      expect(folder.children).toEqual([]);
      expect(folder.dateAdded).toBeDefined();
    });

    it('should accept initial children', () => {
      const child = createBookmarkItem({
        id: 'child-id',
        title: 'Child',
        url: 'https://example.com',
      });

      const folder = createFolderItem({
        id: 'folder-id',
        title: 'Test Folder',
        children: [child],
      });

      expect(folder.children).toHaveLength(1);
      expect(folder.children[0].id).toBe('child-id');
    });
  });

  describe('createSeparatorItem', () => {
    it('should create a separator item', () => {
      const separator = createSeparatorItem('sep-id');

      expect(separator.id).toBe('sep-id');
      expect(separator.type).toBe('separator');
      expect(separator.title).toBe('');
      expect(separator.dateAdded).toBeDefined();
    });
  });

  describe('createTag', () => {
    it('should create a tag with default color', () => {
      const tag = createTag({ name: 'Work' });

      expect(tag.name).toBe('work'); // lowercase
      expect(tag.color).toBe('#3B82F6');
    });

    it('should create a tag with custom color', () => {
      const tag = createTag({ name: 'Important', color: '#EF4444' });

      expect(tag.name).toBe('important');
      expect(tag.color).toBe('#EF4444');
    });

    it('should trim whitespace from tag name', () => {
      const tag = createTag({ name: '  Spaced Tag  ' });

      expect(tag.name).toBe('spaced tag');
    });
  });

  describe('addTagsToBookmark', () => {
    let bookmark;

    beforeEach(() => {
      bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
        tags: ['existing'],
      });
    });

    it('should add new tags to bookmark', () => {
      const updated = addTagsToBookmark(bookmark, ['new-tag']);

      expect(updated.tags).toContain('existing');
      expect(updated.tags).toContain('new-tag');
      expect(updated.dateModified).toBeDefined();
    });

    it('should not duplicate existing tags', () => {
      const updated = addTagsToBookmark(bookmark, ['existing', 'new-tag']);

      expect(updated.tags.filter((t) => t === 'existing')).toHaveLength(1);
      expect(updated.tags).toHaveLength(2);
    });

    it('should handle bookmark without existing tags', () => {
      const basicBookmark = createBookmarkItem({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      const updated = addTagsToBookmark(basicBookmark, ['new-tag']);

      expect(updated.tags).toEqual(['new-tag']);
    });

    it('should not mutate original bookmark', () => {
      const original = { ...bookmark, tags: [...bookmark.tags] };
      addTagsToBookmark(bookmark, ['new-tag']);

      expect(bookmark.tags).toEqual(original.tags);
    });
  });

  describe('removeTagsFromBookmark', () => {
    let bookmark;

    beforeEach(() => {
      bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
        tags: ['tag1', 'tag2', 'tag3'],
      });
    });

    it('should remove specified tags', () => {
      const updated = removeTagsFromBookmark(bookmark, ['tag2']);

      expect(updated.tags).toContain('tag1');
      expect(updated.tags).toContain('tag3');
      expect(updated.tags).not.toContain('tag2');
      expect(updated.dateModified).toBeDefined();
    });

    it('should remove multiple tags', () => {
      const updated = removeTagsFromBookmark(bookmark, ['tag1', 'tag3']);

      expect(updated.tags).toEqual(['tag2']);
    });

    it('should handle removing non-existent tags', () => {
      const updated = removeTagsFromBookmark(bookmark, ['non-existent']);

      expect(updated.tags).toHaveLength(3);
    });

    it('should handle bookmark without tags', () => {
      const basicBookmark = createBookmarkItem({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      const updated = removeTagsFromBookmark(basicBookmark, ['tag1']);

      expect(updated.tags).toEqual([]);
    });
  });

  describe('updateBookmarkNotes', () => {
    it('should update notes on bookmark', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      const updated = updateBookmarkNotes(bookmark, 'New notes content');

      expect(updated.notes).toBe('New notes content');
      expect(updated.dateModified).toBeDefined();
    });

    it('should replace existing notes', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
        notes: 'Old notes',
      });

      const updated = updateBookmarkNotes(bookmark, 'New notes');

      expect(updated.notes).toBe('New notes');
    });

    it('should allow clearing notes', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
        notes: 'Some notes',
      });

      const updated = updateBookmarkNotes(bookmark, '');

      expect(updated.notes).toBe('');
    });
  });

  describe('updateBookmarkLinkStatus', () => {
    it('should update link status', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      const updated = updateBookmarkLinkStatus(bookmark, 'valid');

      expect(updated.linkStatus).toBe('valid');
      expect(updated.lastChecked).toBeDefined();
    });

    it('should update to broken status', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      const updated = updateBookmarkLinkStatus(bookmark, 'broken');

      expect(updated.linkStatus).toBe('broken');
    });

    it('should update lastChecked timestamp', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });

      const before = new Date();
      const updated = updateBookmarkLinkStatus(bookmark, 'valid');
      const after = new Date();

      const checkedDate = new Date(updated.lastChecked);
      expect(checkedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(checkedDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Schema Migration', () => {
    describe('needsMigration', () => {
      it('should return true for schema version 1', () => {
        const oldFile = {
          version: '1.0',
          schemaVersion: 1,
          metadata: {},
          bookmarks: { toolbar: { children: [] }, menu: { children: [] }, other: { children: [] } },
        };

        expect(needsMigration(oldFile)).toBe(true);
      });

      it('should return false for current schema version', () => {
        const currentFile = createEmptyBookmarkFile();

        expect(needsMigration(currentFile)).toBe(false);
      });

      it('should handle missing schemaVersion (assume v1)', () => {
        const oldFile = {
          version: '1.0',
          metadata: {},
          bookmarks: { toolbar: { children: [] }, menu: { children: [] }, other: { children: [] } },
        };

        expect(needsMigration(oldFile)).toBe(true);
      });
    });

    describe('migrateToSchemaV2', () => {
      it('should migrate v1 file to v2', () => {
        const oldFile = {
          version: '1.0',
          schemaVersion: 1,
          metadata: {
            lastModified: '2025-01-01T00:00:00.000Z',
            lastSyncedBy: 'device-1',
            checksum: 'abc123',
          },
          bookmarks: {
            toolbar: {
              id: 'toolbar_root',
              title: 'Toolbar',
              children: [
                {
                  id: 'bm-1',
                  type: 'bookmark',
                  title: 'Test',
                  url: 'https://example.com',
                  dateAdded: '2025-01-01T00:00:00.000Z',
                },
              ],
            },
            menu: { id: 'menu_root', title: 'Menu', children: [] },
            other: { id: 'other_root', title: 'Other', children: [] },
          },
        };

        const migrated = migrateToSchemaV2(oldFile);

        expect(migrated.version).toBe(CURRENT_VERSION_STRING);
        expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(migrated.tags).toEqual([]);

        // Check bookmark has Pro features
        const bookmark = migrated.bookmarks.toolbar.children[0];
        expect(bookmark.tags).toEqual([]);
        expect(bookmark.notes).toBe('');
        expect(bookmark.linkStatus).toBe('unknown');
      });

      it('should preserve existing metadata', () => {
        const oldFile = {
          version: '1.0',
          schemaVersion: 1,
          metadata: {
            lastModified: '2025-01-01T00:00:00.000Z',
            lastSyncedBy: 'device-1',
            checksum: 'abc123',
          },
          bookmarks: {
            toolbar: { id: 'toolbar_root', title: 'Toolbar', children: [] },
            menu: { id: 'menu_root', title: 'Menu', children: [] },
            other: { id: 'other_root', title: 'Other', children: [] },
          },
        };

        const migrated = migrateToSchemaV2(oldFile);

        expect(migrated.metadata.lastModified).toBe('2025-01-01T00:00:00.000Z');
        expect(migrated.metadata.lastSyncedBy).toBe('device-1');
        expect(migrated.metadata.checksum).toBe('abc123');
      });

      it('should migrate nested folders', () => {
        const oldFile = {
          version: '1.0',
          schemaVersion: 1,
          metadata: {},
          bookmarks: {
            toolbar: {
              id: 'toolbar_root',
              title: 'Toolbar',
              children: [
                {
                  id: 'folder-1',
                  type: 'folder',
                  title: 'Folder',
                  children: [
                    {
                      id: 'bm-nested',
                      type: 'bookmark',
                      title: 'Nested',
                      url: 'https://nested.com',
                      dateAdded: '2025-01-01T00:00:00.000Z',
                    },
                  ],
                },
              ],
            },
            menu: { id: 'menu_root', title: 'Menu', children: [] },
            other: { id: 'other_root', title: 'Other', children: [] },
          },
        };

        const migrated = migrateToSchemaV2(oldFile);

        const folder = migrated.bookmarks.toolbar.children[0];
        expect(folder.type).toBe('folder');

        const nestedBookmark = folder.children[0];
        expect(nestedBookmark.tags).toEqual([]);
        expect(nestedBookmark.notes).toBe('');
        expect(nestedBookmark.linkStatus).toBe('unknown');
      });

      it('should not modify already migrated files', () => {
        const currentFile = createEmptyBookmarkFile({ includeProFeatures: true });
        currentFile.bookmarks.toolbar.children.push(
          createBookmarkItemWithProFeatures({
            id: 'bm-1',
            title: 'Test',
            url: 'https://example.com',
            tags: ['existing-tag'],
            notes: 'Existing notes',
          })
        );

        const migrated = migrateToSchemaV2(currentFile);

        const bookmark = migrated.bookmarks.toolbar.children[0];
        expect(bookmark.tags).toEqual(['existing-tag']);
        expect(bookmark.notes).toBe('Existing notes');
      });

      it('should preserve existing tags on bookmarks', () => {
        const oldFile = {
          version: '1.0',
          schemaVersion: 1,
          metadata: {},
          bookmarks: {
            toolbar: {
              id: 'toolbar_root',
              title: 'Toolbar',
              children: [
                {
                  id: 'bm-1',
                  type: 'bookmark',
                  title: 'Test',
                  url: 'https://example.com',
                  dateAdded: '2025-01-01T00:00:00.000Z',
                  tags: ['pre-existing'],
                },
              ],
            },
            menu: { id: 'menu_root', title: 'Menu', children: [] },
            other: { id: 'other_root', title: 'Other', children: [] },
          },
        };

        const migrated = migrateToSchemaV2(oldFile);

        const bookmark = migrated.bookmarks.toolbar.children[0];
        expect(bookmark.tags).toEqual(['pre-existing']);
      });
    });
  });

  describe('Query Functions', () => {
    let bookmarkFile;

    beforeEach(() => {
      bookmarkFile = createEmptyBookmarkFile({ includeProFeatures: true });

      // Add bookmarks with various tags
      bookmarkFile.bookmarks.toolbar.children = [
        createBookmarkItemWithProFeatures({
          id: 'bm-1',
          title: 'Work Doc',
          url: 'https://work.com',
          tags: ['work', 'important'],
        }),
        createBookmarkItemWithProFeatures({
          id: 'bm-2',
          title: 'Personal',
          url: 'https://personal.com',
          tags: ['personal'],
        }),
        {
          id: 'folder-1',
          type: 'folder',
          title: 'Folder',
          dateAdded: new Date().toISOString(),
          children: [
            createBookmarkItemWithProFeatures({
              id: 'bm-3',
              title: 'Nested Work',
              url: 'https://nested-work.com',
              tags: ['work'],
            }),
          ],
        },
      ];

      bookmarkFile.bookmarks.menu.children = [
        createBookmarkItemWithProFeatures({
          id: 'bm-4',
          title: 'Menu Item',
          url: 'https://menu.com',
          tags: ['important'],
        }),
      ];
    });

    describe('getAllTagsFromBookmarks', () => {
      it('should return all unique tags', () => {
        const tags = getAllTagsFromBookmarks(bookmarkFile);

        expect(tags).toContain('work');
        expect(tags).toContain('important');
        expect(tags).toContain('personal');
        expect(tags).toHaveLength(3);
      });

      it('should return sorted tags', () => {
        const tags = getAllTagsFromBookmarks(bookmarkFile);

        expect(tags).toEqual(['important', 'personal', 'work']);
      });

      it('should find tags in nested folders', () => {
        const tags = getAllTagsFromBookmarks(bookmarkFile);

        expect(tags).toContain('work'); // from nested bookmark
      });

      it('should return empty array for file with no tags', () => {
        const emptyFile = createEmptyBookmarkFile();
        const tags = getAllTagsFromBookmarks(emptyFile);

        expect(tags).toEqual([]);
      });
    });

    describe('findBookmarksByTag', () => {
      it('should find all bookmarks with a specific tag', () => {
        const results = findBookmarksByTag(bookmarkFile, 'work');

        expect(results).toHaveLength(2);
        expect(results.map((b) => b.id)).toContain('bm-1');
        expect(results.map((b) => b.id)).toContain('bm-3');
      });

      it('should find bookmarks across all root folders', () => {
        const results = findBookmarksByTag(bookmarkFile, 'important');

        expect(results).toHaveLength(2);
        expect(results.map((b) => b.id)).toContain('bm-1');
        expect(results.map((b) => b.id)).toContain('bm-4');
      });

      it('should return empty array for non-existent tag', () => {
        const results = findBookmarksByTag(bookmarkFile, 'non-existent');

        expect(results).toEqual([]);
      });

      it('should find bookmarks in nested folders', () => {
        const results = findBookmarksByTag(bookmarkFile, 'work');

        const nestedBookmark = results.find((b) => b.id === 'bm-3');
        expect(nestedBookmark).toBeDefined();
      });
    });

    describe('findBrokenLinks', () => {
      beforeEach(() => {
        // Add some broken links
        bookmarkFile.bookmarks.toolbar.children[0] = updateBookmarkLinkStatus(
          bookmarkFile.bookmarks.toolbar.children[0],
          'broken'
        );

        bookmarkFile.bookmarks.toolbar.children[2].children[0] = updateBookmarkLinkStatus(
          bookmarkFile.bookmarks.toolbar.children[2].children[0],
          'broken'
        );
      });

      it('should find all broken links', () => {
        const broken = findBrokenLinks(bookmarkFile);

        expect(broken).toHaveLength(2);
        expect(broken.map((b) => b.id)).toContain('bm-1');
        expect(broken.map((b) => b.id)).toContain('bm-3');
      });

      it('should not include valid links', () => {
        const broken = findBrokenLinks(bookmarkFile);

        expect(broken.map((b) => b.id)).not.toContain('bm-2');
        expect(broken.map((b) => b.id)).not.toContain('bm-4');
      });

      it('should find broken links in nested folders', () => {
        const broken = findBrokenLinks(bookmarkFile);

        const nestedBroken = broken.find((b) => b.id === 'bm-3');
        expect(nestedBroken).toBeDefined();
      });

      it('should return empty array when no broken links', () => {
        const cleanFile = createEmptyBookmarkFile();
        cleanFile.bookmarks.toolbar.children.push(
          updateBookmarkLinkStatus(
            createBookmarkItemWithProFeatures({
              id: 'bm-valid',
              title: 'Valid',
              url: 'https://valid.com',
            }),
            'valid'
          )
        );

        const broken = findBrokenLinks(cleanFile);

        expect(broken).toEqual([]);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle deeply nested folder structures', () => {
      const file = createEmptyBookmarkFile({ includeProFeatures: true });

      // Create 5 levels of nesting
      let currentFolder = file.bookmarks.toolbar;
      for (let i = 0; i < 5; i++) {
        const newFolder = createFolderItem({
          id: `folder-${i}`,
          title: `Level ${i}`,
        });
        currentFolder.children.push(newFolder);
        currentFolder = newFolder;
      }

      // Add bookmark at deepest level
      currentFolder.children.push(
        createBookmarkItemWithProFeatures({
          id: 'deep-bookmark',
          title: 'Deep',
          url: 'https://deep.com',
          tags: ['deep-tag'],
        })
      );

      const tags = getAllTagsFromBookmarks(file);
      expect(tags).toContain('deep-tag');

      const results = findBookmarksByTag(file, 'deep-tag');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('deep-bookmark');
    });

    it('should handle empty tags array', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test',
        title: 'Test',
        url: 'https://test.com',
        tags: [],
      });

      const updated = addTagsToBookmark(bookmark, []);
      expect(updated.tags).toEqual([]);
    });

    it('should handle special characters in tags', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test',
        title: 'Test',
        url: 'https://test.com',
      });

      const updated = addTagsToBookmark(bookmark, ['tag-with-dash', 'tag_with_underscore']);
      expect(updated.tags).toContain('tag-with-dash');
      expect(updated.tags).toContain('tag_with_underscore');
    });

    it('should handle unicode in notes', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test',
        title: 'Test',
        url: 'https://test.com',
      });

      const updated = updateBookmarkNotes(bookmark, '日本語のノート 🎉');
      expect(updated.notes).toBe('日本語のノート 🎉');
    });

    it('should handle very long notes', () => {
      const bookmark = createBookmarkItemWithProFeatures({
        id: 'test',
        title: 'Test',
        url: 'https://test.com',
      });

      const longNotes = 'A'.repeat(10000);
      const updated = updateBookmarkNotes(bookmark, longNotes);
      expect(updated.notes).toBe(longNotes);
      expect(updated.notes.length).toBe(10000);
    });
  });
});
