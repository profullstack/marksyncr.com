/**
 * @fileoverview Tests for bookmarks API routes
 * Tests GET, POST, DELETE /api/bookmarks endpoints
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Supabase responses
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

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

// Mock @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      from: vi.fn(() => chainMock),
    })
  ),
}));

// Import after mocks
const { GET, POST, DELETE } = await import('../app/api/bookmarks/route.js');

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/bookmarks', () => {
    it('should return 401 when no authorization header is provided', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: {},
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 401 when authorization header is invalid format', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'InvalidFormat token123' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 401 when token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid or expired token');
    });

    it('should return bookmarks for authenticated user', async () => {
      const mockBookmarks = [
        { id: '1', url: 'https://example.com', title: 'Example', user_id: 'user-123' },
        { id: '2', url: 'https://test.com', title: 'Test', user_id: 'user-123' },
      ];

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.order.mockResolvedValue({
        data: mockBookmarks,
        error: null,
      });

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.order.mockResolvedValue({
        data: [],
        error: null,
      });

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.order.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

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
    it('should return 401 when no authorization header is provided', async () => {
      const request = createMockRequest({
        method: 'POST',
        headers: {},
        body: { bookmarks: [] },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 400 when bookmarks is not an array', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

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

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.select.mockResolvedValue({
        data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
        error: null,
      });

      // Mock version history insert
      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
      });

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

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.select.mockResolvedValue({
        data: [{ url: 'https://example.com', user_id: 'user-123' }],
        error: null,
      });

      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
      });

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.select.mockResolvedValue({
        data: [{ url: 'https://example.com', user_id: 'user-123' }],
        error: null,
      });

      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarks: [{ url: 'https://example.com' }] },
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
    });

    it('should return 500 when upsert fails', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.select.mockResolvedValue({
        data: null,
        error: { message: 'Upsert failed' },
      });

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.select.mockResolvedValue({
        data: [],
        error: null,
      });

      chainMock.insert = vi.fn().mockResolvedValue({
        error: null,
      });

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
    it('should return 401 when no authorization header is provided', async () => {
      const request = createMockRequest({
        method: 'DELETE',
        headers: {},
        body: { url: 'https://example.com' },
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 400 when neither url nor id is provided', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Create a proper chain mock for delete operations
      // The chain is: from().delete().eq('user_id').eq('url')
      // Each .eq() call returns an object with another .eq() method
      const finalResult = Promise.resolve({ error: null });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Create a proper chain mock for delete operations
      const finalResult = Promise.resolve({ error: null });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

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
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Create a proper chain mock for delete operations
      const finalResult = Promise.resolve({ error: null });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

      const request = createMockRequest({
        method: 'DELETE',
        headers: { authorization: 'Bearer valid-token' },
        body: { id: 'bookmark-123', url: 'https://example.com' },
      });

      const response = await DELETE(request);

      expect(response.status).toBe(200);
    });

    it('should return 500 when delete fails', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Create a proper chain mock for delete operations that fails
      const finalResult = Promise.resolve({ error: { message: 'Delete failed' } });
      const secondEq = vi.fn().mockReturnValue(finalResult);
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq, then: finalResult.then.bind(finalResult) });
      const deleteMock = vi.fn().mockReturnValue({ eq: firstEq });
      chainMock.delete = deleteMock;

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
  });

  it('should handle bookmarks with special characters in URL', async () => {
    const bookmarksToSync = [
      { url: 'https://example.com/path?query=value&foo=bar#section', title: 'Special URL' },
    ];

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

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

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    chainMock.select.mockResolvedValue({
      data: bookmarksToSync.map((b) => ({ ...b, user_id: 'user-123' })),
      error: null,
    });

    chainMock.insert = vi.fn().mockResolvedValue({
      error: null,
    });

    const request = createMockRequest({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { bookmarks: bookmarksToSync },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});
