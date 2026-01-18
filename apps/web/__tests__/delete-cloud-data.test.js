/**
 * @fileoverview Tests for DELETE /api/bookmarks/all endpoint
 * Tests the "Delete All Cloud Data" functionality
 * Uses Vitest with mocked auth helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock user for authenticated requests
const mockUser = { id: 'user-123', email: 'test@example.com' };

// Create a fresh mock for each test
let mockSupabase;

// Mock @/lib/auth-helper
vi.mock('@/lib/auth-helper', () => ({
  corsHeaders: vi.fn((request, methods) => ({
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': methods?.join(', ') || 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getAuthenticatedUser: vi.fn(),
}));

// Import after mocks
const { DELETE, OPTIONS } = await import('../app/api/bookmarks/all/route.js');
const { getAuthenticatedUser } = await import('@/lib/auth-helper');

/**
 * Helper to create a mock NextRequest
 */
function createMockRequest(options = {}) {
  const { method = 'DELETE', body = null, headers = {} } = options;

  const request = {
    method,
    headers: {
      get: (name) => headers[name] || null,
    },
    json: async () => body,
  };

  return request;
}

/**
 * Helper to create a mock Supabase client for delete operations
 */
function createDeleteMockSupabase(options = {}) {
  const {
    hasBookmarks = true,
    hasVersions = true,
    hasSources = true,
    deleteBookmarksSuccess = true,
    deleteVersionsSuccess = true,
    deleteSourcesSuccess = true,
  } = options;

  // Track what was deleted for assertions
  const deletedTables = [];

  // Mock for cloud_bookmarks delete
  const bookmarksDeleteMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      error: deleteBookmarksSuccess ? null : { message: 'Delete bookmarks failed' },
    }),
  });

  // Mock for bookmark_versions delete
  const versionsDeleteMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      error: deleteVersionsSuccess ? null : { message: 'Delete versions failed' },
    }),
  });

  // Mock for sync_sources delete
  const sourcesDeleteMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      error: deleteSourcesSuccess ? null : { message: 'Delete sources failed' },
    }),
  });

  return {
    from: vi.fn().mockImplementation((table) => {
      deletedTables.push(table);
      if (table === 'cloud_bookmarks') {
        return { delete: bookmarksDeleteMock };
      }
      if (table === 'bookmark_versions') {
        return { delete: versionsDeleteMock };
      }
      if (table === 'sync_sources') {
        return { delete: sourcesDeleteMock };
      }
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }),
    getDeletedTables: () => deletedTables,
  };
}

describe('DELETE /api/bookmarks/all - Delete All Cloud Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'DELETE',
        headers: {},
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 401 when token is invalid', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });
  });

  describe('Successful Deletion', () => {
    it('should delete all cloud data for authenticated user', async () => {
      mockSupabase = createDeleteMockSupabase();
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('All cloud data deleted successfully');
      expect(data.deleted).toEqual({
        bookmarks: true,
        versions: true,
        sources: true,
      });
    });

    it('should delete from cloud_bookmarks table', async () => {
      mockSupabase = createDeleteMockSupabase();
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      await DELETE(request);

      const deletedTables = mockSupabase.getDeletedTables();
      expect(deletedTables).toContain('cloud_bookmarks');
    });

    it('should delete from bookmark_versions table', async () => {
      mockSupabase = createDeleteMockSupabase();
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      await DELETE(request);

      const deletedTables = mockSupabase.getDeletedTables();
      expect(deletedTables).toContain('bookmark_versions');
    });

    it('should delete from sync_sources table', async () => {
      mockSupabase = createDeleteMockSupabase();
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      await DELETE(request);

      const deletedTables = mockSupabase.getDeletedTables();
      expect(deletedTables).toContain('sync_sources');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when cloud_bookmarks delete fails', async () => {
      mockSupabase = createDeleteMockSupabase({ deleteBookmarksSuccess: false });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete cloud data');
    });

    it('should return 500 when bookmark_versions delete fails', async () => {
      mockSupabase = createDeleteMockSupabase({ deleteVersionsSuccess: false });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete cloud data');
    });

    it('should return 500 when sync_sources delete fails', async () => {
      mockSupabase = createDeleteMockSupabase({ deleteSourcesSuccess: false });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete cloud data');
    });
  });

  describe('CORS', () => {
    it('should handle OPTIONS preflight request', async () => {
      const request = createMockRequest({
        method: 'OPTIONS',
        headers: { origin: 'chrome-extension://abc123' },
      });

      const response = await OPTIONS(request);

      expect(response.status).toBe(204);
    });

    it('should include CORS headers in response', async () => {
      mockSupabase = createDeleteMockSupabase();
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid-token',
          origin: 'chrome-extension://abc123',
        },
      });

      const response = await DELETE(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    });
  });
});
