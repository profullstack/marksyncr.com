/**
 * @fileoverview Tests for settings API routes
 * Tests GET, PUT /api/settings endpoints
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase responses
const mockGetUser = vi.fn();

// Chain mock setup
const createChainMock = () => ({
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
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
const { GET, PUT } = await import('../app/api/settings/route.js');

/**
 * Helper to create a mock request
 */
function createMockRequest(options = {}) {
  const { method = 'GET', body = null, headers = {} } = options;
  
  return {
    method,
    headers: {
      get: (name) => headers[name] || null,
    },
    json: async () => body,
  };
}

describe('Settings API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainMock = createChainMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/settings', () => {
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

    it('should return 401 when authorization header format is invalid', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Basic token123' },
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

    it('should return user settings when found', async () => {
      const mockSettings = {
        syncEnabled: true,
        syncInterval: 'daily',
        conflictResolution: 'manual',
        autoBackup: false,
        notifications: {
          syncComplete: true,
          syncErrors: true,
          duplicatesFound: true,
          brokenLinks: true,
        },
        theme: 'dark',
      };

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: { settings: mockSettings },
        error: null,
      });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings).toEqual(mockSettings);
    });

    it('should return default settings when user has no saved settings', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // PGRST116 = no rows returned
      chainMock.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings).toEqual({
        syncEnabled: true,
        syncInterval: 'hourly',
        conflictResolution: 'newest',
        autoBackup: true,
        notifications: {
          syncComplete: true,
          syncErrors: true,
          duplicatesFound: false,
          brokenLinks: false,
        },
        theme: 'system',
      });
    });

    it('should return default settings when settings field is null', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: { settings: null },
        error: null,
      });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.syncEnabled).toBe(true);
      expect(data.settings.syncInterval).toBe('hourly');
    });
  });

  describe('PUT /api/settings', () => {
    it('should return 401 when no authorization header is provided', async () => {
      const request = createMockRequest({
        method: 'PUT',
        headers: {},
        body: { settings: {} },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 400 when settings is missing', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Settings object is required');
    });

    it('should return 400 when settings is not an object', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: 'not-an-object' },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Settings object is required');
    });

    it('should save settings successfully', async () => {
      const newSettings = {
        syncEnabled: false,
        syncInterval: 'weekly',
        theme: 'dark',
      };

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: {
          settings: {
            ...newSettings,
            conflictResolution: 'newest',
            autoBackup: true,
            notifications: {
              syncComplete: true,
              syncErrors: true,
              duplicatesFound: false,
              brokenLinks: false,
            },
          },
        },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: newSettings },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.syncEnabled).toBe(false);
      expect(data.settings.syncInterval).toBe('weekly');
      expect(data.settings.theme).toBe('dark');
      expect(data.message).toBe('Settings saved successfully');
    });

    it('should merge partial settings with defaults', async () => {
      const partialSettings = {
        theme: 'light',
      };

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: {
          settings: {
            syncEnabled: true,
            syncInterval: 'hourly',
            conflictResolution: 'newest',
            autoBackup: true,
            notifications: {
              syncComplete: true,
              syncErrors: true,
              duplicatesFound: false,
              brokenLinks: false,
            },
            theme: 'light',
          },
        },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: partialSettings },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.theme).toBe('light');
      expect(data.settings.syncEnabled).toBe(true); // Default preserved
    });

    it('should merge nested notification settings', async () => {
      const settingsWithNotifications = {
        notifications: {
          duplicatesFound: true,
        },
      };

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: {
          settings: {
            syncEnabled: true,
            syncInterval: 'hourly',
            conflictResolution: 'newest',
            autoBackup: true,
            notifications: {
              syncComplete: true,
              syncErrors: true,
              duplicatesFound: true,
              brokenLinks: false,
            },
            theme: 'system',
          },
        },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: settingsWithNotifications },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.notifications.duplicatesFound).toBe(true);
      expect(data.settings.notifications.syncComplete).toBe(true); // Default preserved
    });

    it('should return 500 when upsert fails', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: { theme: 'dark' } },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to save settings');
    });
  });
});

describe('Settings API Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainMock = createChainMock();
  });

  it('should accept valid syncInterval values', async () => {
    const validIntervals = ['manual', 'hourly', 'daily', 'weekly'];

    for (const interval of validIntervals) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: { settings: { syncInterval: interval } },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: { syncInterval: interval } },
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    }
  });

  it('should accept valid conflictResolution values', async () => {
    const validResolutions = ['newest', 'oldest', 'manual'];

    for (const resolution of validResolutions) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: { settings: { conflictResolution: resolution } },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: { conflictResolution: resolution } },
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    }
  });

  it('should accept valid theme values', async () => {
    const validThemes = ['light', 'dark', 'system'];

    for (const theme of validThemes) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      chainMock.single.mockResolvedValue({
        data: { settings: { theme } },
        error: null,
      });

      const request = createMockRequest({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: { settings: { theme } },
      });

      const response = await PUT(request);

      expect(response.status).toBe(200);
    }
  });

  it('should handle boolean settings correctly', async () => {
    const booleanSettings = {
      syncEnabled: false,
      autoBackup: false,
    };

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    chainMock.single.mockResolvedValue({
      data: { settings: booleanSettings },
      error: null,
    });

    const request = createMockRequest({
      method: 'PUT',
      headers: { authorization: 'Bearer valid-token' },
      body: { settings: booleanSettings },
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.settings.syncEnabled).toBe(false);
    expect(data.settings.autoBackup).toBe(false);
  });
});
