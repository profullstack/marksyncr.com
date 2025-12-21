/**
 * @fileoverview Tests for settings API routes
 * Tests GET, PUT /api/settings endpoints
 * Uses Vitest with mocked auth helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Chain mock setup
const createChainMock = () => ({
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
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
    'Access-Control-Allow-Methods': methods?.join(', ') || 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getAuthenticatedUser: vi.fn(),
}));

// Import after mocks
const { GET, PUT } = await import('../app/api/settings/route.js');
const { getAuthenticatedUser } = await import('@/lib/auth-helper');

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
    mockSupabase.from = vi.fn(() => chainMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/settings', () => {
    it('should return 401 when no session cookie (not authenticated)', async () => {
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

    it('should return 401 when session is invalid', async () => {
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

      chainMock.single.mockResolvedValue({
        data: { settings: mockSettings },
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
      expect(data.settings).toEqual(mockSettings);
    });

    it('should return default settings when user has no saved settings', async () => {
      // PGRST116 = no rows returned
      chainMock.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      chainMock.single.mockResolvedValue({
        data: { settings: null },
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
      expect(data.settings.syncEnabled).toBe(true);
      expect(data.settings.syncInterval).toBe('hourly');
    });
  });

  describe('PUT /api/settings', () => {
    it('should return 401 when no session cookie (not authenticated)', async () => {
      // Mock auth to fail
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
        method: 'PUT',
        headers: {},
        body: { settings: {} },
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return 400 when settings is missing', async () => {
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      chainMock.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
    mockSupabase.from = vi.fn(() => chainMock);
  });

  it('should accept valid syncInterval values', async () => {
    const validIntervals = ['manual', 'hourly', 'daily', 'weekly'];

    for (const interval of validIntervals) {
      chainMock.single.mockResolvedValue({
        data: { settings: { syncInterval: interval } },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      chainMock.single.mockResolvedValue({
        data: { settings: { conflictResolution: resolution } },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
      chainMock.single.mockResolvedValue({
        data: { settings: { theme } },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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

    chainMock.single.mockResolvedValue({
      data: { settings: booleanSettings },
      error: null,
    });

    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

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
