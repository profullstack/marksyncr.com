/**
 * @fileoverview Tests for bookmarks API routes
 * Tests GET, POST, DELETE /api/bookmarks endpoints
 * Uses Vitest with mocked auth helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Chain mock setup
const createChainMock = () => ({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn(),
});

let chainMock = createChainMock();

// Mock user for authenticated requests
const mockUser = { id: 'user-123', email: 'test@example.com' };

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => chainMock),
};

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
    chainMock = createChainMock();
    mockSupabase.from = vi.fn(() => chainMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/bookmarks', () => {
    it('should return 401 when no auth (no header and no session)', async () => {
      // Mock auth to fail
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
      // Mock auth to fail
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
      // Mock auth to fail
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
        { id: '1', url: 'https://example.com', title: 'Example', user_id: 'user-123' },
        { id: '2', url: 'https://test.com', title: 'Test', user_id: 'user-123' },
      ];

      chainMock.order.mockResolvedValue({
        data: mockBookmarks,
        error: null,
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
    });

    it('should return empty array when user has no bookmarks', async () => {
      chainMock.order.mockResolvedValue({
        data: [],
        error: null,
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
      chainMock.order.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
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
      // Mock auth to fail
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

      chainMock.select.mockResolvedValue({
        data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
        error: null,
      });

      // Mock version history insert
      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
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

      chainMock.select.mockResolvedValue({
        data: [{ url: 'https://example.com', user_id: 'user-123' }],
        error: null,
      });

      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
      });

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
      chainMock.select.mockResolvedValue({
        data: [{ url: 'https://example.com', user_id: 'user-123' }],
        error: null,
      });

      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
      });

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
      chainMock.select.mockResolvedValue({
        data: null,
        error: { message: 'Upsert failed' },
      });

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
      chainMock.select.mockResolvedValue({
        data: [],
        error: null,
      });

      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
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
      // Mock auth to fail
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
      // Create a proper chain mock for delete operations
      // The chain is: from().delete().eq('user_id').eq('url')
      // Each .eq() call returns an object with another .eq() method
      const finalResult = Promise.resolve({ error: null });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

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
      // Create a proper chain mock for delete operations
      const finalResult = Promise.resolve({ error: null });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

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
      // Create a proper chain mock for delete operations
      const finalResult = Promise.resolve({ error: null });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { id: 'bookmark-123', url: 'https://example.com' },
      });

      const response = await DELETE(request);

      expect(response.status).toBe(200);
    });

    it('should return 500 when delete fails', async () => {
      // Create a proper chain mock for delete operations that fails
      const finalResult = Promise.resolve({ error: { message: 'Delete failed' } });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

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
    chainMock = createChainMock();
    mockSupabase.from = vi.fn(() => chainMock);
  });

  it('should handle bookmarks with special characters in URL', async () => {
    const bookmarksToSync = [
      { url: 'https://example.com/path?query=value&foo=bar#section', title: 'Special URL' },
    ];

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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
