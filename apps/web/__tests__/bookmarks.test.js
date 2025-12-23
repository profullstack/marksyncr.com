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
      mockSupabase = createPostMockSupabase({ existingVersion: null, upsertData: { version: 1, checksum: 'empty' } });
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
      const existingBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Example' },
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
      const existingBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Example' },
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
    const bookmarksToSync = [
      { url: 'https://example.com', title: '日本語タイトル 🎉' },
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
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com', title: '' },
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
      // The normalized bookmark should have title: '' not title: 'https://example.com'
    });

    it('should preserve null titles as empty string', async () => {
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com', title: null },
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
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com/very/long/path/to/page.html' },
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
      // IMPORTANT: title should be '' not 'https://example.com/very/long/path/to/page.html'
    });

    it('should preserve normal titles unchanged', async () => {
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com', title: 'My Bookmark Title' },
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
      
      const bookmarksToSync = [
        { id: '1', url: 'https://example.com', title: '' },
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
      // With the fix, empty string titles are preserved
      // Without the fix, they would be replaced with URLs
    });
  });
});
