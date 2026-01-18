/**
 * Tests for Bookmarks API External Sync functionality
 * Tests the automatic sync to connected external sources (GitHub, Dropbox, etc.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the GitHub sync module
vi.mock('@marksyncr/sources/oauth/github-sync', () => ({
  syncBookmarksToGitHub: vi.fn(),
}));

// Mock the Dropbox sync module
vi.mock('@marksyncr/sources/oauth/dropbox-sync', () => ({
  syncBookmarksToDropbox: vi.fn(),
}));

// Mock auth helper
vi.mock('@/lib/auth-helper', () => ({
  corsHeaders: vi.fn(() => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  })),
  getAuthenticatedUser: vi.fn(),
}));

import { POST } from '../app/api/bookmarks/route.js';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { syncBookmarksToGitHub } from '@marksyncr/sources/oauth/github-sync';
import { syncBookmarksToDropbox } from '@marksyncr/sources/oauth/dropbox-sync';

describe('Bookmarks API External Sync', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { name: 'Test User' },
  };

  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock Supabase client
    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      insert: vi.fn(() => mockSupabase),
      upsert: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };

    getAuthenticatedUser.mockResolvedValue({
      user: mockUser,
      supabase: mockSupabase,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncToExternalSources', () => {
    it('should sync to GitHub when GitHub source is connected', async () => {
      const mockBookmarks = [
        { url: 'https://example.com', title: 'Example', folderPath: 'Bookmarks Bar' },
      ];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null }) // user exists
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // no existing bookmarks
        .mockResolvedValueOnce({
          // upsert result
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - GitHub connected
      mockSupabase.eq.mockImplementation(function () {
        return this;
      });

      // Create a more sophisticated mock
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: 'testuser/marksyncr-bookmarks',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToGitHub.mockResolvedValue({
        success: true,
        sha: 'newsha123',
        created: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Bookmarks synced successfully');

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify GitHub sync was called
      expect(syncBookmarksToGitHub).toHaveBeenCalledWith(
        'ghp_test_token',
        'testuser/marksyncr-bookmarks',
        'main',
        'bookmarks.json',
        expect.any(Array),
        expect.any(Array),
        expect.any(String)
      );
    });

    it('should not sync to GitHub when no sources are connected', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - no connected sources
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify GitHub sync was NOT called
      expect(syncBookmarksToGitHub).not.toHaveBeenCalled();
    });

    it('should handle GitHub sync errors gracefully', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - GitHub connected
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: 'testuser/marksyncr-bookmarks',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      // Mock GitHub sync to fail
      syncBookmarksToGitHub.mockRejectedValue(new Error('GitHub API rate limit exceeded'));

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      // The main request should still succeed even if external sync fails
      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBe('Bookmarks synced successfully');
    });

    it('should skip GitHub sync when access token is missing', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - GitHub connected but no token
      // Note: With the new query using .not('access_token', 'is', null),
      // sources without tokens won't be returned, so we return empty array
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [], // No sources returned because token is null
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify GitHub sync was NOT called due to missing token
      expect(syncBookmarksToGitHub).not.toHaveBeenCalled();
    });

    it('should skip GitHub sync when repository is not configured', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - GitHub connected but no repository
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: null, // No repository
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify GitHub sync was NOT called due to missing repository
      expect(syncBookmarksToGitHub).not.toHaveBeenCalled();
    });

    it('should sync to multiple sources when multiple are connected', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - multiple sources connected
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: 'testuser/marksyncr-bookmarks',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                      {
                        id: 'source-2',
                        provider: 'dropbox',
                        access_token: 'dropbox_token',
                      },
                      {
                        id: 'source-3',
                        provider: 'google-drive',
                        access_token: 'google_token',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToGitHub.mockResolvedValue({
        success: true,
        sha: 'newsha123',
        created: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify GitHub sync was called (Dropbox and Google Drive are not yet implemented)
      expect(syncBookmarksToGitHub).toHaveBeenCalledTimes(1);
    });

    it('should continue syncing to other sources if one fails', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - two GitHub sources
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token_1',
                        repository: 'testuser/repo1',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                      {
                        id: 'source-2',
                        provider: 'github',
                        access_token: 'ghp_test_token_2',
                        repository: 'testuser/repo2',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      // First call fails, second succeeds
      syncBookmarksToGitHub
        .mockRejectedValueOnce(new Error('First repo failed'))
        .mockResolvedValueOnce({
          success: true,
          sha: 'newsha123',
          created: false,
          bookmarkCount: 1,
        });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Both should have been attempted
      expect(syncBookmarksToGitHub).toHaveBeenCalledTimes(2);
    });

    it('should handle sync_sources query error gracefully', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - error
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'Database connection failed' },
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      // Main request should still succeed
      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // GitHub sync should not have been called
      expect(syncBookmarksToGitHub).not.toHaveBeenCalled();
    });

    it('should use default branch and file_path when not specified', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - GitHub connected without branch/file_path
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: 'testuser/marksyncr-bookmarks',
                        branch: null, // Not specified
                        file_path: null, // Not specified
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToGitHub.mockResolvedValue({
        success: true,
        sha: 'newsha123',
        created: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify GitHub sync was called with defaults
      expect(syncBookmarksToGitHub).toHaveBeenCalledWith(
        'ghp_test_token',
        'testuser/marksyncr-bookmarks',
        'main', // Default branch
        'bookmarks.json', // Default file path
        expect.any(Array),
        expect.any(Array),
        expect.any(String)
      );
    });

    it('should pass tombstones to GitHub sync', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];
      const mockTombstones = [{ url: 'https://deleted.com', deletedAt: Date.now() }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - GitHub connected
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: 'testuser/marksyncr-bookmarks',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToGitHub.mockResolvedValue({
        success: true,
        sha: 'newsha123',
        created: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks, tombstones: mockTombstones }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify tombstones were passed to GitHub sync
      expect(syncBookmarksToGitHub).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        expect.arrayContaining([expect.objectContaining({ url: 'https://deleted.com' })]),
        expect.any(String)
      );
    });

    it('should sync to Dropbox when Dropbox source is connected', async () => {
      const mockBookmarks = [
        { url: 'https://example.com', title: 'Example', folderPath: 'Bookmarks Bar' },
      ];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null }) // user exists
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // no existing bookmarks
        .mockResolvedValueOnce({
          // upsert result
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - Dropbox connected
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'dropbox',
                        access_token: 'dropbox_test_token',
                        file_path: '/Apps/MarkSyncr/bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToDropbox.mockResolvedValue({
        success: true,
        rev: 'rev123',
        created: false,
        skipped: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Bookmarks synced successfully');

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Dropbox sync was called (5 args: token, path, bookmarks, tombstones, checksum)
      expect(syncBookmarksToDropbox).toHaveBeenCalledWith(
        'dropbox_test_token',
        '/Apps/MarkSyncr/bookmarks.json',
        expect.any(Array),
        expect.any(Array),
        expect.any(String)
      );
    });

    it('should handle Dropbox sync errors gracefully', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - Dropbox connected
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'dropbox',
                        access_token: 'dropbox_test_token',
                        file_path: '/Apps/MarkSyncr/bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      // Mock Dropbox sync to fail
      syncBookmarksToDropbox.mockRejectedValue(new Error('Dropbox API error'));

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      // The main request should still succeed even if external sync fails
      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBe('Bookmarks synced successfully');
    });

    it('should skip Dropbox sync when access token is missing', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - Dropbox connected but no token
      // With .not('access_token', 'is', null), sources without tokens won't be returned
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [], // No sources returned because token is null
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Dropbox sync was NOT called due to missing token
      expect(syncBookmarksToDropbox).not.toHaveBeenCalled();
    });

    it('should sync to both GitHub and Dropbox when both are connected', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - both GitHub and Dropbox connected
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'github',
                        access_token: 'ghp_test_token',
                        repository: 'testuser/marksyncr-bookmarks',
                        branch: 'main',
                        file_path: 'bookmarks.json',
                      },
                      {
                        id: 'source-2',
                        provider: 'dropbox',
                        access_token: 'dropbox_test_token',
                        file_path: '/Apps/MarkSyncr/bookmarks.json',
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToGitHub.mockResolvedValue({
        success: true,
        sha: 'newsha123',
        created: false,
        bookmarkCount: 1,
      });

      syncBookmarksToDropbox.mockResolvedValue({
        success: true,
        rev: 'rev123',
        created: false,
        skipped: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify both syncs were called
      expect(syncBookmarksToGitHub).toHaveBeenCalledTimes(1);
      expect(syncBookmarksToDropbox).toHaveBeenCalledTimes(1);
    });

    it('should use default file_path for Dropbox when not specified', async () => {
      const mockBookmarks = [{ url: 'https://example.com', title: 'Example' }];

      // Mock user exists check
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: mockUser.id }, error: null })
        .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        .mockResolvedValueOnce({
          data: { version: 1, checksum: 'abc123' },
          error: null,
        });

      // Mock sync_sources query - Dropbox connected without file_path
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'sync_sources') {
          return {
            select: () => ({
              eq: () => ({
                not: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'source-1',
                        provider: 'dropbox',
                        access_token: 'dropbox_test_token',
                        file_path: null, // Not specified
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return mockSupabase;
      });

      syncBookmarksToDropbox.mockResolvedValue({
        success: true,
        rev: 'rev123',
        created: false,
        skipped: false,
        bookmarkCount: 1,
      });

      const request = new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: mockBookmarks }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Wait for async external sync to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify Dropbox sync was called with default file path (5 args: token, path, bookmarks, tombstones, checksum)
      expect(syncBookmarksToDropbox).toHaveBeenCalledWith(
        'dropbox_test_token',
        '/Apps/MarkSyncr/bookmarks.json', // Default file path
        expect.any(Array),
        expect.any(Array),
        expect.any(String)
      );
    });
  });
});
