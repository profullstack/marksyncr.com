/**
 * Tests for Version History API endpoints
 * @module __tests__/versions.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase responses
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

// Mock @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      rpc: mockRpc,
    })
  ),
}));

// Mock @marksyncr/core
vi.mock('@marksyncr/core', () => ({
  computeChecksum: vi.fn(() => 'mock-checksum-abc123'),
}));

// Import after mocks
const { GET, POST, OPTIONS } = await import('../app/api/versions/route.js');

/**
 * Helper to create a mock request
 */
function createMockRequest(options = {}) {
  const { method = 'GET', body = null, headers = {}, url = 'http://localhost:3000/api/versions' } = options;
  
  return {
    method,
    url,
    headers: {
      get: (name) => headers[name] || null,
    },
    json: async () => body,
  };
}

describe('Versions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OPTIONS', () => {
    it('should return CORS headers', async () => {
      const response = await OPTIONS();
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });
  });

  describe('GET /api/versions', () => {
    it('should return 401 if no authorization header', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: {},
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 401 if authorization header is invalid format', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'InvalidToken' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 401 if token is invalid', async () => {
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

    it('should return version history for authenticated user', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockVersions = [
        {
          id: 'v1',
          version: 1,
          checksum: 'abc123',
          source_type: 'chrome',
          source_name: 'Chrome Browser',
          device_name: 'My Laptop',
          change_summary: { added: 5, removed: 2 },
          created_at: '2024-01-01T00:00:00Z',
          bookmark_count: 100,
          folder_count: 10,
        },
        {
          id: 'v2',
          version: 2,
          checksum: 'def456',
          source_type: 'firefox',
          source_name: 'Firefox Browser',
          device_name: 'My Desktop',
          change_summary: { added: 3, removed: 0 },
          created_at: '2024-01-02T00:00:00Z',
          bookmark_count: 103,
          folder_count: 11,
        },
      ];

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc
        .mockResolvedValueOnce({ data: mockVersions, error: null })
        .mockResolvedValueOnce({ data: 10, error: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
        url: 'http://localhost:3000/api/versions?limit=20&offset=0',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.versions).toHaveLength(2);
      expect(data.versions[0]).toEqual({
        id: 'v1',
        version: 1,
        checksum: 'abc123',
        sourceType: 'chrome',
        sourceName: 'Chrome Browser',
        deviceName: 'My Laptop',
        changeSummary: { added: 5, removed: 2 },
        createdAt: '2024-01-01T00:00:00Z',
        bookmarkCount: 100,
        folderCount: 10,
      });
      expect(data.retentionLimit).toBe(10);
    });

    it('should use default limit and offset', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: 5, error: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      await GET(request);

      expect(mockRpc).toHaveBeenCalledWith('get_version_history', {
        p_user_id: 'user-123',
        p_limit: 20,
        p_offset: 0,
      });
    });

    it('should use custom limit and offset from query params', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: 5, error: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
        url: 'http://localhost:3000/api/versions?limit=50&offset=10',
      });

      await GET(request);

      expect(mockRpc).toHaveBeenCalledWith('get_version_history', {
        p_user_id: 'user-123',
        p_limit: 50,
        p_offset: 10,
      });
    });

    it('should return 500 if database query fails', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc.mockResolvedValue({
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
      expect(data.error).toBe('Failed to get version history');
    });

    it('should return default retention limit if not found', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.retentionLimit).toBe(5);
    });

    it('should handle empty version history', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: 5, error: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.versions).toEqual([]);
    });
  });

  describe('POST /api/versions', () => {
    it('should return 401 if no authorization header', async () => {
      const request = createMockRequest({
        method: 'POST',
        headers: {},
        body: {},
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 401 if token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer invalid-token' },
        body: {},
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid or expired token');
    });

    it('should return 400 if bookmarkData is missing', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { sourceType: 'chrome' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields: bookmarkData, sourceType');
    });

    it('should return 400 if sourceType is missing', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { bookmarkData: { roots: {} } },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields: bookmarkData, sourceType');
    });

    it('should save version successfully', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockVersion = {
        id: 'v1',
        version: 1,
        checksum: 'mock-checksum-abc123',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc.mockResolvedValue({
        data: mockVersion,
        error: null,
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          bookmarkData: { roots: { toolbar: [], menu: [], other: [] } },
          sourceType: 'chrome',
          sourceName: 'Chrome Browser',
          deviceId: 'device-123',
          deviceName: 'My Laptop',
          changeSummary: { added: 5, removed: 2 },
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.version).toEqual({
        id: 'v1',
        version: 1,
        checksum: 'mock-checksum-abc123',
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should call save_bookmark_version with correct parameters', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc.mockResolvedValue({
        data: { id: 'v1', version: 1, checksum: 'abc', created_at: '2024-01-01' },
        error: null,
      });

      const bookmarkData = { roots: { toolbar: [], menu: [], other: [] } };
      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          bookmarkData,
          sourceType: 'firefox',
          sourceName: 'Firefox Browser',
          deviceId: 'device-456',
          deviceName: 'My Desktop',
          changeSummary: { added: 10, removed: 0 },
        },
      });

      await POST(request);

      expect(mockRpc).toHaveBeenCalledWith('save_bookmark_version', {
        p_user_id: 'user-123',
        p_bookmark_data: bookmarkData,
        p_checksum: 'mock-checksum-abc123',
        p_source_type: 'firefox',
        p_source_name: 'Firefox Browser',
        p_device_id: 'device-456',
        p_device_name: 'My Desktop',
        p_change_summary: { added: 10, removed: 0 },
      });
    });

    it('should use null for optional fields if not provided', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc.mockResolvedValue({
        data: { id: 'v1', version: 1, checksum: 'abc', created_at: '2024-01-01' },
        error: null,
      });

      const bookmarkData = { roots: {} };
      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          bookmarkData,
          sourceType: 'chrome',
        },
      });

      await POST(request);

      expect(mockRpc).toHaveBeenCalledWith('save_bookmark_version', {
        p_user_id: 'user-123',
        p_bookmark_data: bookmarkData,
        p_checksum: 'mock-checksum-abc123',
        p_source_type: 'chrome',
        p_source_name: null,
        p_device_id: null,
        p_device_name: null,
        p_change_summary: {},
      });
    });

    it('should return 500 if database save fails', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          bookmarkData: { roots: {} },
          sourceType: 'chrome',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to save version');
    });

    it('should handle null response data gracefully', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          bookmarkData: { roots: {} },
          sourceType: 'chrome',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.version).toEqual({
        id: undefined,
        version: undefined,
        checksum: undefined,
        createdAt: undefined,
      });
    });
  });
});
