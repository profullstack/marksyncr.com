/**
 * GitHub Repository Auto-Creation Tests
 *
 * Tests for the GitHub repository creation and initialization functionality.
 * Uses Vitest as the testing framework.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GitHub Repository Helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createRepository', () => {
    it('should create a new private repository', async () => {
      const { createRepository } = await import('../src/oauth/github-repo.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          name: 'marksyncr-bookmarks',
          full_name: 'testuser/marksyncr-bookmarks',
          private: true,
          default_branch: 'main',
          html_url: 'https://github.com/testuser/marksyncr-bookmarks',
        }),
      });

      const result = await createRepository('test-access-token', {
        name: 'marksyncr-bookmarks',
        description: 'MarkSyncr bookmark storage',
        private: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );

      expect(result.full_name).toBe('testuser/marksyncr-bookmarks');
      expect(result.private).toBe(true);
    });

    it('should throw error when repository creation fails', async () => {
      const { createRepository } = await import('../src/oauth/github-repo.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          message: 'Repository creation failed',
          errors: [{ resource: 'Repository', code: 'custom', field: 'name', message: 'name already exists' }],
        }),
      });

      await expect(
        createRepository('test-access-token', {
          name: 'marksyncr-bookmarks',
          description: 'MarkSyncr bookmark storage',
          private: true,
        })
      ).rejects.toThrow('Failed to create repository');
    });

    it('should throw error when access token is missing', async () => {
      const { createRepository } = await import('../src/oauth/github-repo.js');

      await expect(
        createRepository('', {
          name: 'marksyncr-bookmarks',
          description: 'MarkSyncr bookmark storage',
          private: true,
        })
      ).rejects.toThrow('Access token is required');
    });
  });

  describe('checkRepositoryExists', () => {
    it('should return true when repository exists', async () => {
      const { checkRepositoryExists } = await import('../src/oauth/github-repo.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          name: 'marksyncr-bookmarks',
          full_name: 'testuser/marksyncr-bookmarks',
        }),
      });

      const exists = await checkRepositoryExists('test-access-token', 'testuser/marksyncr-bookmarks');

      expect(exists).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/testuser/marksyncr-bookmarks',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        })
      );
    });

    it('should return false when repository does not exist', async () => {
      const { checkRepositoryExists } = await import('../src/oauth/github-repo.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const exists = await checkRepositoryExists('test-access-token', 'testuser/nonexistent-repo');

      expect(exists).toBe(false);
    });
  });

  describe('initializeBookmarkFile', () => {
    it('should create initial bookmarks.json file', async () => {
      const { initializeBookmarkFile } = await import('../src/oauth/github-repo.js');

      // First call checks if file exists - returns 404 (file doesn't exist)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Second call creates the file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            name: 'bookmarks.json',
            path: 'bookmarks.json',
            sha: 'abc123',
          },
          commit: {
            sha: 'def456',
            message: 'Initialize MarkSyncr bookmarks',
          },
        }),
      });

      const result = await initializeBookmarkFile(
        'test-access-token',
        'testuser/marksyncr-bookmarks',
        'main',
        'bookmarks.json'
      );

      // First call should be GET to check if file exists
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.github.com/repos/testuser/marksyncr-bookmarks/contents/bookmarks.json?ref=main',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        })
      );

      // Second call should be PUT to create the file
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.github.com/repos/testuser/marksyncr-bookmarks/contents/bookmarks.json',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        })
      );

      expect(result?.content.name).toBe('bookmarks.json');
    });

    it('should not overwrite existing file', async () => {
      const { initializeBookmarkFile } = await import('../src/oauth/github-repo.js');

      // First call checks if file exists - returns 200 (file exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'bookmarks.json',
          sha: 'existing-sha',
        }),
      });

      const result = await initializeBookmarkFile(
        'test-access-token',
        'testuser/marksyncr-bookmarks',
        'main',
        'bookmarks.json'
      );

      // Should only make one call (the check), not create
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });
  });

  describe('getOrCreateRepository', () => {
    it('should return existing repository if it exists', async () => {
      const { getOrCreateRepository } = await import('../src/oauth/github-repo.js');

      // Mock user info call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          login: 'testuser',
        }),
      });

      // Mock checkRepositoryExists call - exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          name: 'marksyncr-bookmarks',
          full_name: 'testuser/marksyncr-bookmarks',
          default_branch: 'main',
        }),
      });

      // Mock getRepository call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          name: 'marksyncr-bookmarks',
          full_name: 'testuser/marksyncr-bookmarks',
          default_branch: 'main',
        }),
      });

      const result = await getOrCreateRepository('test-access-token');

      expect(result.repository).toBe('testuser/marksyncr-bookmarks');
      expect(result.created).toBe(false);
    });

    it('should create new repository if it does not exist', async () => {
      const { getOrCreateRepository } = await import('../src/oauth/github-repo.js');

      // Mock user info call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          login: 'testuser',
        }),
      });

      // Mock repo check - does not exist
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Mock repo creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123456,
          name: 'marksyncr-bookmarks',
          full_name: 'testuser/marksyncr-bookmarks',
          default_branch: 'main',
        }),
      });

      // Mock file check - does not exist
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Mock file creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: {
            name: 'bookmarks.json',
            sha: 'abc123',
          },
        }),
      });

      const result = await getOrCreateRepository('test-access-token');

      expect(result.repository).toBe('testuser/marksyncr-bookmarks');
      expect(result.created).toBe(true);
      expect(result.branch).toBe('main');
      expect(result.filePath).toBe('bookmarks.json');
    });

    it('should throw error when user info cannot be fetched', async () => {
      const { getOrCreateRepository } = await import('../src/oauth/github-repo.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(getOrCreateRepository('invalid-token')).rejects.toThrow(
        'Failed to get GitHub user info'
      );
    });
  });

  describe('getDefaultBookmarkFileContent', () => {
    it('should return valid bookmark file structure', async () => {
      const { getDefaultBookmarkFileContent } = await import('../src/oauth/github-repo.js');

      const content = getDefaultBookmarkFileContent();

      expect(content).toHaveProperty('version');
      expect(content).toHaveProperty('metadata');
      expect(content).toHaveProperty('bookmarks');
      expect(content.version).toBe('1.0');
      expect(Array.isArray(content.bookmarks)).toBe(true);
      expect(content.bookmarks.length).toBe(0);
      expect(content.metadata).toHaveProperty('createdAt');
      expect(content.metadata).toHaveProperty('lastModified');
      expect(content.metadata).toHaveProperty('source');
      expect(content.metadata.source).toBe('marksyncr');
    });
  });
});
