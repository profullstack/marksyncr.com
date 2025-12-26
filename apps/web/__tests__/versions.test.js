/**
 * Tests for Version History API endpoints
 * @module __tests__/versions.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase responses
const mockRpc = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

// Chain for select queries
const mockSelectChain = {
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
};

const mockSupabase = {
  rpc: mockRpc,
  from: mockFrom,
};

// Mock user for authenticated requests
const mockUser = { id: 'user-123', email: 'test@example.com' };

// Mock @/lib/auth-helper
vi.mock('@/lib/auth-helper', () => ({
  corsHeaders: vi.fn((request, methods) => ({
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': methods?.join(', ') || 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getAuthenticatedUser: vi.fn(),
}));

// Import after mocks
const { GET, POST, OPTIONS } = await import('../app/api/versions/route.js');
const { getAuthenticatedUser } = await import('@/lib/auth-helper');

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
    
    // Set up the from().select() chain for POST deduplication check
    // Default: no existing versions (so new version will be created)
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OPTIONS', () => {
    it('should return CORS headers', async () => {
      const request = createMockRequest({
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      });
      
      const response = await OPTIONS(request);
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  describe('GET /api/versions', () => {
    it('should return 401 if no auth (no header and no session)', async () => {
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

    it('should return 401 if authorization header is invalid format and no session', async () => {
      // Mock auth to fail
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'InvalidToken' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 401 if token is invalid and no session', async () => {
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

    it('should return version history for authenticated user', async () => {
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

      mockRpc
        .mockResolvedValueOnce({ data: mockVersions, error: null })
        .mockResolvedValueOnce({ data: 10, error: null });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: 5, error: null });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: 5, error: null });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      mockRpc.mockResolvedValue({
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
      expect(data.error).toBe('Failed to get version history');
    });

    it('should return default retention limit if not found', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      mockRpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: 5, error: null });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
    it('should return 401 if no auth (no header and no session)', async () => {
      // Mock auth to fail
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'POST',
        headers: {},
        body: {},
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 401 if token is invalid and no session', async () => {
      // Mock auth to fail
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer invalid-token' },
        body: {},
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 if bookmarkData is missing', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      const mockVersion = {
        id: 'v1',
        version: 1,
        checksum: 'computed-checksum',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockRpc.mockResolvedValue({
        data: mockVersion,
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
        checksum: 'computed-checksum',
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should call save_bookmark_version with correct parameters', async () => {
      mockRpc.mockResolvedValue({
        data: { id: 'v1', version: 1, checksum: 'abc', created_at: '2024-01-01' },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

      // Checksum is now computed using generateNormalizedChecksum, not mocked
      expect(mockRpc).toHaveBeenCalledWith('save_bookmark_version', {
        p_user_id: 'user-123',
        p_bookmark_data: bookmarkData,
        p_checksum: expect.any(String), // Checksum is computed, not mocked
        p_source_type: 'firefox',
        p_source_name: 'Firefox Browser',
        p_device_id: 'device-456',
        p_device_name: 'My Desktop',
        p_change_summary: { added: 10, removed: 0 },
      });
    });

    it('should use null for optional fields if not provided', async () => {
      mockRpc.mockResolvedValue({
        data: { id: 'v1', version: 1, checksum: 'abc', created_at: '2024-01-01' },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

      // Checksum is now computed using generateNormalizedChecksum, not mocked
      expect(mockRpc).toHaveBeenCalledWith('save_bookmark_version', {
        p_user_id: 'user-123',
        p_bookmark_data: bookmarkData,
        p_checksum: expect.any(String), // Checksum is computed, not mocked
        p_source_type: 'chrome',
        p_source_name: null,
        p_device_id: null,
        p_device_name: null,
        p_change_summary: {},
      });
    });

    it('should return 500 if database save fails', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      mockRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

    it('should skip creating new version if checksum matches latest version (deduplication)', async () => {
      // The checksum for { roots: {} } is computed by generateNormalizedChecksum
      // We need to mock the from().select() chain to return a version with matching checksum
      const existingChecksum = '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
      
      // Mock the deduplication check to return an existing version with matching checksum
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{
                id: 'existing-v1',
                version: 5,
                checksum: existingChecksum,
                created_at: '2024-01-01T00:00:00Z',
              }],
              error: null,
            }),
          }),
        }),
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          bookmarkData: { roots: {} }, // This produces the same checksum
          sourceType: 'chrome',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.skipped).toBe(true);
      expect(data.message).toBe('No changes detected - version already exists');
      expect(data.version).toEqual({
        id: 'existing-v1',
        version: 5,
        checksum: existingChecksum,
        createdAt: '2024-01-01T00:00:00Z',
      });
      
      // Should NOT call save_bookmark_version when skipping
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('should create new version if checksum differs from latest version', async () => {
      // Mock the deduplication check to return an existing version with DIFFERENT checksum
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{
                id: 'existing-v1',
                version: 5,
                checksum: 'different-checksum-xyz',
                created_at: '2024-01-01T00:00:00Z',
              }],
              error: null,
            }),
          }),
        }),
      });

      const newVersion = {
        id: 'new-v2',
        version: 6,
        checksum: 'new-checksum',
        created_at: '2024-01-02T00:00:00Z',
      };

      mockRpc.mockResolvedValue({
        data: newVersion,
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      expect(data.skipped).toBeUndefined();
      expect(data.version).toEqual({
        id: 'new-v2',
        version: 6,
        checksum: 'new-checksum',
        createdAt: '2024-01-02T00:00:00Z',
      });
      
      // Should call save_bookmark_version when checksums differ
      expect(mockRpc).toHaveBeenCalledWith('save_bookmark_version', expect.any(Object));
    });
  });
});
