/**
 * @fileoverview Tests for subscription API route
 * Tests GET /api/subscription endpoint
 * Uses Vitest with mocked auth helper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Chain mock setup
const createChainMock = () => ({
  select: vi.fn().mockReturnThis(),
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
    'Access-Control-Allow-Methods': methods?.join(', ') || 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getAuthenticatedUser: vi.fn(),
}));

// Import after mocks
const { GET } = await import('../app/api/subscription/route.js');
const { getAuthenticatedUser } = await import('@/lib/auth-helper');

/**
 * Helper to create a mock request
 */
function createMockRequest(options = {}) {
  const { headers = {} } = options;

  return {
    method: 'GET',
    headers: {
      get: (name) => headers[name] || null,
    },
  };
}

describe('Subscription API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainMock = createChainMock();
    mockSupabase.from = vi.fn(() => chainMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/subscription', () => {
    it('should return 401 when no session cookie (not authenticated)', async () => {
      // Mock auth to fail
      getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

      const request = createMockRequest({
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
        headers: {},
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should return free tier for user with no subscription', async () => {
      // PGRST116 = no rows returned
      chainMock.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.tier).toBe('free');
      expect(data.subscription.status).toBe('active');
      expect(data.subscription.isActive).toBe(true);
      expect(data.subscription.isPro).toBe(false);
    });

    it('should return pro subscription for active pro user', async () => {
      chainMock.single.mockResolvedValue({
        data: {
          tier: 'pro',
          status: 'active',
          current_period_end: '2024-12-31T23:59:59Z',
          cancel_at_period_end: false,
        },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.tier).toBe('pro');
      expect(data.subscription.status).toBe('active');
      expect(data.subscription.isActive).toBe(true);
      expect(data.subscription.isPro).toBe(true);
      expect(data.subscription.currentPeriodEnd).toBe('2024-12-31T23:59:59Z');
      expect(data.subscription.cancelAtPeriodEnd).toBe(false);
    });

    it('should return inactive pro subscription when canceled', async () => {
      chainMock.single.mockResolvedValue({
        data: {
          tier: 'pro',
          status: 'canceled',
          current_period_end: '2024-01-15T23:59:59Z',
          cancel_at_period_end: true,
        },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.tier).toBe('pro');
      expect(data.subscription.status).toBe('canceled');
      expect(data.subscription.isActive).toBe(false);
      expect(data.subscription.isPro).toBe(false);
      expect(data.subscription.cancelAtPeriodEnd).toBe(true);
    });

    it('should return inactive when subscription is past_due', async () => {
      chainMock.single.mockResolvedValue({
        data: {
          tier: 'pro',
          status: 'past_due',
          current_period_end: '2024-01-01T23:59:59Z',
          cancel_at_period_end: false,
        },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.tier).toBe('pro');
      expect(data.subscription.status).toBe('past_due');
      expect(data.subscription.isActive).toBe(false);
      expect(data.subscription.isPro).toBe(false);
    });

    it('should handle team tier subscription', async () => {
      chainMock.single.mockResolvedValue({
        data: {
          tier: 'team',
          status: 'active',
          current_period_end: '2024-12-31T23:59:59Z',
          cancel_at_period_end: false,
        },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.tier).toBe('team');
      expect(data.subscription.isActive).toBe(true);
      // Team tier is not "pro" tier specifically
      expect(data.subscription.isPro).toBe(false);
    });

    it('should handle null subscription fields gracefully', async () => {
      chainMock.single.mockResolvedValue({
        data: {
          tier: 'pro',
          status: 'active',
          current_period_end: null,
          cancel_at_period_end: null,
        },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.subscription.currentPeriodEnd).toBeNull();
      expect(data.subscription.cancelAtPeriodEnd).toBe(false);
    });
  });
});

describe('Subscription Tier Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainMock = createChainMock();
    mockSupabase.from = vi.fn(() => chainMock);
  });

  it('should correctly identify free tier as active', async () => {
    chainMock.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });

    const response = await GET(request);
    const data = await response.json();

    // Free tier is always active
    expect(data.subscription.isActive).toBe(true);
    expect(data.subscription.isPro).toBe(false);
  });

  it('should correctly identify pro tier with active status', async () => {
    chainMock.single.mockResolvedValue({
      data: {
        tier: 'pro',
        status: 'active',
      },
      error: null,
    });

    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(data.subscription.isActive).toBe(true);
    expect(data.subscription.isPro).toBe(true);
  });

  it('should not grant pro access when status is not active', async () => {
    const inactiveStatuses = ['canceled', 'past_due', 'unpaid', 'incomplete'];

    for (const status of inactiveStatuses) {
      chainMock.single.mockResolvedValue({
        data: {
          tier: 'pro',
          status,
        },
        error: null,
      });

      getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

      const request = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(data.subscription.isPro).toBe(false);
    }
  });
});

describe('Subscription API Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainMock = createChainMock();
    mockSupabase.from = vi.fn(() => chainMock);
  });

  it('should handle database errors gracefully', async () => {
    // Non-PGRST116 error (actual database error)
    chainMock.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST500', message: 'Database connection failed' },
    });

    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: mockSupabase });

    const request = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });

    const response = await GET(request);
    const data = await response.json();

    // Should still return a valid response with free tier defaults
    expect(response.status).toBe(200);
    expect(data.subscription.tier).toBe('free');
  });

  it('should handle expired session', async () => {
    // Mock auth to fail
    getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });

    const request = createMockRequest({
      headers: {},
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });
});
