/**
 * @fileoverview Tests for disconnect API routes
 * Tests DELETE /api/connect/github/disconnect, /api/connect/dropbox/disconnect,
 * /api/connect/google-drive/disconnect endpoints
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase methods
const mockGetUser = vi.fn();
let mockDbResult = { error: null };

// Create a chainable mock for Supabase query builder
// The chain is: from().delete().eq().eq() - the last eq() returns a thenable
const createChainableMock = () => {
  let eqCallCount = 0;
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn(() => {
      eqCallCount++;
      // On the second .eq() call, return a thenable (Promise-like)
      if (eqCallCount >= 2) {
        return {
          then: (resolve) => resolve(mockDbResult),
          catch: () => {},
        };
      }
      // First .eq() returns the chain for further chaining
      return chain;
    }),
  };
  return chain;
};

const mockFrom = vi.fn(() => createChainableMock());

// Mock @/lib/supabase/server
vi.mock('../lib/supabase/server', () => ({
  getUser: () => mockGetUser(),
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    })
  ),
}));

// Import after mocks
const { DELETE: githubDELETE } = await import(
  '../app/api/connect/github/disconnect/route.js'
);
const { DELETE: dropboxDELETE } = await import(
  '../app/api/connect/dropbox/disconnect/route.js'
);
const { DELETE: googleDriveDELETE } = await import(
  '../app/api/connect/google-drive/disconnect/route.js'
);

describe('Disconnect API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock result to success
    mockDbResult = { error: null };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DELETE /api/connect/github/disconnect', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue(null);

      const response = await githubDELETE();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should successfully disconnect GitHub for authenticated user', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: null };

      const response = await githubDELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('GitHub disconnected');
      expect(mockFrom).toHaveBeenCalledWith('sync_sources');
    });

    it('should return 500 when database error occurs', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: { message: 'Database error' } };

      const response = await githubDELETE();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to disconnect GitHub');
    });

    it('should delete the correct provider record', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: null };

      await githubDELETE();

      // Verify the chain was called correctly
      expect(mockFrom).toHaveBeenCalledWith('sync_sources');
    });
  });

  describe('DELETE /api/connect/dropbox/disconnect', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue(null);

      const response = await dropboxDELETE();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should successfully disconnect Dropbox for authenticated user', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: null };

      const response = await dropboxDELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Dropbox disconnected');
    });

    it('should return 500 when database error occurs', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: { message: 'Database error' } };

      const response = await dropboxDELETE();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to disconnect Dropbox');
    });
  });

  describe('DELETE /api/connect/google-drive/disconnect', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue(null);

      const response = await googleDriveDELETE();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should successfully disconnect Google Drive for authenticated user', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: null };

      const response = await googleDriveDELETE();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Google Drive disconnected');
    });

    it('should return 500 when database error occurs', async () => {
      mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
      mockDbResult = { error: { message: 'Database error' } };

      const response = await googleDriveDELETE();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to disconnect Google Drive');
    });
  });
});

describe('Disconnect API Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = { error: null };
  });

  it('should handle user with no existing connection gracefully', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
    // No error even if no rows deleted
    mockDbResult = { error: null, count: 0 };

    const response = await githubDELETE();
    const data = await response.json();

    // Should still return success even if no rows were deleted
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should handle concurrent disconnect requests', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@example.com' });
    mockDbResult = { error: null };

    // Simulate concurrent requests
    const [response1, response2] = await Promise.all([githubDELETE(), githubDELETE()]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });
});
