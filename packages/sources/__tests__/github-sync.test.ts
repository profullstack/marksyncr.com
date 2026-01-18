/**
 * Tests for GitHub Sync functionality
 * Tests the ability to update bookmarks.json in a GitHub repository
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateBookmarkFile,
  getBookmarkFile,
  type BookmarkSyncData,
  type GitHubSyncResult,
} from '../src/oauth/github-sync.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GitHub Sync', () => {
  const mockAccessToken = 'ghp_test_token_123';
  const mockRepository = 'testuser/marksyncr-bookmarks';
  const mockBranch = 'main';
  const mockFilePath = 'bookmarks.json';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBookmarkFile', () => {
    it('should fetch existing bookmark file from repository', async () => {
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
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'abc123sha',
        }),
      });

      const result = await getBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath
      );

      expect(result).not.toBeNull();
      expect(result?.content).toEqual(existingContent);
      expect(result?.sha).toBe('abc123sha');
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/${mockRepository}/contents/${mockFilePath}?ref=${mockBranch}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
          }),
        })
      );
    });

    it('should return null if file does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath
      );

      expect(result).toBeNull();
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal Server Error' }),
      });

      await expect(
        getBookmarkFile(mockAccessToken, mockRepository, mockBranch, mockFilePath)
      ).rejects.toThrow('Failed to get bookmark file');
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
      // First call: check if file exists (404)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Second call: create file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'newsha123' },
          commit: { sha: 'commitsha123' },
        }),
      });

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks
      );

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.sha).toBe('newsha123');
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
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'existingsha123',
        }),
      });

      // Second call: update file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'updatedsha123' },
          commit: { sha: 'commitsha456' },
        }),
      });

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks
      );

      expect(result.success).toBe(true);
      expect(result.created).toBe(false);
      expect(result.sha).toBe('updatedsha123');

      // Verify the PUT request includes the sha for update
      const putCall = mockFetch.mock.calls[1];
      const putBody = JSON.parse(putCall[1].body);
      expect(putBody.sha).toBe('existingsha123');
      expect(putBody.message).toContain('Update bookmarks');
    });

    it('should include bookmark count in commit message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'newsha' },
          commit: { sha: 'commitsha' },
        }),
      });

      await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks
      );

      const putCall = mockFetch.mock.calls[1];
      const putBody = JSON.parse(putCall[1].body);
      expect(putBody.message).toContain('2 bookmarks');
    });

    it('should throw error if access token is missing', async () => {
      await expect(
        updateBookmarkFile('', mockRepository, mockBranch, mockFilePath, mockBookmarks)
      ).rejects.toThrow('Access token is required');
    });

    it('should throw error if repository is missing', async () => {
      await expect(
        updateBookmarkFile(mockAccessToken, '', mockBranch, mockFilePath, mockBookmarks)
      ).rejects.toThrow('Repository is required');
    });

    it('should throw error on update failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Validation failed' }),
      });

      await expect(
        updateBookmarkFile(mockAccessToken, mockRepository, mockBranch, mockFilePath, mockBookmarks)
      ).rejects.toThrow('Failed to update bookmark file');
    });

    it('should preserve metadata from existing file', async () => {
      const existingContent = {
        version: '1.0',
        metadata: {
          createdAt: '2025-01-01T00:00:00.000Z',
          lastModified: '2025-01-01T00:00:00.000Z',
          source: 'marksyncr',
          customField: 'preserved',
        },
        bookmarks: [{ url: 'https://old.com', title: 'Old' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'existingsha',
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'newsha' },
          commit: { sha: 'commitsha' },
        }),
      });

      await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks
      );

      const putCall = mockFetch.mock.calls[1];
      const putBody = JSON.parse(putCall[1].body);
      const content = JSON.parse(Buffer.from(putBody.content, 'base64').toString('utf-8'));

      // Should preserve createdAt from existing file
      expect(content.metadata.createdAt).toBe('2025-01-01T00:00:00.000Z');
      // lastModified should be updated
      expect(content.metadata.lastModified).not.toBe('2025-01-01T00:00:00.000Z');
      // Bookmarks should be replaced with new ones
      expect(content.bookmarks).toHaveLength(2);
      expect(content.bookmarks[0].url).toBe('https://example.com');
    });

    it('should include checksum in metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'newsha' },
          commit: { sha: 'commitsha' },
        }),
      });

      await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks
      );

      const putCall = mockFetch.mock.calls[1];
      const putBody = JSON.parse(putCall[1].body);
      const content = JSON.parse(Buffer.from(putBody.content, 'base64').toString('utf-8'));

      expect(content.metadata.checksum).toBe('abc123');
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
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'existingsha123',
        }),
      });

      // No second call should be made since checksums match

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks // Has checksum 'abc123'
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.sha).toBe('existingsha123');
      expect(result.bookmarkCount).toBe(2);
      // Only one fetch call (to get existing file), no PUT call
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
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'existingsha123',
        }),
      });

      // Second call: update file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'updatedsha123' },
          commit: { sha: 'commitsha456' },
        }),
      });

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks // Has checksum 'abc123'
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.created).toBe(false);
      expect(result.sha).toBe('updatedsha123');
      // Two fetch calls: get existing + PUT update
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
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'existingsha123',
        }),
      });

      // Second call: update file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'updatedsha123' },
          commit: { sha: 'commitsha456' },
        }),
      });

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        mockBookmarks
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.created).toBe(false);
      expect(result.sha).toBe('updatedsha123');
      // Two fetch calls: get existing + PUT update
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
        json: async () => ({
          content: Buffer.from(JSON.stringify(existingContent)).toString('base64'),
          sha: 'existingsha123',
        }),
      });

      // Second call: update file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'updatedsha123' },
          commit: { sha: 'commitsha456' },
        }),
      });

      const bookmarksWithoutChecksum: BookmarkSyncData = {
        bookmarks: [{ url: 'https://example.com', title: 'Example' }],
        tombstones: [],
        // No checksum
      };

      const result = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        bookmarksWithoutChecksum
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      // Two fetch calls: get existing + PUT update
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('GitHubSyncResult', () => {
    it('should have correct structure for success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: { sha: 'sha123' },
          commit: { sha: 'commitsha' },
        }),
      });

      const result: GitHubSyncResult = await updateBookmarkFile(
        mockAccessToken,
        mockRepository,
        mockBranch,
        mockFilePath,
        { bookmarks: [], tombstones: [] }
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('sha');
      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('bookmarkCount', 0);
    });
  });
});
