import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyBookmarkFile,
  createBookmarkItem,
  createFolderItem,
  createSeparatorItem,
  BOOKMARK_TYPES,
  ROOT_FOLDER_IDS,
  CURRENT_SCHEMA_VERSION,
  CURRENT_VERSION_STRING,
} from '../src/bookmark.js';

describe('bookmark types', () => {
  describe('createEmptyBookmarkFile', () => {
    it('should create a valid empty bookmark file structure', () => {
      const file = createEmptyBookmarkFile();

      expect(file.version).toBe(CURRENT_VERSION_STRING);
      expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(file.metadata).toBeDefined();
      expect(file.bookmarks).toBeDefined();
    });

    it('should have valid metadata', () => {
      const file = createEmptyBookmarkFile();

      expect(file.metadata.lastModified).toBeDefined();
      expect(file.metadata.lastSyncedBy).toBe('');
      expect(file.metadata.checksum).toBe('');
      // Verify lastModified is a valid ISO date
      expect(() => new Date(file.metadata.lastModified)).not.toThrow();
    });

    it('should have all three root folders', () => {
      const file = createEmptyBookmarkFile();

      expect(file.bookmarks.toolbar).toBeDefined();
      expect(file.bookmarks.menu).toBeDefined();
      expect(file.bookmarks.other).toBeDefined();
    });

    it('should have correct root folder IDs', () => {
      const file = createEmptyBookmarkFile();

      expect(file.bookmarks.toolbar.id).toBe(ROOT_FOLDER_IDS.TOOLBAR);
      expect(file.bookmarks.menu.id).toBe(ROOT_FOLDER_IDS.MENU);
      expect(file.bookmarks.other.id).toBe(ROOT_FOLDER_IDS.OTHER);
    });

    it('should have empty children arrays for all root folders', () => {
      const file = createEmptyBookmarkFile();

      expect(file.bookmarks.toolbar.children).toEqual([]);
      expect(file.bookmarks.menu.children).toEqual([]);
      expect(file.bookmarks.other.children).toEqual([]);
    });
  });

  describe('createBookmarkItem', () => {
    it('should create a bookmark with required fields', () => {
      const bookmark = createBookmarkItem({
        id: 'test-id',
        title: 'Test Bookmark',
        url: 'https://example.com',
      });

      expect(bookmark.id).toBe('test-id');
      expect(bookmark.title).toBe('Test Bookmark');
      expect(bookmark.url).toBe('https://example.com');
      expect(bookmark.type).toBe(BOOKMARK_TYPES.BOOKMARK);
    });

    it('should set dateAdded to current timestamp', () => {
      const before = new Date().toISOString();
      const bookmark = createBookmarkItem({
        id: 'test-id',
        title: 'Test',
        url: 'https://example.com',
      });
      const after = new Date().toISOString();

      expect(bookmark.dateAdded >= before).toBe(true);
      expect(bookmark.dateAdded <= after).toBe(true);
    });
  });

  describe('createFolderItem', () => {
    it('should create a folder with required fields', () => {
      const folder = createFolderItem({
        id: 'folder-id',
        title: 'Test Folder',
      });

      expect(folder.id).toBe('folder-id');
      expect(folder.title).toBe('Test Folder');
      expect(folder.type).toBe(BOOKMARK_TYPES.FOLDER);
      expect(folder.children).toEqual([]);
    });

    it('should accept children array', () => {
      const children = [
        createBookmarkItem({ id: 'child-1', title: 'Child', url: 'https://example.com' }),
      ];
      const folder = createFolderItem({
        id: 'folder-id',
        title: 'Test Folder',
        children,
      });

      expect(folder.children).toHaveLength(1);
      expect(folder.children[0].id).toBe('child-1');
    });

    it('should set dateAdded to current timestamp', () => {
      const before = new Date().toISOString();
      const folder = createFolderItem({ id: 'test-id', title: 'Test' });
      const after = new Date().toISOString();

      expect(folder.dateAdded >= before).toBe(true);
      expect(folder.dateAdded <= after).toBe(true);
    });
  });

  describe('createSeparatorItem', () => {
    it('should create a separator with correct type', () => {
      const separator = createSeparatorItem('sep-id');

      expect(separator.id).toBe('sep-id');
      expect(separator.type).toBe(BOOKMARK_TYPES.SEPARATOR);
      expect(separator.title).toBe('');
    });

    it('should set dateAdded to current timestamp', () => {
      const before = new Date().toISOString();
      const separator = createSeparatorItem('sep-id');
      const after = new Date().toISOString();

      expect(separator.dateAdded >= before).toBe(true);
      expect(separator.dateAdded <= after).toBe(true);
    });
  });

  describe('constants', () => {
    it('should have correct BOOKMARK_TYPES values', () => {
      expect(BOOKMARK_TYPES.BOOKMARK).toBe('bookmark');
      expect(BOOKMARK_TYPES.FOLDER).toBe('folder');
      expect(BOOKMARK_TYPES.SEPARATOR).toBe('separator');
    });

    it('should have correct ROOT_FOLDER_IDS values', () => {
      expect(ROOT_FOLDER_IDS.TOOLBAR).toBe('toolbar_root');
      expect(ROOT_FOLDER_IDS.MENU).toBe('menu_root');
      expect(ROOT_FOLDER_IDS.OTHER).toBe('other_root');
    });
  });
});
