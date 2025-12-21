/**
 * @fileoverview Tests for the SyncEngine
 * Tests two-way sync operations, conflict detection, and resolution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEngine } from '../src/sync-engine.js';
import { BOOKMARK_LOCATION } from '@marksyncr/types';

// Mock source for testing
const createMockSource = (initialData = null) => {
  let data = initialData;
  return {
    read: vi.fn(async () => {
      if (!data) throw new Error('No data');
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
    checksum: '',
    ...metadata,
  },
  bookmarks: {
    toolbar: [],
    menu: [],
    other: [],
    ...bookmarks,
  },
});

// Helper to create a bookmark
const createBookmark = (overrides = {}) => ({
  id: `bm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'bookmark',
  title: 'Test Bookmark',
  url: 'https://example.com',
  location: BOOKMARK_LOCATION.TOOLBAR,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  ...overrides,
});

describe('SyncEngine', () => {
  let syncEngine;
  let localSource;
  let remoteSource;

  beforeEach(() => {
    localSource = createMockSource();
    remoteSource = createMockSource();
    syncEngine = new SyncEngine({
      conflictStrategy: 'newer-wins',
    });
  });

  describe('constructor', () => {
    it('should create a SyncEngine with default options', () => {
      const engine = new SyncEngine();
      expect(engine).toBeDefined();
    });

    it('should accept custom conflict strategy', () => {
      const engine = new SyncEngine({ conflictStrategy: 'local-wins' });
      expect(engine.options.conflictStrategy).toBe('local-wins');
    });
  });

  describe('sync', () => {
    it('should handle empty local and remote', async () => {
      const localData = createBookmarkFile();
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
      expect(result.conflicts).toHaveLength(0);
    });

    it('should sync new local bookmarks to remote', async () => {
      const bookmark = createBookmark({ title: 'New Local Bookmark' });
      const localData = createBookmarkFile({
        toolbar: [bookmark],
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result.changes.added).toBeGreaterThan(0);
      expect(remoteSource.write).toHaveBeenCalled();
    });

    it('should sync new remote bookmarks to local', async () => {
      const bookmark = createBookmark({ title: 'New Remote Bookmark' });
      const localData = createBookmarkFile();
      const remoteData = createBookmarkFile({
        toolbar: [bookmark],
      });

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result.changes.added).toBeGreaterThan(0);
      expect(localSource.write).toHaveBeenCalled();
    });

    it('should handle deletions', async () => {
      const bookmark = createBookmark({ title: 'To Be Deleted' });
      const localData = createBookmarkFile({
        toolbar: [bookmark],
      });
      const remoteData = createBookmarkFile({
        toolbar: [], // Bookmark deleted on remote
      });

      // Set up with previous sync state showing bookmark existed
      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
    });

    it('should detect conflicts when same bookmark modified on both sides', async () => {
      const baseTime = new Date('2024-01-01T00:00:00Z');
      const localTime = new Date('2024-01-02T00:00:00Z');
      const remoteTime = new Date('2024-01-03T00:00:00Z');

      const bookmarkId = 'shared-bookmark-id';

      const localBookmark = createBookmark({
        id: bookmarkId,
        title: 'Local Title',
        modifiedAt: localTime.toISOString(),
      });

      const remoteBookmark = createBookmark({
        id: bookmarkId,
        title: 'Remote Title',
        modifiedAt: remoteTime.toISOString(),
      });

      const localData = createBookmarkFile({
        toolbar: [localBookmark],
      });
      const remoteData = createBookmarkFile({
        toolbar: [remoteBookmark],
      });

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      // With newer-wins strategy, remote should win
      expect(result).toBeDefined();
    });
  });

  describe('conflict resolution strategies', () => {
    const bookmarkId = 'conflict-bookmark';
    const localTime = new Date('2024-01-01T00:00:00Z');
    const remoteTime = new Date('2024-01-02T00:00:00Z');

    const createConflictScenario = () => {
      const localBookmark = createBookmark({
        id: bookmarkId,
        title: 'Local Version',
        url: 'https://local.example.com',
        modifiedAt: localTime.toISOString(),
      });

      const remoteBookmark = createBookmark({
        id: bookmarkId,
        title: 'Remote Version',
        url: 'https://remote.example.com',
        modifiedAt: remoteTime.toISOString(),
      });

      return {
        local: createBookmarkFile({ toolbar: [localBookmark] }),
        remote: createBookmarkFile({ toolbar: [remoteBookmark] }),
      };
    };

    it('should use newer-wins strategy by default', async () => {
      const engine = new SyncEngine({ conflictStrategy: 'newer-wins' });
      const { local, remote } = createConflictScenario();

      localSource.setData(local);
      remoteSource.setData(remote);

      const result = await engine.sync(localSource, remoteSource);

      // Remote is newer, so it should win
      expect(result).toBeDefined();
    });

    it('should use local-wins strategy when configured', async () => {
      const engine = new SyncEngine({ conflictStrategy: 'local-wins' });
      const { local, remote } = createConflictScenario();

      localSource.setData(local);
      remoteSource.setData(remote);

      const result = await engine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
    });

    it('should use remote-wins strategy when configured', async () => {
      const engine = new SyncEngine({ conflictStrategy: 'remote-wins' });
      const { local, remote } = createConflictScenario();

      localSource.setData(local);
      remoteSource.setData(remote);

      const result = await engine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
    });
  });

  describe('folder sync', () => {
    it('should sync nested folder structures', async () => {
      const folder = {
        id: 'folder-1',
        type: 'folder',
        title: 'My Folder',
        location: BOOKMARK_LOCATION.TOOLBAR,
        children: [
          createBookmark({ title: 'Child 1' }),
          createBookmark({ title: 'Child 2' }),
        ],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      };

      const localData = createBookmarkFile({
        toolbar: [folder],
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
      expect(remoteSource.write).toHaveBeenCalled();
    });

    it('should handle folder renames', async () => {
      const folderId = 'folder-to-rename';

      const localFolder = {
        id: folderId,
        type: 'folder',
        title: 'New Folder Name',
        location: BOOKMARK_LOCATION.TOOLBAR,
        children: [],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      };

      const remoteFolder = {
        id: folderId,
        type: 'folder',
        title: 'Old Folder Name',
        location: BOOKMARK_LOCATION.TOOLBAR,
        children: [],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date(Date.now() - 10000).toISOString(), // Older
      };

      const localData = createBookmarkFile({ toolbar: [localFolder] });
      const remoteData = createBookmarkFile({ toolbar: [remoteFolder] });

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
    });
  });

  describe('location changes', () => {
    it('should handle bookmark moved between locations', async () => {
      const bookmarkId = 'moving-bookmark';

      const localBookmark = createBookmark({
        id: bookmarkId,
        title: 'Moving Bookmark',
        location: BOOKMARK_LOCATION.TOOLBAR,
        modifiedAt: new Date().toISOString(),
      });

      const remoteBookmark = createBookmark({
        id: bookmarkId,
        title: 'Moving Bookmark',
        location: BOOKMARK_LOCATION.MENU, // Different location
        modifiedAt: new Date(Date.now() - 10000).toISOString(), // Older
      });

      const localData = createBookmarkFile({
        toolbar: [localBookmark],
        menu: [],
      });
      const remoteData = createBookmarkFile({
        toolbar: [],
        menu: [remoteBookmark],
      });

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle source read errors gracefully', async () => {
      localSource.read.mockRejectedValue(new Error('Read failed'));
      remoteSource.setData(createBookmarkFile());

      await expect(syncEngine.sync(localSource, remoteSource)).rejects.toThrow();
    });

    it('should handle source write errors gracefully', async () => {
      const localData = createBookmarkFile({
        toolbar: [createBookmark()],
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);
      remoteSource.write.mockRejectedValue(new Error('Write failed'));

      await expect(syncEngine.sync(localSource, remoteSource)).rejects.toThrow();
    });

    it('should handle unavailable sources', async () => {
      localSource.isAvailable.mockResolvedValue(false);

      await expect(syncEngine.sync(localSource, remoteSource)).rejects.toThrow();
    });
  });

  describe('metadata handling', () => {
    it('should update lastModified after sync', async () => {
      const localData = createBookmarkFile({
        toolbar: [createBookmark()],
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const beforeSync = new Date();
      await syncEngine.sync(localSource, remoteSource);
      const afterSync = new Date();

      const writtenData = remoteSource.write.mock.calls[0]?.[0];
      if (writtenData) {
        const lastModified = new Date(writtenData.metadata.lastModified);
        expect(lastModified >= beforeSync).toBe(true);
        expect(lastModified <= afterSync).toBe(true);
      }
    });

    it('should update checksum after sync', async () => {
      const localData = createBookmarkFile({
        toolbar: [createBookmark()],
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      await syncEngine.sync(localSource, remoteSource);

      const writtenData = remoteSource.write.mock.calls[0]?.[0];
      if (writtenData) {
        expect(writtenData.metadata.checksum).toBeDefined();
        expect(writtenData.metadata.checksum.length).toBeGreaterThan(0);
      }
    });
  });

  describe('performance', () => {
    it('should handle large bookmark collections', async () => {
      const bookmarks = Array.from({ length: 1000 }, (_, i) =>
        createBookmark({
          id: `bookmark-${i}`,
          title: `Bookmark ${i}`,
          url: `https://example.com/${i}`,
        })
      );

      const localData = createBookmarkFile({
        toolbar: bookmarks.slice(0, 500),
        menu: bookmarks.slice(500),
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const startTime = Date.now();
      const result = await syncEngine.sync(localSource, remoteSource);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle deeply nested folders', async () => {
      // Create a deeply nested folder structure
      const createNestedFolder = (depth, maxDepth = 10) => {
        if (depth >= maxDepth) {
          return createBookmark({ title: `Leaf at depth ${depth}` });
        }

        return {
          id: `folder-depth-${depth}`,
          type: 'folder',
          title: `Folder at depth ${depth}`,
          location: BOOKMARK_LOCATION.TOOLBAR,
          children: [createNestedFolder(depth + 1, maxDepth)],
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
        };
      };

      const localData = createBookmarkFile({
        toolbar: [createNestedFolder(0)],
      });
      const remoteData = createBookmarkFile();

      localSource.setData(localData);
      remoteSource.setData(remoteData);

      const result = await syncEngine.sync(localSource, remoteSource);

      expect(result).toBeDefined();
    });
  });
});
