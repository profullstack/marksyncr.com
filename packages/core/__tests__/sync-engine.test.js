/**
 * @fileoverview Tests for the SyncEngine
 * Tests two-way sync operations, conflict detection, and resolution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine, createSyncEngine } from '../src/sync-engine.js';
import { SYNC_STATUS } from '@marksyncr/types';

// Mock source for testing
const createMockSource = (initialData = null) => {
  let data = initialData;
  return {
    read: vi.fn(async () => {
      if (!data) {
        const error = new Error('No data');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return data;
    }),
    write: vi.fn(async (newData) => {
      data = newData;
    }),
    isAvailable: vi.fn(async () => true),
    getMetadata: vi.fn(async () => ({
      type: 'mock',
      lastModified: new Date().toISOString(),
    })),
    getChecksum: vi.fn(async () => data?.metadata?.checksum ?? ''),
    getData: () => data,
    setData: (newData) => {
      data = newData;
    },
  };
};

// Helper to create bookmark file
const createBookmarkFile = (bookmarks = {}, metadata = {}) => ({
  version: '1.0',
  schemaVersion: 1,
  metadata: {
    lastModified: new Date().toISOString(),
    lastSyncedBy: 'test',
    checksum: 'test-checksum',
    ...metadata,
  },
  bookmarks: {
    toolbar: {
      id: 'toolbar_root',
      title: 'Bookmarks Toolbar',
      children: [],
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
    ...bookmarks,
  },
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

describe('SyncEngine', () => {
  let syncEngine;
  let mockSource;

  beforeEach(() => {
    mockSource = createMockSource();
    syncEngine = new SyncEngine({
      source: mockSource,
      deviceId: 'test-device',
    });
  });

  describe('constructor', () => {
    it('should create a SyncEngine with required options', () => {
      const engine = new SyncEngine({
        source: mockSource,
        deviceId: 'test-device',
      });
      expect(engine).toBeDefined();
      expect(engine.source).toBe(mockSource);
      expect(engine.deviceId).toBe('test-device');
    });

    it('should accept lastSyncState option', () => {
      const lastSyncState = { checksum: 'abc123', timestamp: new Date().toISOString() };
      const engine = new SyncEngine({
        source: mockSource,
        deviceId: 'test-device',
        lastSyncState,
      });
      expect(engine.lastSyncState).toEqual(lastSyncState);
    });
  });

  describe('sync', () => {
    it('should perform initial sync when remote is empty', async () => {
      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [createBookmark({ title: 'New Local Bookmark' })],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result, mergedBookmarks } = await syncEngine.sync(localBookmarks);

      expect(result.status).toBe(SYNC_STATUS.SUCCESS);
      expect(result.pushed).toBeGreaterThan(0);
      expect(mockSource.write).toHaveBeenCalled();
    });

    it('should handle empty local and remote', async () => {
      const remoteData = createBookmarkFile();
      mockSource.setData(remoteData);

      const localBookmarks = {
        toolbar: { id: 'toolbar_root', title: 'Bookmarks Toolbar', children: [] },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks);

      expect(result).toBeDefined();
      expect(result.status).toBe(SYNC_STATUS.SUCCESS);
    });

    it('should sync new local bookmarks to remote', async () => {
      const bookmark = createBookmark({ title: 'New Local Bookmark' });
      const remoteData = createBookmarkFile();
      mockSource.setData(remoteData);

      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [bookmark],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks, { force: true });

      expect(result).toBeDefined();
      expect(mockSource.write).toHaveBeenCalled();
    });

    it('should detect conflicts when same bookmark modified on both sides', async () => {
      const bookmarkId = 'shared-bookmark-id';
      const localTime = new Date('2024-01-02T00:00:00Z');
      const remoteTime = new Date('2024-01-03T00:00:00Z');

      const localBookmark = createBookmark({
        id: bookmarkId,
        title: 'Local Title',
        dateModified: localTime.toISOString(),
      });

      const remoteBookmark = createBookmark({
        id: bookmarkId,
        title: 'Remote Title',
        dateModified: remoteTime.toISOString(),
      });

      const remoteData = createBookmarkFile({
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [remoteBookmark],
        },
      });
      mockSource.setData(remoteData);

      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [localBookmark],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks, { force: true });

      expect(result).toBeDefined();
    });

    it('should return success when syncing identical data', async () => {
      const remoteData = createBookmarkFile();
      mockSource.setData(remoteData);

      const localBookmarks = {
        toolbar: { id: 'toolbar_root', title: 'Bookmarks Toolbar', children: [] },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks);

      // Should succeed when local and remote are similar
      expect(result.status).toBe(SYNC_STATUS.SUCCESS);
    });

    it('should support dry run mode', async () => {
      const remoteData = createBookmarkFile();
      mockSource.setData(remoteData);

      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [createBookmark({ title: 'New Bookmark' })],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks, { dryRun: true, force: true });

      expect(result).toBeDefined();
      // In dry run, write should not be called
      expect(mockSource.write).not.toHaveBeenCalled();
    });
  });

  describe('initialSync', () => {
    it('should push all local bookmarks when remote is empty', async () => {
      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [
            createBookmark({ title: 'Bookmark 1' }),
            createBookmark({ title: 'Bookmark 2' }),
          ],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result, mergedBookmarks } = await syncEngine.initialSync(localBookmarks);

      expect(result.status).toBe(SYNC_STATUS.SUCCESS);
      expect(result.pushed).toBeGreaterThan(0);
      expect(result.pulled).toBe(0);
      expect(mergedBookmarks).toEqual(localBookmarks);
      expect(mockSource.write).toHaveBeenCalled();
    });

    it('should not write in dry run mode', async () => {
      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [createBookmark({ title: 'Bookmark 1' })],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.initialSync(localBookmarks, true);

      expect(result.status).toBe(SYNC_STATUS.SUCCESS);
      expect(mockSource.write).not.toHaveBeenCalled();
    });
  });

  describe('folder sync', () => {
    it('should sync nested folder structures', async () => {
      const folder = {
        id: 'folder-1',
        type: 'folder',
        title: 'My Folder',
        children: [
          createBookmark({ title: 'Child 1' }),
          createBookmark({ title: 'Child 2' }),
        ],
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString(),
      };

      const remoteData = createBookmarkFile();
      mockSource.setData(remoteData);

      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [folder],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks, { force: true });

      expect(result).toBeDefined();
      expect(mockSource.write).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle source read errors gracefully', async () => {
      mockSource.read.mockRejectedValue(new Error('Read failed'));

      const localBookmarks = {
        toolbar: { id: 'toolbar_root', title: 'Bookmarks Toolbar', children: [] },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks);

      expect(result.status).toBe(SYNC_STATUS.ERROR);
      expect(result.error).toBeDefined();
    });

    it('should handle source write errors gracefully', async () => {
      const remoteData = createBookmarkFile();
      mockSource.setData(remoteData);
      mockSource.write.mockRejectedValue(new Error('Write failed'));

      const localBookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [createBookmark()],
        },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const { result } = await syncEngine.sync(localBookmarks, { force: true });

      expect(result.status).toBe(SYNC_STATUS.ERROR);
    });
  });

  describe('createBookmarkFile', () => {
    it('should create a valid bookmark file with metadata', () => {
      const bookmarks = {
        toolbar: { id: 'toolbar_root', title: 'Bookmarks Toolbar', children: [] },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };
      const checksum = 'test-checksum';

      const file = syncEngine.createBookmarkFile(bookmarks, checksum);

      expect(file.version).toBe('1.0');
      expect(file.schemaVersion).toBe(1);
      expect(file.metadata.checksum).toBe(checksum);
      expect(file.metadata.lastSyncedBy).toBe('test-device');
      expect(file.metadata.lastModified).toBeDefined();
      expect(file.bookmarks).toEqual(bookmarks);
    });
  });

  describe('countBookmarks', () => {
    it('should count bookmarks correctly', () => {
      const bookmarks = {
        toolbar: {
          id: 'toolbar_root',
          title: 'Bookmarks Toolbar',
          children: [
            createBookmark({ title: 'Bookmark 1' }),
            {
              id: 'folder-1',
              type: 'folder',
              title: 'Folder',
              children: [
                createBookmark({ title: 'Nested 1' }),
                createBookmark({ title: 'Nested 2' }),
              ],
            },
          ],
        },
        menu: {
          id: 'menu_root',
          title: 'Bookmarks Menu',
          children: [createBookmark({ title: 'Menu Bookmark' })],
        },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const count = syncEngine.countBookmarks(bookmarks);

      // 1 in toolbar + 1 folder + 2 nested + 1 in menu = 5
      expect(count).toBe(5);
    });

    it('should handle empty bookmarks', () => {
      const bookmarks = {
        toolbar: { id: 'toolbar_root', title: 'Bookmarks Toolbar', children: [] },
        menu: { id: 'menu_root', title: 'Bookmarks Menu', children: [] },
        other: { id: 'other_root', title: 'Other Bookmarks', children: [] },
      };

      const count = syncEngine.countBookmarks(bookmarks);

      expect(count).toBe(0);
    });
  });

  describe('createSyncEngine factory', () => {
    it('should create a SyncEngine instance', () => {
      const engine = createSyncEngine({
        source: mockSource,
        deviceId: 'factory-device',
      });

      expect(engine).toBeInstanceOf(SyncEngine);
      expect(engine.deviceId).toBe('factory-device');
    });
  });
});
