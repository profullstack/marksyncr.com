/**
 * Tests for Dropbox Sync functionality
 * Tests the ability to update bookmarks.json in Dropbox
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateBookmarkFile,
  getBookmarkFile,
  type BookmarkSyncData,
  type DropboxSyncResult,
} from '../src/oauth/dropbox-sync.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Dropbox Sync', () => {
  const mockAccessToken = 'sl.test_token_123';
  const mockPath = '/Apps/MarkSyncr/bookmarks.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBookmarkFile', () => {
    it('should fetch existing bookmark file from Dropbox', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
        },
        bookmarks: [{ url: 'https://example.com', title: 'Example' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'dropbox-api-result'
              ? JSON.stringify({ rev: 'abc123rev', content_hash: 'hash123' })
              : null,
        },
        text: async () => JSON.stringify(existingContent),
      });

      const result = await getBookmarkFile(mockAccessToken, mockPath);

      expect(result).not.toBeNull();
      expect(result?.content).toEqual(existingContent);
      expect(result?.rev).toBe('abc123rev');
      expect(result?.contentHash).toBe('hash123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://content.dropboxapi.com/2/files/download',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: mockPath }),
          }),
        })
      );
    });

    it('should return null if file does not exist (409 conflict)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      const result = await getBookmarkFile(mockAccessToken, mockPath);

      expect(result).toBeNull();
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error_summary: 'Internal Server Error' }),
        json: async () => ({ error_summary: 'Internal Server Error' }),
      });

      await expect(getBookmarkFile(mockAccessToken, mockPath)).rejects.toThrow(
        'Failed to get bookmark file'
      );
    });

    it('should use default path if not provided', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
        },
        bookmarks: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'rev123', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      await getBookmarkFile(mockAccessToken);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://content.dropboxapi.com/2/files/download',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Dropbox-API-Arg': JSON.stringify({ path: '/Apps/MarkSyncr/bookmarks.json' }),
          }),
        })
      );
    });
  });

  describe('updateBookmarkFile', () => {
    const mockBookmarks: BookmarkSyncData = {
      bookmarks: [
        { url: 'https://example.com', title: 'Example', folderPath: 'Bookmarks Bar' },
        { url: 'https://test.com', title: 'Test', folderPath: 'Other' },
      ],
      tombstones: [],
      checksum: 'abc123',
    };

    it('should create new file if it does not exist', async () => {
      // First call: check if file exists (409 - not found)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      // Second call: upload file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'newrev123',
          content_hash: 'newhash123',
        }),
      });

      const result = await updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks);

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.rev).toBe('newrev123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update existing file with new bookmarks', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
        },
        bookmarks: [],
      };

      // First call: get existing file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'existingrev123', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      // Second call: upload updated file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'updatedrev123',
          content_hash: 'updatedhash',
        }),
      });

      const result = await updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks);

      expect(result.success).toBe(true);
      expect(result.created).toBe(false);
      expect(result.rev).toBe('updatedrev123');

      // Verify the upload request uses update mode with rev
      const uploadCall = mockFetch.mock.calls[1];
      const dropboxArg = JSON.parse(uploadCall[1].headers['Dropbox-API-Arg']);
      expect(dropboxArg.mode).toEqual({ '.tag': 'update', update: 'existingrev123' });
    });

    it('should throw error if access token is missing', async () => {
      await expect(updateBookmarkFile('', mockPath, mockBookmarks)).rejects.toThrow(
        'Access token is required'
      );
    });

    it('should throw error on upload failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ error_summary: 'path/conflict/file' }),
        json: async () => ({ error_summary: 'path/conflict/file' }),
      });

      await expect(updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks)).rejects.toThrow(
        'Failed to update bookmark file'
      );
    });

    it('should preserve metadata from existing file', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
        },
        bookmarks: [{ url: 'https://old.com', title: 'Old' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'existingrev', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'newrev',
          content_hash: 'newhash',
        }),
      });

      await updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks);

      const uploadCall = mockFetch.mock.calls[1];
      const uploadedContent = JSON.parse(uploadCall[1].body);

      // Should preserve createdAt from existing file
      expect(uploadedContent.metadata.createdAt).toBe('2025-01-01T00:00:00.000Z');
      // lastModified should be updated
      expect(uploadedContent.metadata.lastModified).not.toBe('2025-01-01T00:00:00.000Z');
      // Bookmarks should be replaced with new ones
      expect(uploadedContent.bookmarks).toHaveLength(2);
      expect(uploadedContent.bookmarks[0].url).toBe('https://example.com');
    });

    it('should include checksum in metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'newrev',
          content_hash: 'newhash',
        }),
      });

      await updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks);

      const uploadCall = mockFetch.mock.calls[1];
      const uploadedContent = JSON.parse(uploadCall[1].body);

      expect(uploadedContent.metadata.checksum).toBe('abc123');
    });

    it('should skip update when checksum matches existing file', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
          checksum: 'abc123', // Same checksum as incoming
        },
        bookmarks: [
          { url: 'https://example.com', title: 'Example', folderPath: 'Bookmarks Bar' },
          { url: 'https://test.com', title: 'Test', folderPath: 'Other' },
        ],
      };

      // First call: get existing file with matching checksum
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'existingrev123', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      // No second call should be made since checksums match

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockPath,
        mockBookmarks // Has checksum 'abc123'
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.rev).toBe('existingrev123');
      expect(result.bookmarkCount).toBe(2);
      // Only one fetch call (to get existing file), no upload call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should update when checksum differs from existing file', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
          checksum: 'different_checksum', // Different checksum
        },
        bookmarks: [{ url: 'https://old.com', title: 'Old' }],
      };

      // First call: get existing file with different checksum
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'existingrev123', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      // Second call: upload file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'updatedrev123',
          content_hash: 'updatedhash',
        }),
      });

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockPath,
        mockBookmarks // Has checksum 'abc123'
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.created).toBe(false);
      expect(result.rev).toBe('updatedrev123');
      // Two fetch calls: get existing + upload
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update when existing file has no checksum', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
          // No checksum field
        },
        bookmarks: [{ url: 'https://old.com', title: 'Old' }],
      };

      // First call: get existing file without checksum
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'existingrev123', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      // Second call: upload file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'updatedrev123',
          content_hash: 'updatedhash',
        }),
      });

      const result = await updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.created).toBe(false);
      expect(result.rev).toBe('updatedrev123');
      // Two fetch calls: get existing + upload
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update when incoming data has no checksum', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
          checksum: 'existing_checksum',
        },
        bookmarks: [{ url: 'https://old.com', title: 'Old' }],
      };

      // First call: get existing file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => JSON.stringify({ rev: 'existingrev123', content_hash: 'hash' }),
        },
        text: async () => JSON.stringify(existingContent),
      });

      // Second call: upload file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'updatedrev123',
          content_hash: 'updatedhash',
        }),
      });

      const bookmarksWithoutChecksum: BookmarkSyncData = {
        bookmarks: [{ url: 'https://example.com', title: 'Example' }],
        tombstones: [],
        // No checksum
      };

      const result = await updateBookmarkFile(mockAccessToken, mockPath, bookmarksWithoutChecksum);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      // Two fetch calls: get existing + upload
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include tombstones in uploaded file', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'newrev',
          content_hash: 'newhash',
        }),
      });

      const dataWithTombstones: BookmarkSyncData = {
        bookmarks: [{ url: 'https://example.com', title: 'Example' }],
        tombstones: [{ url: 'https://deleted.com', deletedAt: 1703980800000 }],
        checksum: 'checksum123',
      };

      await updateBookmarkFile(mockAccessToken, mockPath, dataWithTombstones);

      const uploadCall = mockFetch.mock.calls[1];
      const uploadedContent = JSON.parse(uploadCall[1].body);

      expect(uploadedContent.tombstones).toHaveLength(1);
      expect(uploadedContent.tombstones[0].url).toBe('https://deleted.com');
    });

    it('should use add mode for new files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'newrev',
          content_hash: 'newhash',
        }),
      });

      await updateBookmarkFile(mockAccessToken, mockPath, mockBookmarks);

      const uploadCall = mockFetch.mock.calls[1];
      const dropboxArg = JSON.parse(uploadCall[1].headers['Dropbox-API-Arg']);
      expect(dropboxArg.mode).toBe('add');
    });
  });

  describe('DropboxSyncResult', () => {
    it('should have correct structure for success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: async () =>
          JSON.stringify({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
        json: async () => ({ error_summary: 'path/not_found/.', error: { '.tag': 'path' } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rev: 'rev123',
          content_hash: 'hash123',
        }),
      });

      const result: DropboxSyncResult = await updateBookmarkFile(mockAccessToken, mockPath, {
        bookmarks: [],
        tombstones: [],
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('rev');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('bookmarkCount', 0);
    });
  });
});
