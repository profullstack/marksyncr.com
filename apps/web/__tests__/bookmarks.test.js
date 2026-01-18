/**
 * @fileoverview Tests for bookmarks API routes
 * Tests GET, POST, DELETE /api/bookmarks endpoints
 * Uses Vitest with mocked auth helper
 *
 * The cloud_bookmarks table stores ALL bookmarks as a single JSONB blob per user:
 * - bookmark_data: JSONB containing array of bookmarks
 * - checksum: Hash of the bookmark data for change detection
 * - version: Incremented on each update
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock user for authenticated requests
const mockUser = { id: 'user-123', email: 'test@example.com' };

// Create a fresh mock for each test
let mockSupabase;

function createMockSupabase() {
  const mock = {
    from: vi.fn(),
  };

  return mock;
}

/**
 * Helper to create a mock that handles both users table (for ensureUserExists)
 * and cloud_bookmarks table operations
 */
function createPostMockSupabase(options = {}) {
  const {
    userExists = true,
    existingVersion = null,
    upsertSuccess = true,
    upsertData = { version: 1, checksum: 'checksum' },
  } = options;

  // Mock for ensureUserExists - user check
  const usersSelectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: userExists ? { id: 'user-123' } : null,
        error: userExists ? null : { code: 'PGRST116' },
      }),
    }),
  });

  // Mock for user insert (when user doesn't exist)
  const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

  // Mock for subscriptions insert
  const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

  // Mock for getting current version from cloud_bookmarks
  const bookmarksSelectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: existingVersion !== null ? { version: existingVersion } : null,
        error: existingVersion !== null ? null : { code: 'PGRST116' },
      }),
    }),
  });

  // Mock for upsert
  const upsertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: upsertSuccess ? upsertData : null,
        error: upsertSuccess ? null : { message: 'Upsert failed' },
      }),
    }),
  });

  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'users') {
        return { select: usersSelectMock, insert: usersInsertMock };
      }
      if (table === 'subscriptions') {
        return { insert: subscriptionsInsertMock };
      }
      return {
        select: bookmarksSelectMock,
        upsert: upsertMock,
      };
    }),
  };
}

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
const { GET, POST, DELETE } = await import('../app/api/bookmarks/route.js');
const { getAuthenticatedUser } = await import('@/lib/auth-helper');

/**
 * Helper to create a mock NextRequest
 */
function createMockRequest(options = {}) {
  const { method = 'GET', body = null, headers = {} } = options;

  const request = {
    method,
    headers: {
      get: (name) => headers[name] || null,
    },
    json: async () => body,
  };

  return request;
}

describe('Bookmarks API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/bookmarks', () => {
    it('should return 401 when no auth (no header and no session)', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'GET',
        headers: {},
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 401 when authorization header is invalid format and no session', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'InvalidFormat token123' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 401 when token is invalid and no session', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return bookmarks for authenticated user', async () => {
      const mockBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Example' },
        { id: '2', url: 'https://test.com', title: 'Test' },
      ];

      // Mock the chain: from().select().eq().single()
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                bookmark_data: mockBookmarks,
                version: 1,
                checksum: 'abc123',
                last_modified: '2024-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bookmarks).toEqual(mockBookmarks);
      expect(data.count).toBe(2);
      expect(data.version).toBe(1);
    });

    it('should return empty array when user has no bookmarks', async () => {
      // Mock the chain for no rows found (PGRST116)
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            }),
          }),
        }),
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bookmarks).toEqual([]);
      expect(data.count).toBe(0);
    });

    it('should return 500 when database query fails', async () => {
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST500', message: 'Database error' },
            }),
          }),
        }),
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch bookmarks');
    });
  });

  describe('POST /api/bookmarks', () => {
    it('should return 401 when no auth (no header and no session)', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'POST',
        headers: {},
        body: { bookmarks: [] },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when bookmarks is not an array', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: 'not-an-array' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Bookmarks array is required');
    });

    it('should return 400 when bookmarks is missing', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Bookmarks array is required');
    });

    it('should sync bookmarks successfully', async () => {
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com', title: 'Example' },
        { id: '2', url: 'https://test.com', title: 'Test' },
      ];

      // Mock for ensureUserExists - user already exists
      const usersSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user-123' },
            error: null,
          }),
        }),
      });

      // Mock the chain for getting current version from cloud_bookmarks
      const bookmarksSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { version: 1 },
            error: null,
          }),
        }),
      });

      // Mock the chain for upsert
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { version: 2, checksum: 'newchecksum' },
            error: null,
          }),
        }),
      });

      mockSupabase.from = vi.fn().mockImplementation((table) => {
        if (table === 'users') {
          return { select: usersSelectMock };
        }
        return {
          select: bookmarksSelectMock,
          upsert: upsertMock,
        };
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync, source: 'browser' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(2);
      expect(data.total).toBe(2);
      expect(data.message).toBe('Bookmarks synced successfully');
    });

    it('should handle bookmarks with missing optional fields', async () => {
      const bookmarksToSync = [
        { url: 'https://example.com' }, // Missing title, id, etc.
      ];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(1);
    });

    it('should use default source when not provided', async () => {
      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [{ url: 'https://example.com' }] },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should return 500 when upsert fails', async () => {
      mockSupabase = createPostMockSupabase({ existingVersion: 1, upsertSuccess: false });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [{ url: 'https://example.com' }] },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to sync bookmarks');
    });

    it('should handle empty bookmarks array', async () => {
      mockSupabase = createPostMockSupabase({
        existingVersion: null,
        upsertData: { version: 1, checksum: 'empty' },
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [] },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(0);
      expect(data.total).toBe(0);
    });
  });

  describe('DELETE /api/bookmarks', () => {
    it('should return 401 when no auth (no header and no session)', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'DELETE',
        headers: {},
        body: { url: 'https://example.com' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when neither url nor id is provided', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('URL or ID is required');
    });

    it('should delete bookmark by URL', async () => {
      const existingBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Example' },
        { id: '2', url: 'https://test.com', title: 'Test' },
      ];

      // Mock fetch existing bookmarks
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              bookmark_data: existingBookmarks,
              version: 1,
              checksum: 'old',
            },
            error: null,
          }),
        }),
      });

      // Mock update
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      mockSupabase.from = vi.fn().mockImplementation(() => ({
        select: selectMock,
        update: updateMock,
      }));

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { url: 'https://example.com' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Bookmark deleted successfully');
    });

    it('should delete bookmark by ID', async () => {
      const existingBookmarks = [
        { id: 'bookmark-123', url: 'https://example.com', title: 'Example' },
        { id: 'bookmark-456', url: 'https://test.com', title: 'Test' },
      ];

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              bookmark_data: existingBookmarks,
              version: 1,
              checksum: 'old',
            },
            error: null,
          }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      mockSupabase.from = vi.fn().mockImplementation(() => ({
        select: selectMock,
        update: updateMock,
      }));

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { id: 'bookmark-123' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Bookmark deleted successfully');
    });

    it('should prefer ID over URL when both are provided', async () => {
      const existingBookmarks = [
        { id: 'bookmark-123', url: 'https://example.com', title: 'Example' },
      ];

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              bookmark_data: existingBookmarks,
              version: 1,
              checksum: 'old',
            },
            error: null,
          }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: null,
        }),
      });

      mockSupabase.from = vi.fn().mockImplementation(() => ({
        select: selectMock,
        update: updateMock,
      }));

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { id: 'bookmark-123', url: 'https://different.com' },
      });

      const response = await DELETE(request);

      expect(response.status).toBe(200);
    });

    it('should return 404 when bookmark not found', async () => {
      const existingBookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              bookmark_data: existingBookmarks,
              version: 1,
              checksum: 'old',
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from = vi.fn().mockImplementation(() => ({
        select: selectMock,
      }));

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { url: 'https://notfound.com' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Bookmark not found');
    });

    it('should return 500 when update fails', async () => {
      const existingBookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              bookmark_data: existingBookmarks,
              version: 1,
              checksum: 'old',
            },
            error: null,
          }),
        }),
      });

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: { message: 'Update failed' },
        }),
      });

      mockSupabase.from = vi.fn().mockImplementation(() => ({
        select: selectMock,
        update: updateMock,
      }));

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { url: 'https://example.com' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete bookmark');
    });
  });
});

describe('Bookmarks API Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  it('should handle bookmarks with special characters in URL', async () => {
    const bookmarksToSync = [
      { url: 'https://example.com/path?query=value&foo=bar#section', title: 'Special URL' },
    ];

    mockSupabase = createPostMockSupabase({ existingVersion: null });
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bookmarks: bookmarksToSync },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should handle bookmarks with unicode characters in title', async () => {
    const bookmarksToSync = [{ url: 'https://example.com', title: '日本語タイトル 🎉' }];

    mockSupabase = createPostMockSupabase({ existingVersion: null });
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bookmarks: bookmarksToSync },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should handle large bookmark arrays', async () => {
    const bookmarksToSync = Array.from({ length: 1000 }, (_, i) => ({
      url: `https://example${i}.com`,
      title: `Bookmark ${i}`,
    }));

    mockSupabase = createPostMockSupabase({ existingVersion: null });
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bookmarks: bookmarksToSync },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(1000);
  });

  it('should handle bookmarks with nested folder paths', async () => {
    const bookmarksToSync = [
      { url: 'https://example.com', title: 'Example', folderPath: '/Bookmarks/Work/Projects/2024' },
    ];

    mockSupabase = createPostMockSupabase({ existingVersion: null });
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bookmarks: bookmarksToSync },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should handle bookmarks with tags array', async () => {
    const bookmarksToSync = [
      { url: 'https://example.com', title: 'Example', tags: ['work', 'important', 'reference'] },
    ];

    mockSupabase = createPostMockSupabase({ existingVersion: null });
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bookmarks: bookmarksToSync },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});

describe('Empty Title Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  describe('POST /api/bookmarks - Title Handling', () => {
    it('should preserve empty string titles instead of replacing with URL', async () => {
      const bookmarksToSync = [{ id: '1', url: 'https://example.com', title: '' }];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(1);
      // The normalized bookmark should have title: '' not title: 'https://example.com'
    });

    it('should preserve null titles as empty string', async () => {
      const bookmarksToSync = [{ id: '1', url: 'https://example.com', title: null }];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // The normalized bookmark should have title: '' not title: 'https://example.com'
    });

    it('should preserve undefined titles as empty string', async () => {
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com' }, // title is undefined
      ];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // The normalized bookmark should have title: '' not title: 'https://example.com'
    });

    it('should NOT use URL as fallback for missing title', async () => {
      const bookmarksToSync = [{ id: '1', url: 'https://example.com/very/long/path/to/page.html' }];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // IMPORTANT: title should be '' not 'https://example.com/very/long/path/to/page.html'
    });

    it('should preserve normal titles unchanged', async () => {
      const bookmarksToSync = [{ id: '1', url: 'https://example.com', title: 'My Bookmark Title' }];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(1);
    });

    it('should handle mixed bookmarks with and without titles', async () => {
      const bookmarksToSync = [
        { id: '1', url: 'https://example1.com', title: 'Has Title' },
        { id: '2', url: 'https://example2.com', title: '' },
        { id: '3', url: 'https://example3.com', title: null },
        { id: '4', url: 'https://example4.com' }, // undefined
      ];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(4);
      // All bookmarks should be synced with their original titles preserved
      // Empty/null/undefined titles should become '' not URLs
    });
  });

  describe('Nullish Coalescing Behavior', () => {
    it('should use nullish coalescing (??) not logical OR (||) for title', async () => {
      // This test verifies the fix: title ?? '' instead of title || url
      // The difference:
      // - '' || url => url (empty string is falsy)
      // - '' ?? '' => '' (empty string is not nullish)

      const bookmarksToSync = [{ id: '1', url: 'https://example.com', title: '' }];

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksToSync },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // With the fix, empty string titles are preserved
      // Without the fix, they would be replaced with URLs
    });
  });
});

describe('Server-Side Bookmark Merging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  /**
   * Helper to create a mock that handles server-side merging
   * This mock simulates the full flow: fetch existing, merge, upsert
   */
  function createMergeMockSupabase(options = {}) {
    const {
      userExists = true,
      existingBookmarks = [],
      existingVersion = 0,
      upsertSuccess = true,
    } = options;

    // Track what was upserted for assertions
    let upsertedData = null;

    // Mock for ensureUserExists - user check
    const usersSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: userExists ? { id: 'user-123' } : null,
          error: userExists ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for user insert (when user doesn't exist)
    const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for subscriptions insert
    const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for getting existing bookmarks from cloud_bookmarks
    const bookmarksSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data:
            existingBookmarks.length > 0
              ? {
                  bookmark_data: existingBookmarks,
                  version: existingVersion,
                  checksum: 'existing-checksum',
                }
              : null,
          error: existingBookmarks.length > 0 ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for upsert - capture what was upserted
    const upsertMock = vi.fn().mockImplementation((data) => {
      upsertedData = data;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: upsertSuccess
              ? {
                  version: existingVersion + 1,
                  checksum: 'new-checksum',
                  bookmark_data: data.bookmark_data,
                }
              : null,
            error: upsertSuccess ? null : { message: 'Upsert failed' },
          }),
        }),
      };
    });

    const mock = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'users') {
          return { select: usersSelectMock, insert: usersInsertMock };
        }
        if (table === 'subscriptions') {
          return { insert: subscriptionsInsertMock };
        }
        return {
          select: bookmarksSelectMock,
          upsert: upsertMock,
        };
      }),
      getUpsertedData: () => upsertedData,
    };

    return mock;
  }

  describe('POST /api/bookmarks - Merging Behavior', () => {
    it('should merge incoming bookmarks with existing cloud bookmarks', async () => {
      const existingBookmarks = [
        {
          id: '1',
          url: 'https://existing.com',
          title: 'Existing',
          folderPath: '/Bookmarks',
          source: 'firefox',
        },
      ];
      const incomingBookmarks = [
        { id: '2', url: 'https://new.com', title: 'New', folderPath: '/Bookmarks' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should report merged count (existing + new)
      expect(data.merged).toBe(2);
      expect(data.added).toBe(1);
    });

    it('should not duplicate bookmarks with same URL', async () => {
      const existingBookmarks = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Old Title',
          folderPath: '/Bookmarks',
          source: 'firefox',
        },
      ];
      const incomingBookmarks = [
        { id: '2', url: 'https://example.com', title: 'New Title', folderPath: '/Bookmarks' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should have 1 bookmark (merged), not 2 (duplicated)
      expect(data.merged).toBe(1);
      expect(data.added).toBe(0);
    });

    it('should update existing bookmark when URL matches but data differs', async () => {
      const existingBookmarks = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Old Title',
          folderPath: '/Old',
          source: 'firefox',
          dateAdded: 1000,
        },
      ];
      const incomingBookmarks = [
        {
          id: '2',
          url: 'https://example.com',
          title: 'New Title',
          folderPath: '/New',
          dateAdded: 2000,
        },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.merged).toBe(1);
      expect(data.updated).toBe(1);
    });

    it('should preserve bookmarks from other browsers when syncing', async () => {
      // Firefox has bookmarks A and B
      const existingBookmarks = [
        { id: '1', url: 'https://firefox-only.com', title: 'Firefox Only', source: 'firefox' },
        { id: '2', url: 'https://shared.com', title: 'Shared', source: 'firefox' },
      ];
      // Chrome syncs with bookmark B and C
      const incomingBookmarks = [
        { id: '3', url: 'https://shared.com', title: 'Shared', source: 'chrome' },
        { id: '4', url: 'https://chrome-only.com', title: 'Chrome Only', source: 'chrome' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should have 3 unique bookmarks: firefox-only, shared, chrome-only
      expect(data.merged).toBe(3);
    });

    it('should handle first sync when no existing bookmarks', async () => {
      const incomingBookmarks = [{ id: '1', url: 'https://new.com', title: 'New' }];

      mockSupabase = createMergeMockSupabase({ existingBookmarks: [], existingVersion: 0 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.merged).toBe(1);
      expect(data.added).toBe(1);
    });

    it('should merge bookmarks from multiple browsers correctly', async () => {
      // Simulate: Firefox synced first, then Chrome syncs
      const existingBookmarks = [
        { id: 'ff-1', url: 'https://a.com', title: 'A', source: 'firefox' },
        { id: 'ff-2', url: 'https://b.com', title: 'B', source: 'firefox' },
      ];
      const chromeBookmarks = [
        { id: 'ch-1', url: 'https://b.com', title: 'B', source: 'chrome' }, // Same as Firefox
        { id: 'ch-2', url: 'https://c.com', title: 'C', source: 'chrome' }, // Chrome only
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: chromeBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should have 3 unique URLs: a.com, b.com, c.com
      expect(data.merged).toBe(3);
    });

    it('should use URL as the unique identifier for merging', async () => {
      const existingBookmarks = [
        { id: 'old-id', url: 'https://example.com/page', title: 'Old', source: 'firefox' },
      ];
      const incomingBookmarks = [
        { id: 'new-id', url: 'https://example.com/page', title: 'New', source: 'chrome' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Same URL = same bookmark, should not duplicate
      expect(data.merged).toBe(1);
    });

    it('should treat different URLs as different bookmarks', async () => {
      const existingBookmarks = [
        { id: '1', url: 'https://example.com/page1', title: 'Page 1', source: 'firefox' },
      ];
      const incomingBookmarks = [
        { id: '2', url: 'https://example.com/page2', title: 'Page 2', source: 'chrome' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Different URLs = different bookmarks
      expect(data.merged).toBe(2);
    });

    it('should preserve empty titles during merge', async () => {
      const existingBookmarks = [
        { id: '1', url: 'https://example.com', title: '', source: 'firefox' },
      ];
      const incomingBookmarks = [{ id: '2', url: 'https://new.com', title: '', source: 'chrome' }];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.merged).toBe(2);
    });
  });

  describe('Merge Conflict Resolution', () => {
    it('should prefer newer bookmark when same URL has different data', async () => {
      const existingBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Old', dateAdded: 1000, source: 'firefox' },
      ];
      const incomingBookmarks = [
        { id: '2', url: 'https://example.com', title: 'New', dateAdded: 2000, source: 'chrome' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // The newer bookmark (dateAdded: 2000) should win
      expect(data.merged).toBe(1);
    });

    it('should keep existing bookmark if incoming is older', async () => {
      const existingBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Newer', dateAdded: 2000, source: 'firefox' },
      ];
      const incomingBookmarks = [
        { id: '2', url: 'https://example.com', title: 'Older', dateAdded: 1000, source: 'chrome' },
      ];

      mockSupabase = createMergeMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.merged).toBe(1);
    });
  });
});

describe('Tombstone Tracking for Deletion Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  /**
   * Helper to create a mock that handles tombstone tracking
   */
  function createTombstoneMockSupabase(options = {}) {
    const {
      userExists = true,
      existingBookmarks = [],
      existingTombstones = [],
      existingVersion = 0,
      upsertSuccess = true,
    } = options;

    // Mock for ensureUserExists - user check
    const usersSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: userExists ? { id: 'user-123' } : null,
          error: userExists ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for user insert (when user doesn't exist)
    const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for subscriptions insert
    const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for getting existing bookmarks from cloud_bookmarks
    const bookmarksSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data:
            existingBookmarks.length > 0 || existingTombstones.length > 0
              ? {
                  bookmark_data: existingBookmarks,
                  tombstones: existingTombstones,
                  version: existingVersion,
                  checksum: 'existing-checksum',
                }
              : null,
          error:
            existingBookmarks.length > 0 || existingTombstones.length > 0
              ? null
              : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for upsert
    const upsertMock = vi.fn().mockImplementation((data) => {
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: upsertSuccess
              ? {
                  version: existingVersion + 1,
                  checksum: 'new-checksum',
                  bookmark_data: data.bookmark_data,
                  tombstones: data.tombstones,
                }
              : null,
            error: upsertSuccess ? null : { message: 'Upsert failed' },
          }),
        }),
      };
    });

    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'users') {
          return { select: usersSelectMock, insert: usersInsertMock };
        }
        if (table === 'subscriptions') {
          return { insert: subscriptionsInsertMock };
        }
        return {
          select: bookmarksSelectMock,
          upsert: upsertMock,
        };
      }),
    };
  }

  describe('POST /api/bookmarks - Tombstone Handling', () => {
    it('should accept tombstones in the request body', async () => {
      const bookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];
      const tombstones = [{ url: 'https://deleted.com', deletedAt: Date.now() }];

      mockSupabase = createTombstoneMockSupabase({ existingVersion: 0 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks, tombstones, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should merge incoming tombstones with existing tombstones', async () => {
      const existingTombstones = [{ url: 'https://old-deleted.com', deletedAt: 1000 }];
      const incomingTombstones = [{ url: 'https://new-deleted.com', deletedAt: 2000 }];

      mockSupabase = createTombstoneMockSupabase({ existingTombstones, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: incomingTombstones, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should NOT remove bookmarks on server - tombstones are applied by extensions only', async () => {
      // IMPORTANT: Server should NOT apply tombstones to bookmarks.
      // Tombstones are stored and merged, but only browser extensions apply them locally.
      // This prevents the bug where bookmarks were being deleted automatically.
      const existingBookmarks = [
        { id: '1', url: 'https://to-delete.com', title: 'To Delete', dateAdded: 1000 },
        { id: '2', url: 'https://keep.com', title: 'Keep', dateAdded: 3000 },
      ];
      const incomingTombstones = [
        { url: 'https://to-delete.com', deletedAt: 2000 }, // Newer than dateAdded (1000)
      ];

      mockSupabase = createTombstoneMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: incomingTombstones, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Server should keep ALL bookmarks - tombstones are NOT applied server-side
      // Extensions will apply tombstones locally when they sync
      expect(data.merged).toBe(2);
    });

    it('should NOT remove bookmarks if tombstone is older than dateAdded', async () => {
      const existingBookmarks = [
        { id: '1', url: 'https://re-added.com', title: 'Re-added', dateAdded: 3000 },
      ];
      const incomingTombstones = [
        { url: 'https://re-added.com', deletedAt: 1000 }, // Older than dateAdded (3000)
      ];

      mockSupabase = createTombstoneMockSupabase({ existingBookmarks, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: incomingTombstones, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should still have 1 bookmark (re-added.com) because tombstone is older
      expect(data.merged).toBe(1);
    });

    it('should update tombstone timestamp if newer deletion is received', async () => {
      const existingTombstones = [{ url: 'https://deleted.com', deletedAt: 1000 }];
      const incomingTombstones = [
        { url: 'https://deleted.com', deletedAt: 2000 }, // Newer
      ];

      mockSupabase = createTombstoneMockSupabase({ existingTombstones, existingVersion: 1 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: incomingTombstones, source: 'chrome' },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/bookmarks - Tombstone Handling', () => {
    it('should return tombstones along with bookmarks', async () => {
      const mockBookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];
      const mockTombstones = [{ url: 'https://deleted.com', deletedAt: Date.now() }];

      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                bookmark_data: mockBookmarks,
                tombstones: mockTombstones,
                version: 1,
                checksum: 'abc123',
                last_modified: '2024-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bookmarks).toEqual(mockBookmarks);
      expect(data.tombstones).toEqual(mockTombstones);
    });

    it('should return empty tombstones array when none exist', async () => {
      const mockBookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];

      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                bookmark_data: mockBookmarks,
                version: 1,
                checksum: 'abc123',
                last_modified: '2024-01-01T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tombstones).toEqual([]);
    });
  });
});

describe('Checksum-Based Skip Write Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  /**
   * Helper to create a mock that tracks whether upsert was called
   * and supports checksum comparison
   */
  function createChecksumMockSupabase(options = {}) {
    const {
      userExists = true,
      existingBookmarks = [],
      existingTombstones = [],
      existingVersion = 1,
      existingChecksum = null,
      upsertSuccess = true,
    } = options;

    // Track if upsert was called
    let upsertCalled = false;
    let upsertedData = null;

    // Mock for ensureUserExists - user check
    const usersSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: userExists ? { id: 'user-123' } : null,
          error: userExists ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for user insert (when user doesn't exist)
    const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for subscriptions insert
    const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for getting existing bookmarks from cloud_bookmarks
    const bookmarksSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data:
            existingBookmarks.length > 0 || existingChecksum
              ? {
                  bookmark_data: existingBookmarks,
                  tombstones: existingTombstones,
                  version: existingVersion,
                  checksum: existingChecksum,
                }
              : null,
          error: existingBookmarks.length > 0 || existingChecksum ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for upsert - track if called
    const upsertMock = vi.fn().mockImplementation((data) => {
      upsertCalled = true;
      upsertedData = data;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: upsertSuccess
              ? {
                  version: existingVersion + 1,
                  checksum: data.checksum || 'new-checksum',
                  bookmark_data: data.bookmark_data,
                  tombstones: data.tombstones,
                }
              : null,
            error: upsertSuccess ? null : { message: 'Upsert failed' },
          }),
        }),
      };
    });

    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'users') {
          return { select: usersSelectMock, insert: usersInsertMock };
        }
        if (table === 'subscriptions') {
          return { insert: subscriptionsInsertMock };
        }
        return {
          select: bookmarksSelectMock,
          upsert: upsertMock,
        };
      }),
      wasUpsertCalled: () => upsertCalled,
      getUpsertedData: () => upsertedData,
    };
  }

  describe('POST /api/bookmarks - Skip Write When Checksum Unchanged', () => {
    it('should skip database write when checksum matches existing data', async () => {
      // Same bookmarks that would produce the same checksum
      const bookmarks = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks',
          dateAdded: 1700000000000,
          index: 0,
        },
      ];

      // Pre-calculate the checksum that would be generated
      // The server normalizes and sorts by type, folderPath, then index
      // NOTE: dateAdded is intentionally EXCLUDED from checksum calculation
      // because browsers assign new dateAdded when syncing bookmarks
      const crypto = await import('crypto');
      const normalized = bookmarks
        .map((b) => ({
          type: 'bookmark',
          url: b.url,
          title: b.title ?? '',
          folderPath: b.folderPath || '',
          index: b.index ?? 0,
        }))
        .sort((a, b) => {
          // Sort by type first (folders before bookmarks)
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          const folderCompare = a.folderPath.localeCompare(b.folderPath);
          if (folderCompare !== 0) return folderCompare;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex');

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks: bookmarks,
        existingVersion: 5,
        existingChecksum: expectedChecksum,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should indicate no changes were made
      expect(data.skipped).toBe(true);
      // Version should remain the same
      expect(data.version).toBe(5);
      // Upsert should NOT have been called
      expect(mockSupabase.wasUpsertCalled()).toBe(false);
    });

    it('should write to database when checksum differs', async () => {
      const existingBookmarks = [
        {
          id: '1',
          url: 'https://old.com',
          title: 'Old',
          folderPath: 'Bookmarks',
          dateAdded: 1700000000000,
        },
      ];
      const newBookmarks = [
        {
          id: '2',
          url: 'https://new.com',
          title: 'New',
          folderPath: 'Bookmarks',
          dateAdded: 1700000001000,
        },
      ];

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks,
        existingVersion: 5,
        existingChecksum: 'old-checksum-that-wont-match',
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: newBookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should NOT be skipped
      expect(data.skipped).toBeUndefined();
      // Version should be incremented
      expect(data.version).toBe(6);
      // Upsert SHOULD have been called
      expect(mockSupabase.wasUpsertCalled()).toBe(true);
    });

    it('should write to database when no existing data (first sync)', async () => {
      const bookmarks = [{ id: '1', url: 'https://example.com', title: 'Example' }];

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks: [],
        existingVersion: 0,
        existingChecksum: null,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should NOT be skipped for first sync
      expect(data.skipped).toBeUndefined();
      // Upsert SHOULD have been called
      expect(mockSupabase.wasUpsertCalled()).toBe(true);
    });

    it('should write to database when tombstones change even if bookmarks are same', async () => {
      const bookmarks = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks',
          dateAdded: 1700000000000,
          index: 0,
        },
      ];
      const newTombstones = [{ url: 'https://deleted.com', deletedAt: Date.now() }];

      // Calculate checksum for bookmarks (including type and index)
      // NOTE: dateAdded is intentionally EXCLUDED from checksum calculation
      const crypto = await import('crypto');
      const normalized = bookmarks
        .map((b) => ({
          type: 'bookmark',
          url: b.url,
          title: b.title ?? '',
          folderPath: b.folderPath || '',
          index: b.index ?? 0,
        }))
        .sort((a, b) => {
          // Sort by type first (folders before bookmarks)
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          const folderCompare = a.folderPath.localeCompare(b.folderPath);
          if (folderCompare !== 0) return folderCompare;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const bookmarkChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex');

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks: bookmarks,
        existingTombstones: [], // No existing tombstones
        existingVersion: 5,
        existingChecksum: bookmarkChecksum,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks, tombstones: newTombstones, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should NOT be skipped because tombstones changed
      expect(data.skipped).toBeUndefined();
      // Upsert SHOULD have been called
      expect(mockSupabase.wasUpsertCalled()).toBe(true);
    });

    it('should return existing checksum when skipping write', async () => {
      const bookmarks = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks',
          dateAdded: 1700000000000,
          index: 0,
        },
      ];

      // NOTE: dateAdded is intentionally EXCLUDED from checksum calculation
      const crypto = await import('crypto');
      const normalized = bookmarks
        .map((b) => ({
          type: 'bookmark',
          url: b.url,
          title: b.title ?? '',
          folderPath: b.folderPath || '',
          index: b.index ?? 0,
        }))
        .sort((a, b) => {
          // Sort by type first (folders before bookmarks)
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          const folderCompare = a.folderPath.localeCompare(b.folderPath);
          if (folderCompare !== 0) return folderCompare;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex');

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks: bookmarks,
        existingVersion: 5,
        existingChecksum: expectedChecksum,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skipped).toBe(true);
      expect(data.checksum).toBe(expectedChecksum);
    });

    it('should handle repeated syncs with same data without incrementing version', async () => {
      const bookmarks = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks',
          dateAdded: 1700000000000,
          index: 0,
        },
      ];

      // NOTE: dateAdded is intentionally EXCLUDED from checksum calculation
      const crypto = await import('crypto');
      const normalized = bookmarks
        .map((b) => ({
          type: 'bookmark',
          url: b.url,
          title: b.title ?? '',
          folderPath: b.folderPath || '',
          index: b.index ?? 0,
        }))
        .sort((a, b) => {
          // Sort by type first (folders before bookmarks)
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          const folderCompare = a.folderPath.localeCompare(b.folderPath);
          if (folderCompare !== 0) return folderCompare;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const expectedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex');

      // Simulate multiple syncs with same data
      for (let i = 0; i < 3; i++) {
        mockSupabase = createChecksumMockSupabase({
          existingBookmarks: bookmarks,
          existingVersion: 5, // Version should stay at 5
          existingChecksum: expectedChecksum,
        });
        getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

        const request = createMockRequest({
          method: 'POST',
          headers: { authorization: 'Bearer valid-token' },
          body: { bookmarks, source: 'chrome' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.skipped).toBe(true);
        expect(data.version).toBe(5); // Version should NOT increment
        expect(mockSupabase.wasUpsertCalled()).toBe(false);
      }
    });
  });

  describe('Checksum Comparison Edge Cases', () => {
    it('should detect change when bookmark order differs but content is same', async () => {
      // Bookmarks in different folders should produce SAME checksum regardless of input order
      // (sorted by folderPath then index)
      const bookmarksOrder1 = [
        {
          id: '1',
          url: 'https://a.com',
          title: 'A',
          folderPath: 'Folder A',
          dateAdded: 1000,
          index: 0,
        },
        {
          id: '2',
          url: 'https://b.com',
          title: 'B',
          folderPath: 'Folder B',
          dateAdded: 2000,
          index: 0,
        },
      ];
      const bookmarksOrder2 = [
        {
          id: '2',
          url: 'https://b.com',
          title: 'B',
          folderPath: 'Folder B',
          dateAdded: 2000,
          index: 0,
        },
        {
          id: '1',
          url: 'https://a.com',
          title: 'A',
          folderPath: 'Folder A',
          dateAdded: 1000,
          index: 0,
        },
      ];

      // NOTE: dateAdded is intentionally EXCLUDED from checksum calculation
      const crypto = await import('crypto');
      const normalized1 = bookmarksOrder1
        .map((b) => ({
          type: 'bookmark',
          url: b.url,
          title: b.title ?? '',
          folderPath: b.folderPath || '',
          index: b.index ?? 0,
        }))
        .sort((a, b) => {
          // Sort by type first (folders before bookmarks)
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          const folderCompare = a.folderPath.localeCompare(b.folderPath);
          if (folderCompare !== 0) return folderCompare;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const checksum1 = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalized1))
        .digest('hex');

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks: bookmarksOrder1,
        existingVersion: 5,
        existingChecksum: checksum1,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksOrder2, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should be skipped because content is the same (just different input order)
      expect(data.skipped).toBe(true);
    });

    it('should detect change when extra fields differ but core fields are same', async () => {
      // Extra fields like 'id', 'source', 'dateAdded' should be ignored in checksum
      // Note: 'index' is now part of the checksum, so it must match
      const bookmarksWithExtras = [
        {
          id: 'browser-123',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bar',
          dateAdded: 1000,
          index: 5,
          source: 'chrome',
        },
      ];
      const bookmarksMinimal = [
        {
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bar',
          dateAdded: 1000,
          index: 5,
        },
      ];

      // NOTE: dateAdded is intentionally EXCLUDED from checksum calculation
      const crypto = await import('crypto');
      const normalized = bookmarksMinimal
        .map((b) => ({
          type: 'bookmark',
          url: b.url,
          title: b.title ?? '',
          folderPath: b.folderPath || '',
          index: b.index ?? 0,
        }))
        .sort((a, b) => {
          // Sort by type first (folders before bookmarks)
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }
          const folderCompare = a.folderPath.localeCompare(b.folderPath);
          if (folderCompare !== 0) return folderCompare;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      const checksum = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

      mockSupabase = createChecksumMockSupabase({
        existingBookmarks: bookmarksWithExtras,
        existingVersion: 5,
        existingChecksum: checksum,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: bookmarksMinimal, source: 'firefox' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should be skipped because core fields (including index) are the same
      expect(data.skipped).toBe(true);
    });
  });
});

describe('Folder Ordering Preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  /**
   * Helper to create a mock that captures the merged data
   */
  function createOrderingMockSupabase(options = {}) {
    const { userExists = true, existingBookmarks = [], existingVersion = 0 } = options;

    // Track what was upserted for assertions
    let upsertedData = null;

    // Mock for ensureUserExists - user check
    const usersSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: userExists ? { id: 'user-123' } : null,
          error: userExists ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for user insert (when user doesn't exist)
    const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for subscriptions insert
    const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for getting existing bookmarks from cloud_bookmarks
    const bookmarksSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data:
            existingBookmarks.length > 0
              ? {
                  bookmark_data: existingBookmarks,
                  version: existingVersion,
                  checksum: 'existing-checksum',
                }
              : null,
          error: existingBookmarks.length > 0 ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for upsert - capture what was upserted
    const upsertMock = vi.fn().mockImplementation((data) => {
      upsertedData = data;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              version: existingVersion + 1,
              checksum: 'new-checksum',
              bookmark_data: data.bookmark_data,
            },
            error: null,
          }),
        }),
      };
    });

    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'users') {
          return { select: usersSelectMock, insert: usersInsertMock };
        }
        if (table === 'subscriptions') {
          return { insert: subscriptionsInsertMock };
        }
        return {
          select: bookmarksSelectMock,
          upsert: upsertMock,
        };
      }),
      getUpsertedData: () => upsertedData,
    };
  }

  describe('POST /api/bookmarks - Folder and Bookmark Interleaving', () => {
    it('should preserve interleaved order of folders and bookmarks within same folderPath', async () => {
      // This test verifies that when folders and bookmarks are interleaved
      // (e.g., folder at index 0, bookmark at index 1, folder at index 2),
      // the order is preserved after merging.
      //
      // The bug was that mergeBookmarks() was putting all bookmarks first,
      // then all folders, before sorting. This caused folders to appear
      // after bookmarks even when they should be interleaved.

      const incomingItems = [
        { type: 'folder', title: 'Folder A', folderPath: 'Bookmarks Bar', index: 0 },
        {
          type: 'bookmark',
          url: 'https://example.com',
          title: 'Example',
          folderPath: 'Bookmarks Bar',
          index: 1,
        },
        { type: 'folder', title: 'Folder B', folderPath: 'Bookmarks Bar', index: 2 },
        {
          type: 'bookmark',
          url: 'https://test.com',
          title: 'Test',
          folderPath: 'Bookmarks Bar',
          index: 3,
        },
      ];

      mockSupabase = createOrderingMockSupabase({ existingBookmarks: [], existingVersion: 0 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingItems, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.merged).toBe(4);

      // Verify the order in the upserted data
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData).not.toBeNull();

      const mergedItems = upsertedData.bookmark_data;
      expect(mergedItems).toHaveLength(4);

      // Items should be sorted by folderPath, then by index
      // Since all have same folderPath, they should be in index order
      expect(mergedItems[0].index).toBe(0);
      expect(mergedItems[0].type).toBe('folder');
      expect(mergedItems[0].title).toBe('Folder A');

      expect(mergedItems[1].index).toBe(1);
      expect(mergedItems[1].type).toBe('bookmark');
      expect(mergedItems[1].url).toBe('https://example.com');

      expect(mergedItems[2].index).toBe(2);
      expect(mergedItems[2].type).toBe('folder');
      expect(mergedItems[2].title).toBe('Folder B');

      expect(mergedItems[3].index).toBe(3);
      expect(mergedItems[3].type).toBe('bookmark');
      expect(mergedItems[3].url).toBe('https://test.com');
    });

    it('should NOT put all folders after all bookmarks', async () => {
      // This is the specific bug we're fixing:
      // Before the fix, folders would always appear after bookmarks
      // because the array was constructed as [...bookmarks, ...folders]

      const incomingItems = [
        { type: 'bookmark', url: 'https://a.com', title: 'A', folderPath: 'Root', index: 0 },
        { type: 'folder', title: 'My Folder', folderPath: 'Root', index: 1 },
        { type: 'bookmark', url: 'https://b.com', title: 'B', folderPath: 'Root', index: 2 },
      ];

      mockSupabase = createOrderingMockSupabase({ existingBookmarks: [], existingVersion: 0 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingItems, source: 'chrome' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const upsertedData = mockSupabase.getUpsertedData();
      const mergedItems = upsertedData.bookmark_data;

      // The folder should be at index 1, NOT at the end
      expect(mergedItems[1].type).toBe('folder');
      expect(mergedItems[1].title).toBe('My Folder');

      // NOT this (the bug):
      // mergedItems[0] = bookmark A
      // mergedItems[1] = bookmark B
      // mergedItems[2] = folder (WRONG - should be at index 1)
    });

    it('should handle folders and bookmarks in different folderPaths correctly', async () => {
      const incomingItems = [
        { type: 'folder', title: 'Work', folderPath: 'Bookmarks Bar', index: 0 },
        {
          type: 'bookmark',
          url: 'https://work.com',
          title: 'Work Site',
          folderPath: 'Bookmarks Bar/Work',
          index: 0,
        },
        { type: 'folder', title: 'Personal', folderPath: 'Bookmarks Bar', index: 1 },
        {
          type: 'bookmark',
          url: 'https://personal.com',
          title: 'Personal Site',
          folderPath: 'Bookmarks Bar/Personal',
          index: 0,
        },
      ];

      mockSupabase = createOrderingMockSupabase({ existingBookmarks: [], existingVersion: 0 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingItems, source: 'chrome' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const upsertedData = mockSupabase.getUpsertedData();
      const mergedItems = upsertedData.bookmark_data;

      // Items should be sorted by folderPath first, then by index
      // Expected order:
      // 1. Bookmarks Bar items (Work folder at 0, Personal folder at 1)
      // 2. Bookmarks Bar/Personal items (Personal Site at 0)
      // 3. Bookmarks Bar/Work items (Work Site at 0)

      expect(mergedItems).toHaveLength(4);

      // First two should be from "Bookmarks Bar" (sorted by index)
      expect(mergedItems[0].folderPath).toBe('Bookmarks Bar');
      expect(mergedItems[0].index).toBe(0);
      expect(mergedItems[1].folderPath).toBe('Bookmarks Bar');
      expect(mergedItems[1].index).toBe(1);

      // Next should be from "Bookmarks Bar/Personal" (alphabetically before "Bookmarks Bar/Work")
      expect(mergedItems[2].folderPath).toBe('Bookmarks Bar/Personal');

      // Last should be from "Bookmarks Bar/Work"
      expect(mergedItems[3].folderPath).toBe('Bookmarks Bar/Work');
    });
  });
});

describe('Bookmark Count Limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  describe('POST /api/bookmarks - Request Size Limits', () => {
    it('should reject requests with more than 10,000 bookmarks', async () => {
      // Create an array with 10,001 bookmarks (exceeds limit)
      const tooManyBookmarks = Array.from({ length: 10001 }, (_, i) => ({
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
      }));

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: tooManyBookmarks },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Too many bookmarks');
      expect(data.received).toBe(10001);
      expect(data.limit).toBe(10000);
    });

    it('should accept requests with exactly 10,000 bookmarks', async () => {
      // Create an array with exactly 10,000 bookmarks (at the limit)
      const maxBookmarks = Array.from({ length: 10000 }, (_, i) => ({
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
      }));

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: maxBookmarks },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(10000);
    });

    it('should accept requests with fewer than 10,000 bookmarks', async () => {
      const fewBookmarks = Array.from({ length: 100 }, (_, i) => ({
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
      }));

      mockSupabase = createPostMockSupabase({ existingVersion: null });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: fewBookmarks },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synced).toBe(100);
    });
  });

  describe('POST /api/bookmarks - Total Count Limits After Merge', () => {
    /**
     * Helper to create a mock that simulates existing bookmarks in the database
     */
    function createMergeLimitMockSupabase(options = {}) {
      const { userExists = true, existingBookmarks = [], existingVersion = 1 } = options;

      // Mock for ensureUserExists - user check
      const usersSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: userExists ? { id: 'user-123' } : null,
            error: userExists ? null : { code: 'PGRST116' },
          }),
        }),
      });

      // Mock for user insert (when user doesn't exist)
      const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

      // Mock for subscriptions insert
      const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

      // Mock for getting existing bookmarks from cloud_bookmarks
      const bookmarksSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data:
              existingBookmarks.length > 0
                ? {
                    bookmark_data: existingBookmarks,
                    tombstones: [],
                    version: existingVersion,
                    checksum: 'existing-checksum',
                  }
                : null,
            error: existingBookmarks.length > 0 ? null : { code: 'PGRST116' },
          }),
        }),
      });

      // Mock for upsert
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              version: existingVersion + 1,
              checksum: 'new-checksum',
            },
            error: null,
          }),
        }),
      });

      return {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'users') {
            return { select: usersSelectMock, insert: usersInsertMock };
          }
          if (table === 'subscriptions') {
            return { insert: subscriptionsInsertMock };
          }
          return {
            select: bookmarksSelectMock,
            upsert: upsertMock,
          };
        }),
      };
    }

    it('should reject merge if total would exceed 10,000 bookmarks', async () => {
      // Existing: 9,000 bookmarks
      const existingBookmarks = Array.from({ length: 9000 }, (_, i) => ({
        url: `https://existing${i}.com`,
        title: `Existing ${i}`,
      }));

      // Incoming: 2,000 new bookmarks (total would be 11,000)
      const newBookmarks = Array.from({ length: 2000 }, (_, i) => ({
        url: `https://new${i}.com`,
        title: `New ${i}`,
      }));

      mockSupabase = createMergeLimitMockSupabase({ existingBookmarks, existingVersion: 5 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: newBookmarks },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('exceed limit');
      expect(data.current).toBe(9000);
      expect(data.incoming).toBe(2000);
      expect(data.wouldBe).toBe(11000);
      expect(data.limit).toBe(10000);
    });

    it('should allow merge if total is exactly 10,000 bookmarks', async () => {
      // Existing: 5,000 bookmarks
      const existingBookmarks = Array.from({ length: 5000 }, (_, i) => ({
        url: `https://existing${i}.com`,
        title: `Existing ${i}`,
      }));

      // Incoming: 5,000 new bookmarks (total would be exactly 10,000)
      const newBookmarks = Array.from({ length: 5000 }, (_, i) => ({
        url: `https://new${i}.com`,
        title: `New ${i}`,
      }));

      mockSupabase = createMergeLimitMockSupabase({ existingBookmarks, existingVersion: 5 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: newBookmarks },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.merged).toBe(10000);
    });

    it('should allow merge when duplicates keep total under limit', async () => {
      // Existing: 9,000 bookmarks
      const existingBookmarks = Array.from({ length: 9000 }, (_, i) => ({
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
      }));

      // Incoming: 2,000 bookmarks, but 1,500 are duplicates of existing
      // So only 500 new unique bookmarks would be added (total: 9,500)
      const incomingBookmarks = [
        // 1,500 duplicates (same URLs as existing)
        ...Array.from({ length: 1500 }, (_, i) => ({
          url: `https://example${i}.com`,
          title: `Updated ${i}`,
        })),
        // 500 new unique bookmarks
        ...Array.from({ length: 500 }, (_, i) => ({
          url: `https://brand-new${i}.com`,
          title: `Brand New ${i}`,
        })),
      ];

      mockSupabase = createMergeLimitMockSupabase({ existingBookmarks, existingVersion: 5 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: incomingBookmarks },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Total should be 9,500 (9,000 existing + 500 new unique)
      expect(data.merged).toBe(9500);
    });
  });
});

describe('Server-Side Tombstone Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  /**
   * Helper to create a mock that handles tombstone cleanup testing
   */
  function createTombstoneCleanupMockSupabase(options = {}) {
    const {
      userExists = true,
      existingBookmarks = [],
      existingTombstones = [],
      existingVersion = 0,
      upsertSuccess = true,
    } = options;

    // Track what was upserted for assertions
    let upsertedData = null;

    // Mock for ensureUserExists - user check
    const usersSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: userExists ? { id: 'user-123' } : null,
          error: userExists ? null : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for user insert (when user doesn't exist)
    const usersInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for subscriptions insert
    const subscriptionsInsertMock = vi.fn().mockResolvedValue({ error: null });

    // Mock for getting existing bookmarks from cloud_bookmarks
    const bookmarksSelectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data:
            existingBookmarks.length > 0 || existingTombstones.length > 0
              ? {
                  bookmark_data: existingBookmarks,
                  tombstones: existingTombstones,
                  version: existingVersion,
                  checksum: 'existing-checksum',
                }
              : null,
          error:
            existingBookmarks.length > 0 || existingTombstones.length > 0
              ? null
              : { code: 'PGRST116' },
        }),
      }),
    });

    // Mock for upsert - capture what was upserted
    const upsertMock = vi.fn().mockImplementation((data) => {
      upsertedData = data;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: upsertSuccess
              ? {
                  version: existingVersion + 1,
                  checksum: 'new-checksum',
                  bookmark_data: data.bookmark_data,
                  tombstones: data.tombstones,
                }
              : null,
            error: upsertSuccess ? null : { message: 'Upsert failed' },
          }),
        }),
      };
    });

    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'users') {
          return { select: usersSelectMock, insert: usersInsertMock };
        }
        if (table === 'subscriptions') {
          return { insert: subscriptionsInsertMock };
        }
        return {
          select: bookmarksSelectMock,
          upsert: upsertMock,
        };
      }),
      getUpsertedData: () => upsertedData,
    };
  }

  describe('POST /api/bookmarks - Tombstone Cleanup', () => {
    it('should remove tombstones older than 30 days from existing data', async () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
      const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000;

      const existingTombstones = [
        { url: 'https://old-deleted.com', deletedAt: thirtyOneDaysAgo }, // Should be cleaned up
        { url: 'https://recent-deleted.com', deletedAt: twentyNineDaysAgo }, // Should be kept
      ];

      mockSupabase = createTombstoneCleanupMockSupabase({
        existingTombstones,
        existingVersion: 1,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: [], source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Check that the old tombstone was cleaned up
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData).not.toBeNull();
      expect(upsertedData.tombstones).toHaveLength(1);
      expect(upsertedData.tombstones[0].url).toBe('https://recent-deleted.com');
    });

    it('should remove tombstones older than 30 days from incoming data', async () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
      const twentyNineDaysAgo = now - 29 * 24 * 60 * 60 * 1000;

      const incomingTombstones = [
        { url: 'https://old-incoming.com', deletedAt: thirtyOneDaysAgo }, // Should be cleaned up
        { url: 'https://recent-incoming.com', deletedAt: twentyNineDaysAgo }, // Should be kept
      ];

      mockSupabase = createTombstoneCleanupMockSupabase({ existingVersion: 0 });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: incomingTombstones, source: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Check that the old tombstone was cleaned up
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData).not.toBeNull();
      expect(upsertedData.tombstones).toHaveLength(1);
      expect(upsertedData.tombstones[0].url).toBe('https://recent-incoming.com');
    });

    it('should keep tombstones exactly 30 days old', async () => {
      const now = Date.now();
      const exactlyThirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      const existingTombstones = [
        { url: 'https://exactly-30-days.com', deletedAt: exactlyThirtyDaysAgo },
      ];

      mockSupabase = createTombstoneCleanupMockSupabase({
        existingTombstones,
        existingVersion: 1,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: [], source: 'chrome' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Tombstone at exactly 30 days should be kept (cutoff is > 30 days)
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData.tombstones).toHaveLength(1);
    });

    it('should clean up old tombstones during merge', async () => {
      const now = Date.now();
      const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
      const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

      const existingTombstones = [
        { url: 'https://very-old.com', deletedAt: fortyDaysAgo }, // Should be cleaned up (> 30 days)
        { url: 'https://existing-recent.com', deletedAt: tenDaysAgo }, // Should be kept (< 30 days)
      ];

      const incomingTombstones = [
        { url: 'https://incoming-recent.com', deletedAt: fiveDaysAgo }, // Should be kept
      ];

      mockSupabase = createTombstoneCleanupMockSupabase({
        existingTombstones,
        existingVersion: 1,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: incomingTombstones, source: 'chrome' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Should have 2 tombstones (the two recent ones)
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData.tombstones).toHaveLength(2);

      const urls = upsertedData.tombstones.map((t) => t.url);
      expect(urls).toContain('https://existing-recent.com');
      expect(urls).toContain('https://incoming-recent.com');
      expect(urls).not.toContain('https://very-old.com');
    });

    it('should handle tombstones without deletedAt timestamp', async () => {
      // Tombstones without deletedAt should be kept (can't determine age)
      const existingTombstones = [
        { url: 'https://no-timestamp.com' }, // No deletedAt - should be kept
        { url: 'https://with-timestamp.com', deletedAt: Date.now() - 5 * 24 * 60 * 60 * 1000 },
      ];

      mockSupabase = createTombstoneCleanupMockSupabase({
        existingTombstones,
        existingVersion: 1,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: [], source: 'chrome' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Both should be kept
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData.tombstones).toHaveLength(2);
    });
  });

  describe('Tombstone Cleanup - Root Cause Fix', () => {
    it('should prevent stale tombstones from accumulating in cloud', async () => {
      // This test verifies the ROOT CAUSE fix:
      // Before: Tombstones accumulated forever in the cloud
      // After: Tombstones older than 30 days are automatically cleaned up

      const now = Date.now();

      // Simulate a scenario where tombstones have been accumulating for months
      const accumulatedTombstones = [
        { url: 'https://deleted-90-days-ago.com', deletedAt: now - 90 * 24 * 60 * 60 * 1000 },
        { url: 'https://deleted-60-days-ago.com', deletedAt: now - 60 * 24 * 60 * 60 * 1000 },
        { url: 'https://deleted-45-days-ago.com', deletedAt: now - 45 * 24 * 60 * 60 * 1000 },
        { url: 'https://deleted-31-days-ago.com', deletedAt: now - 31 * 24 * 60 * 60 * 1000 },
        { url: 'https://deleted-29-days-ago.com', deletedAt: now - 29 * 24 * 60 * 60 * 1000 },
        { url: 'https://deleted-7-days-ago.com', deletedAt: now - 7 * 24 * 60 * 60 * 1000 },
        { url: 'https://deleted-today.com', deletedAt: now },
      ];

      mockSupabase = createTombstoneCleanupMockSupabase({
        existingTombstones: accumulatedTombstones,
        existingVersion: 1,
      });
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [], tombstones: [], source: 'chrome' },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Only tombstones from the last 30 days should remain
      const upsertedData = mockSupabase.getUpsertedData();
      expect(upsertedData.tombstones).toHaveLength(3); // 29 days, 7 days, today

      const urls = upsertedData.tombstones.map((t) => t.url);
      expect(urls).toContain('https://deleted-29-days-ago.com');
      expect(urls).toContain('https://deleted-7-days-ago.com');
      expect(urls).toContain('https://deleted-today.com');

      // Old tombstones should be gone
      expect(urls).not.toContain('https://deleted-90-days-ago.com');
      expect(urls).not.toContain('https://deleted-60-days-ago.com');
      expect(urls).not.toContain('https://deleted-45-days-ago.com');
      expect(urls).not.toContain('https://deleted-31-days-ago.com');
    });
  });
});
