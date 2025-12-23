/**
 * @fileoverview Tests for devices API routes
 * Tests GET /api/devices, POST /api/devices, DELETE /api/devices endpoints
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create chainable mock
const createChainableMock = () => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return chain;
};

let mockChain = createChainableMock();

// Helper to create auth result with supabase client
const createAuthResult = (userId) => ({
  user: { id: userId },
  supabase: { from: vi.fn(() => mockChain) }
});

// Mock @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(() => mockChain),
    })
  ),
}));

// Mock @/lib/auth-helper
const mockGetAuthenticatedUser = vi.fn();
vi.mock('@/lib/auth-helper', () => ({
  getAuthenticatedUser: (...args) => mockGetAuthenticatedUser(...args),
}));

// Import after mocks
const { GET, POST, DELETE } = await import('../app/api/devices/route.js');

/**
 * Helper to create a mock request
 */
function createMockRequest(options = {}) {
  const { method = 'GET', body = null, headers = {}, url = 'http://localhost/api/devices' } = options;
  
  return {
    method,
    url,
    headers: {
      get: (name) => headers[name.toLowerCase()] || null,
    },
    json: async () => body,
  };
}

describe('Devices API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain = createChainableMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/devices', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(null);

      const request = createMockRequest({ method: 'GET' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return empty array when user has no devices', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      mockChain.order.mockReturnValue(Promise.resolve({
        data: [],
        error: null,
      }));

      const request = createMockRequest({ method: 'GET' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toEqual([]);
    });

    it('should return list of devices for authenticated user', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      const mockDevices = [
        {
          id: 'device-1',
          user_id: 'user-123',
          device_id: 'chrome-123',
          name: 'Chrome on Linux',
          browser: 'chrome',
          os: 'Linux',
          last_seen_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'device-2',
          user_id: 'user-123',
          device_id: 'firefox-456',
          name: 'Firefox on Linux',
          browser: 'firefox',
          os: 'Linux',
          last_seen_at: '2024-01-02T00:00:00Z',
        },
      ];

      mockChain.order.mockReturnValue(Promise.resolve({
        data: mockDevices,
        error: null,
      }));

      const request = createMockRequest({ method: 'GET' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.devices).toHaveLength(2);
      expect(data.devices[0].name).toBe('Chrome on Linux');
      expect(data.devices[1].name).toBe('Firefox on Linux');
    });

    it('should return 500 when database error occurs', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      mockChain.order.mockReturnValue(Promise.resolve({
        data: null,
        error: { message: 'Database connection failed' },
      }));

      const request = createMockRequest({ method: 'GET' });
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch devices');
    });
  });

  describe('POST /api/devices', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(null);

      const request = createMockRequest({
        method: 'POST',
        body: { deviceId: 'chrome-123', name: 'Chrome', browser: 'chrome', os: 'Linux' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when deviceId is missing', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));

      const request = createMockRequest({
        method: 'POST',
        body: { name: 'Chrome', browser: 'chrome', os: 'Linux' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('deviceId is required');
    });

    it('should register a new device successfully', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      const mockDevice = {
        id: 'device-1',
        user_id: 'user-123',
        device_id: 'chrome-123',
        name: 'Chrome on Linux',
        browser: 'chrome',
        os: 'Linux',
        last_seen_at: '2024-01-01T00:00:00Z',
      };

      mockChain.single.mockReturnValue(Promise.resolve({
        data: mockDevice,
        error: null,
      }));

      const request = createMockRequest({
        method: 'POST',
        body: { deviceId: 'chrome-123', name: 'Chrome on Linux', browser: 'chrome', os: 'Linux' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.device).toEqual(mockDevice);
      expect(data.message).toBe('Device registered successfully');
    });

    it('should update existing device on upsert', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      const mockDevice = {
        id: 'device-1',
        user_id: 'user-123',
        device_id: 'chrome-123',
        name: 'Chrome on Linux',
        browser: 'chrome',
        os: 'Linux',
        last_seen_at: '2024-01-02T00:00:00Z', // Updated timestamp
      };

      mockChain.single.mockReturnValue(Promise.resolve({
        data: mockDevice,
        error: null,
      }));

      const request = createMockRequest({
        method: 'POST',
        body: { deviceId: 'chrome-123', name: 'Chrome on Linux', browser: 'chrome', os: 'Linux' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.device.last_seen_at).toBe('2024-01-02T00:00:00Z');
    });

    it('should use default name when name is not provided', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      const mockDevice = {
        id: 'device-1',
        user_id: 'user-123',
        device_id: 'chrome-123',
        name: 'chrome on Linux',
        browser: 'chrome',
        os: 'Linux',
        last_seen_at: '2024-01-01T00:00:00Z',
      };

      mockChain.single.mockReturnValue(Promise.resolve({
        data: mockDevice,
        error: null,
      }));

      const request = createMockRequest({
        method: 'POST',
        body: { deviceId: 'chrome-123', browser: 'chrome', os: 'Linux' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.device).toBeDefined();
    });

    it('should use Unknown for missing browser and os', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      const mockDevice = {
        id: 'device-1',
        user_id: 'user-123',
        device_id: 'unknown-123',
        name: 'Unknown on Unknown',
        browser: 'Unknown',
        os: 'Unknown',
        last_seen_at: '2024-01-01T00:00:00Z',
      };

      mockChain.single.mockReturnValue(Promise.resolve({
        data: mockDevice,
        error: null,
      }));

      const request = createMockRequest({
        method: 'POST',
        body: { deviceId: 'unknown-123' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
    });

    it('should return 500 when database error occurs', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      mockChain.single.mockReturnValue(Promise.resolve({
        data: null,
        error: { message: 'Unique constraint violation' },
      }));

      const request = createMockRequest({
        method: 'POST',
        body: { deviceId: 'chrome-123', browser: 'chrome', os: 'Linux' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to register device');
    });
  });

  describe('DELETE /api/devices', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(null);

      const request = createMockRequest({
        method: 'DELETE',
        url: 'http://localhost/api/devices?deviceId=chrome-123',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when deviceId is missing', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));

      const request = createMockRequest({
        method: 'DELETE',
        url: 'http://localhost/api/devices',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('deviceId is required');
    });

    it('should delete device successfully', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      // Mock the delete chain with double eq() call
      const secondEq = vi.fn().mockReturnValue(Promise.resolve({ error: null }));
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      mockChain.delete.mockReturnValue({ eq: firstEq });

      const request = createMockRequest({
        method: 'DELETE',
        url: 'http://localhost/api/devices?deviceId=chrome-123',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Device deleted successfully');
    });

    it('should return 500 when database error occurs', async () => {
      mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
      
      // Mock the delete chain with error
      const secondEq = vi.fn().mockReturnValue(Promise.resolve({ error: { message: 'Delete failed' } }));
      const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
      mockChain.delete.mockReturnValue({ eq: firstEq });

      const request = createMockRequest({
        method: 'DELETE',
        url: 'http://localhost/api/devices?deviceId=chrome-123',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete device');
    });
  });
});

describe('Devices API Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain = createChainableMock();
  });

  it('should handle empty deviceId string', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));

    const request = createMockRequest({
      method: 'POST',
      body: { deviceId: '', browser: 'chrome', os: 'Linux' },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('deviceId is required');
  });

  it('should handle special characters in device name', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
    
    const mockDevice = {
      id: 'device-1',
      user_id: 'user-123',
      device_id: 'chrome-123',
      name: 'Chrome <script>alert("xss")</script>',
      browser: 'chrome',
      os: 'Linux',
      last_seen_at: '2024-01-01T00:00:00Z',
    };

    mockChain.single.mockReturnValue(Promise.resolve({
      data: mockDevice,
      error: null,
    }));

    const request = createMockRequest({
      method: 'POST',
      body: { deviceId: 'chrome-123', name: 'Chrome <script>alert("xss")</script>', browser: 'chrome', os: 'Linux' },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should handle very long device names', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
    
    const longName = 'A'.repeat(500);
    const mockDevice = {
      id: 'device-1',
      user_id: 'user-123',
      device_id: 'chrome-123',
      name: longName,
      browser: 'chrome',
      os: 'Linux',
      last_seen_at: '2024-01-01T00:00:00Z',
    };

    mockChain.single.mockReturnValue(Promise.resolve({
      data: mockDevice,
      error: null,
    }));

    const request = createMockRequest({
      method: 'POST',
      body: { deviceId: 'chrome-123', name: longName, browser: 'chrome', os: 'Linux' },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
  });

  it('should handle unicode characters in device info', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
    
    const mockDevice = {
      id: 'device-1',
      user_id: 'user-123',
      device_id: 'chrome-123',
      name: 'Chrome 🦊 on Linux 🐧',
      browser: 'chrome',
      os: 'Linux',
      last_seen_at: '2024-01-01T00:00:00Z',
    };

    mockChain.single.mockReturnValue(Promise.resolve({
      data: mockDevice,
      error: null,
    }));

    const request = createMockRequest({
      method: 'POST',
      body: { deviceId: 'chrome-123', name: 'Chrome 🦊 on Linux 🐧', browser: 'chrome', os: 'Linux' },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.device.name).toBe('Chrome 🦊 on Linux 🐧');
  });

  it('should handle multiple devices for same user', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
    
    const mockDevices = [
      { id: 'device-1', device_id: 'chrome-1', name: 'Chrome 1', browser: 'chrome', os: 'Windows' },
      { id: 'device-2', device_id: 'chrome-2', name: 'Chrome 2', browser: 'chrome', os: 'macOS' },
      { id: 'device-3', device_id: 'firefox-1', name: 'Firefox 1', browser: 'firefox', os: 'Linux' },
      { id: 'device-4', device_id: 'safari-1', name: 'Safari 1', browser: 'safari', os: 'macOS' },
    ];

    mockChain.order.mockReturnValue(Promise.resolve({
      data: mockDevices,
      error: null,
    }));

    const request = createMockRequest({ method: 'GET' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.devices).toHaveLength(4);
  });
});

describe('Devices API Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain = createChainableMock();
  });

  it('should not expose internal error details', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
    
    mockChain.order.mockRejectedValue(new Error('Internal database connection string exposed'));

    const request = createMockRequest({ method: 'GET' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
    expect(data.error).not.toContain('database');
    expect(data.error).not.toContain('connection');
  });

  it('should handle null body gracefully in POST', async () => {
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));

    const request = {
      method: 'POST',
      url: 'http://localhost/api/devices',
      headers: { get: () => null },
      json: async () => null,
    };

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
  });

  it('should only return devices for authenticated user', async () => {
    // First user
    mockGetAuthenticatedUser.mockResolvedValue(createAuthResult('user-123'));
    
    const user1Devices = [
      { id: 'device-1', user_id: 'user-123', device_id: 'chrome-1', name: 'User 1 Chrome' },
    ];

    mockChain.order.mockReturnValue(Promise.resolve({
      data: user1Devices,
      error: null,
    }));

    const request = createMockRequest({ method: 'GET' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].user_id).toBe('user-123');
  });
});
