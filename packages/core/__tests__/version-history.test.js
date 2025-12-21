/**
 * Tests for VersionHistoryManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VersionHistoryManager, createChangeSummary } from '../src/version-history.js';

// Mock Supabase client
const createMockSupabase = () => ({
  rpc: vi.fn(),
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
      })),
    })),
  })),
});

describe('VersionHistoryManager', () => {
  let manager;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    manager = new VersionHistoryManager(mockSupabase);
  });

  describe('constructor', () => {
    it('should store supabase client', () => {
      expect(manager.supabase).toBe(mockSupabase);
    });
  });

  describe('saveVersion', () => {
    it('should call save_bookmark_version RPC', async () => {
      const userId = 'user-123';
      const bookmarkData = {
        version: '1.0.0',
        bookmarks: { toolbar: [], menu: [], other: [] },
      };
      const options = {
        sourceType: 'github',
        sourceName: 'My Repo',
        deviceId: 'device-1',
        deviceName: 'Chrome on Mac',
      };

      mockSupabase.rpc.mockResolvedValue({
        data: {
          id: 'version-1',
          version: 1,
          bookmark_data: bookmarkData,
          checksum: 'abc123',
          source_type: 'github',
          source_name: 'My Repo',
          device_id: 'device-1',
          device_name: 'Chrome on Mac',
          change_summary: {},
          created_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const result = await manager.saveVersion(userId, bookmarkData, options);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('save_bookmark_version', {
        p_user_id: userId,
        p_bookmark_data: bookmarkData,
        p_checksum: expect.any(String),
        p_source_type: 'github',
        p_source_name: 'My Repo',
        p_device_id: 'device-1',
        p_device_name: 'Chrome on Mac',
        p_change_summary: {},
      });

      expect(result.version).toBe(1);
      expect(result.sourceType).toBe('github');
    });

    it('should throw on error', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const validBookmarkData = {
        version: '1.0.0',
        bookmarks: { toolbar: [], menu: [], other: [] },
      };

      await expect(
        manager.saveVersion('user-1', validBookmarkData, { sourceType: 'github' })
      ).rejects.toThrow('Failed to save version: Database error');
    });
  });

  describe('getHistory', () => {
    it('should call get_version_history RPC with pagination', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: [
          {
            id: 'v1',
            version: 2,
            checksum: 'abc',
            source_type: 'github',
            source_name: null,
            device_name: 'Chrome',
            change_summary: { added: 5 },
            created_at: '2024-01-02T00:00:00Z',
            bookmark_count: 100,
            folder_count: 10,
          },
          {
            id: 'v2',
            version: 1,
            checksum: 'def',
            source_type: 'dropbox',
            source_name: null,
            device_name: 'Firefox',
            change_summary: {},
            created_at: '2024-01-01T00:00:00Z',
            bookmark_count: 95,
            folder_count: 9,
          },
        ],
        error: null,
      });

      const result = await manager.getHistory('user-1', { limit: 10, offset: 0 });

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_version_history', {
        p_user_id: 'user-1',
        p_limit: 10,
        p_offset: 0,
      });

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(2);
      expect(result[0].bookmarkCount).toBe(100);
      expect(result[1].sourceType).toBe('dropbox');
    });

    it('should use default pagination values', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      await manager.getHistory('user-1');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_version_history', {
        p_user_id: 'user-1',
        p_limit: 20,
        p_offset: 0,
      });
    });
  });

  describe('getVersion', () => {
    it('should call get_version_data RPC', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: {
          id: 'v1',
          version: 5,
          bookmark_data: { bookmarks: {} },
          checksum: 'xyz',
          source_type: 'github',
          source_name: null,
          device_id: 'd1',
          device_name: 'Chrome',
          change_summary: {},
          created_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const result = await manager.getVersion('user-1', 5);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_version_data', {
        p_user_id: 'user-1',
        p_version: 5,
      });

      expect(result.version).toBe(5);
      expect(result.bookmarkData).toEqual({ bookmarks: {} });
    });

    it('should throw if version not found', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });

      await expect(manager.getVersion('user-1', 999)).rejects.toThrow(
        'Version 999 not found'
      );
    });
  });

  describe('rollback', () => {
    it('should call rollback_to_version RPC', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: {
          id: 'v-new',
          version: 10,
          bookmark_data: { bookmarks: {} },
          checksum: 'rolled-back',
          source_type: 'rollback',
          source_name: 'Rollback to version 5',
          device_id: null,
          device_name: null,
          change_summary: { type: 'rollback', from_version: 9, to_version: 5 },
          created_at: '2024-01-03T00:00:00Z',
        },
        error: null,
      });

      const result = await manager.rollback('user-1', 5);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('rollback_to_version', {
        p_user_id: 'user-1',
        p_target_version: 5,
      });

      expect(result.version).toBe(10);
      expect(result.sourceType).toBe('rollback');
      expect(result.changeSummary.type).toBe('rollback');
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current version from cloud_bookmarks', async () => {
      const mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { version: 15 },
              error: null,
            }),
          })),
        })),
      }));
      mockSupabase.from = mockFrom;

      const result = await manager.getCurrentVersion('user-1');

      expect(mockFrom).toHaveBeenCalledWith('cloud_bookmarks');
      expect(result).toBe(15);
    });

    it('should return 0 if no bookmarks exist', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          })),
        })),
      }));

      const result = await manager.getCurrentVersion('user-1');
      expect(result).toBe(0);
    });
  });

  describe('getRetentionLimit', () => {
    it('should call get_version_retention_limit RPC', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 30, error: null });

      const result = await manager.getRetentionLimit('user-1');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_version_retention_limit', {
        p_user_id: 'user-1',
      });
      expect(result).toBe(30);
    });
  });

  describe('_flattenBookmarks', () => {
    it('should flatten nested bookmark structure', () => {
      const data = {
        bookmarks: {
          toolbar: [
            { id: '1', title: 'A', url: 'http://a.com' },
            {
              id: '2',
              title: 'Folder',
              children: [{ id: '3', title: 'B', url: 'http://b.com' }],
            },
          ],
          menu: [{ id: '4', title: 'C', url: 'http://c.com' }],
          other: [],
        },
      };

      const result = manager._flattenBookmarks(data);

      expect(result).toHaveLength(4);
      expect(result.map((b) => b.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should handle empty data', () => {
      const result = manager._flattenBookmarks({});
      expect(result).toEqual([]);
    });
  });

  describe('_computeDiff', () => {
    it('should detect added bookmarks', () => {
      const oldData = {
        bookmarks: {
          toolbar: [{ id: '1', title: 'A', url: 'http://a.com' }],
          menu: [],
          other: [],
        },
      };
      const newData = {
        bookmarks: {
          toolbar: [
            { id: '1', title: 'A', url: 'http://a.com' },
            { id: '2', title: 'B', url: 'http://b.com' },
          ],
          menu: [],
          other: [],
        },
      };

      const diff = manager._computeDiff(oldData, newData);

      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].id).toBe('2');
      expect(diff.removed).toHaveLength(0);
      expect(diff.summary.added).toBe(1);
    });

    it('should detect removed bookmarks', () => {
      const oldData = {
        bookmarks: {
          toolbar: [
            { id: '1', title: 'A', url: 'http://a.com' },
            { id: '2', title: 'B', url: 'http://b.com' },
          ],
          menu: [],
          other: [],
        },
      };
      const newData = {
        bookmarks: {
          toolbar: [{ id: '1', title: 'A', url: 'http://a.com' }],
          menu: [],
          other: [],
        },
      };

      const diff = manager._computeDiff(oldData, newData);

      expect(diff.removed).toHaveLength(1);
      expect(diff.removed[0].id).toBe('2');
      expect(diff.summary.removed).toBe(1);
    });

    it('should detect modified bookmarks', () => {
      const oldData = {
        bookmarks: {
          toolbar: [{ id: '1', title: 'A', url: 'http://a.com' }],
          menu: [],
          other: [],
        },
      };
      const newData = {
        bookmarks: {
          toolbar: [{ id: '1', title: 'A Updated', url: 'http://a.com' }],
          menu: [],
          other: [],
        },
      };

      const diff = manager._computeDiff(oldData, newData);

      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].title).toBe('A Updated');
      expect(diff.summary.modified).toBe(1);
    });
  });
});

describe('createChangeSummary', () => {
  it('should create summary from diff', () => {
    const oldData = {
      bookmarks: {
        toolbar: [{ id: '1', title: 'A', url: 'http://a.com' }],
        menu: [],
        other: [],
      },
    };
    const newData = {
      bookmarks: {
        toolbar: [
          { id: '1', title: 'A Updated', url: 'http://a.com' },
          { id: '2', title: 'B', url: 'http://b.com' },
        ],
        menu: [],
        other: [],
      },
    };

    const summary = createChangeSummary(oldData, newData);

    expect(summary.type).toBe('sync');
    expect(summary.added).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.removed).toBe(0);
  });
});
