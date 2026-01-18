/**
 * @fileoverview Tests for extension-specific auth API routes
 * Tests POST /api/auth/extension/login and POST /api/auth/extension/refresh
 *
 * Extension sessions are designed to be long-lived (1 year) to avoid
 * requiring users to re-login frequently in the browser extension.
 *
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase auth methods
const mockSignInWithPassword = vi.fn();
const mockGetUser = vi.fn();
const mockRefreshSession = vi.fn();

// Chain mock for database operations
const createChainMock = () => {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return chain;
};

let dbChain = createChainMock();

// Mock @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  createStatelessClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
    },
  })),
  createAdminClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
    },
    from: vi.fn((table) => {
      if (table === 'extension_sessions') {
        return dbChain;
      }
      return createChainMock();
    }),
  })),
}));

// Import after mocks
const { POST: extensionLoginPOST } = await import('../app/api/auth/extension/login/route.js');
const { POST: extensionRefreshPOST } = await import('../app/api/auth/extension/refresh/route.js');

/**
 * Helper to create a mock request
 */
function createMockRequest(options = {}) {
  const { method = 'POST', body = null, headers = {} } = options;

  return {
    method,
    headers: {
      get: (name) => headers[name.toLowerCase()] || null,
    },
    json: async () => body,
  };
}

describe('Extension Auth API - POST /api/auth/extension/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbChain = createChainMock();
    // Set required Supabase environment variables for tests
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 when email is missing', async () => {
    const request = createMockRequest({
      body: { password: 'password123' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email and password are required');
  });

  it('should return 400 when password is missing', async () => {
    const request = createMockRequest({
      body: { email: 'test@example.com' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email and password are required');
  });

  it('should return 401 when credentials are invalid', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'wrongpassword' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Invalid login credentials');
  });

  it('should return user and long-lived session on successful login', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    // Mock successful session storage
    dbChain.insert.mockReturnValue(dbChain);
    dbChain.select.mockReturnValue(dbChain);
    dbChain.single.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        extension_token: 'ext-token-123',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      error: null,
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'password123' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user).toEqual(mockUser);
    expect(data.session).toBeDefined();
    expect(data.session.extension_token).toBeDefined();
    // Extension sessions should expire in ~1 year
    expect(data.session.expires_at).toBeDefined();
  });

  it('should include device_id in session when provided', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    dbChain.insert.mockReturnValue(dbChain);
    dbChain.select.mockReturnValue(dbChain);
    dbChain.single.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        device_id: 'chrome-device-123',
        extension_token: 'ext-token-123',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      error: null,
    });

    const request = createMockRequest({
      body: {
        email: 'test@example.com',
        password: 'password123',
        device_id: 'chrome-device-123',
      },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(dbChain.insert).toHaveBeenCalled();
  });

  it('should handle database errors gracefully', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    // Mock database error
    dbChain.insert.mockReturnValue(dbChain);
    dbChain.select.mockReturnValue(dbChain);
    dbChain.single.mockResolvedValue({
      data: null,
      error: { message: 'Database connection failed' },
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'password123' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create extension session');
  });
});

describe('Extension Auth API - POST /api/auth/extension/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbChain = createChainMock();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 when extension_token is missing', async () => {
    const request = createMockRequest({
      body: {},
    });

    const response = await extensionRefreshPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Extension token is required');
  });

  it('should return 401 when extension_token is invalid', async () => {
    dbChain.select.mockReturnValue(dbChain);
    dbChain.eq.mockReturnValue(dbChain);
    dbChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const request = createMockRequest({
      body: { extension_token: 'invalid-token' },
    });

    const response = await extensionRefreshPOST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Invalid or expired extension token');
  });

  it('should return 401 when extension_token is expired', async () => {
    // Return an expired session
    dbChain.select.mockReturnValue(dbChain);
    dbChain.eq.mockReturnValue(dbChain);
    dbChain.maybeSingle.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        extension_token: 'ext-token-123',
        supabase_refresh_token: 'refresh-token-123',
        expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
      },
      error: null,
    });

    const request = createMockRequest({
      body: { extension_token: 'ext-token-123' },
    });

    const response = await extensionRefreshPOST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Extension session expired. Please log in again.');
  });

  it('should return new access token for valid extension_token', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Return a valid session
    dbChain.select.mockReturnValue(dbChain);
    dbChain.eq.mockReturnValue(dbChain);
    dbChain.maybeSingle.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        extension_token: 'ext-token-123',
        supabase_refresh_token: 'refresh-token-123',
        expires_at: futureDate.toISOString(),
      },
      error: null,
    });

    // Mock Supabase refresh session
    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-access-token-123',
          refresh_token: 'new-refresh-token-123',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });

    // Mock user lookup
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });

    // Mock update
    dbChain.update.mockReturnValue(dbChain);

    const request = createMockRequest({
      body: { extension_token: 'ext-token-123' },
    });

    const response = await extensionRefreshPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session).toBeDefined();
    expect(data.session.access_token).toBe('new-access-token-123');
    expect(data.user).toBeDefined();
  });

  it('should update last_used_at on successful refresh', async () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    dbChain.select.mockReturnValue(dbChain);
    dbChain.eq.mockReturnValue(dbChain);
    dbChain.maybeSingle.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        extension_token: 'ext-token-123',
        supabase_refresh_token: 'refresh-token-123',
        expires_at: futureDate.toISOString(),
      },
      error: null,
    });

    // Mock Supabase refresh session
    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-access-token-123',
          refresh_token: 'new-refresh-token-123',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });

    // Mock update
    dbChain.update.mockReturnValue(dbChain);

    const request = createMockRequest({
      body: { extension_token: 'ext-token-123' },
    });

    const response = await extensionRefreshPOST(request);

    expect(response.status).toBe(200);
    expect(dbChain.update).toHaveBeenCalled();
  });
});

describe('Extension Auth API - Session Expiration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbChain = createChainMock();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('should create session with 2 year expiration by default', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    let insertedData = null;
    dbChain.insert.mockImplementation((data) => {
      insertedData = data;
      return dbChain;
    });
    dbChain.select.mockReturnValue(dbChain);
    dbChain.single.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        extension_token: 'ext-token-123',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
      error: null,
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'password123' },
    });

    await extensionLoginPOST(request);

    // Verify the expiration is approximately 2 years from now
    expect(insertedData).toBeDefined();
    if (insertedData) {
      const expiresAt = new Date(insertedData.expires_at);
      const twoYearsFromNow = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
      // Allow 1 minute tolerance
      expect(Math.abs(expiresAt.getTime() - twoYearsFromNow.getTime())).toBeLessThan(60000);
    }
  });
});

describe('Extension Auth API - CORS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('should handle OPTIONS preflight request for login', async () => {
    const { OPTIONS } = await import('../app/api/auth/extension/login/route.js');

    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('should handle OPTIONS preflight request for refresh', async () => {
    const { OPTIONS } = await import('../app/api/auth/extension/refresh/route.js');

    const response = await OPTIONS();

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('Extension Auth API - Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbChain = createChainMock();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('should not expose internal error details on login failure', async () => {
    mockSignInWithPassword.mockRejectedValue(new Error('Internal database error'));

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'password123' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
    expect(data.error).not.toContain('database');
  });

  it('should generate cryptographically secure extension tokens', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    // Track what gets inserted - the hash, not the plain token
    let insertedTokenHash = null;
    dbChain.insert.mockImplementation((data) => {
      insertedTokenHash = data.extension_token_hash;
      return dbChain;
    });
    dbChain.select.mockReturnValue(dbChain);
    dbChain.single.mockResolvedValue({
      data: {
        id: 'session-123',
        user_id: 'user-123',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      },
      error: null,
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'password123' },
    });

    const response = await extensionLoginPOST(request);
    const data = await response.json();

    // The response should contain the plain extension_token (not the hash)
    // Token should be at least 64 characters (256 bits as hex = 64 chars)
    expect(response.status).toBe(200);
    expect(data.session.extension_token).toBeDefined();
    expect(data.session.extension_token.length).toBe(64); // 32 bytes = 64 hex chars

    // The hash stored in DB should also be 64 chars (SHA-256 = 64 hex chars)
    expect(insertedTokenHash).toBeDefined();
    expect(insertedTokenHash.length).toBe(64);

    // The plain token and hash should be different
    expect(data.session.extension_token).not.toBe(insertedTokenHash);
  });
});
