/**
 * @fileoverview Tests for auth API routes
 * Tests POST /api/auth/login, /api/auth/signup, /api/auth/logout,
 * GET /api/auth/session, POST /api/auth/refresh endpoints
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase auth methods
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockGetUser = vi.fn();
const mockRefreshSession = vi.fn();

// Mock @/lib/supabase/server
vi.mock('@/lib/supabase/server', () => ({
  // Cookie-based client (for web app)
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        signUp: mockSignUp,
        signOut: mockSignOut,
        getUser: mockGetUser,
        refreshSession: mockRefreshSession,
      },
    })
  ),
  // Stateless client (for extension API calls)
  createStatelessClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
    },
  })),
}));

// Import after mocks
const { POST: loginPOST } = await import('../app/api/auth/login/route.js');
const { POST: signupPOST } = await import('../app/api/auth/signup/route.js');
const { POST: logoutPOST } = await import('../app/api/auth/logout/route.js');
const { GET: sessionGET } = await import('../app/api/auth/session/route.js');
const { POST: refreshPOST } = await import('../app/api/auth/refresh/route.js');

/**
 * Helper to create a mock request
 */
function createMockRequest(options = {}) {
  const { method = 'POST', body = null, headers = {} } = options;
  
  return {
    method,
    headers: {
      get: (name) => headers[name] || null,
    },
    json: async () => body,
  };
}

describe('Auth API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 when email is missing', async () => {
      const request = createMockRequest({
        body: { password: 'password123' },
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('should return 400 when both email and password are missing', async () => {
      const request = createMockRequest({
        body: {},
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('should return user and session on successful login', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      const mockSession = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_at: 1234567890,
      };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const request = createMockRequest({
        body: { email: 'test@example.com', password: 'password123' },
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toEqual(mockUser);
      expect(data.session.access_token).toBe('access-token-123');
      expect(data.session.refresh_token).toBe('refresh-token-123');
    });

    it('should return 401 when credentials are invalid', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const request = createMockRequest({
        body: { email: 'test@example.com', password: 'wrongpassword' },
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid login credentials');
    });

    it('should return 401 when user is not confirmed', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed' },
      });

      const request = createMockRequest({
        body: { email: 'test@example.com', password: 'password123' },
      });

      const response = await loginPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Email not confirmed');
    });

    it('should handle email with different cases', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' }, session: { access_token: 'token' } },
        error: null,
      });

      const request = createMockRequest({
        body: { email: 'TEST@EXAMPLE.COM', password: 'password123' },
      });

      const response = await loginPOST(request);

      expect(response.status).toBe(200);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
      });
    });
  });

  describe('POST /api/auth/signup', () => {
    it('should return 400 when email is missing', async () => {
      const request = createMockRequest({
        body: { password: 'password123' },
      });

      const response = await signupPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com' },
      });

      const response = await signupPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password are required');
    });

    it('should return 400 when password is too short', async () => {
      const request = createMockRequest({
        body: { email: 'test@example.com', password: '12345' },
      });

      const response = await signupPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Password must be at least 6 characters');
    });

    it('should return success message on successful signup', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
        error: null,
      });

      const request = createMockRequest({
        body: { email: 'test@example.com', password: 'password123' },
      });

      const response = await signupPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Please check your email to confirm your account');
      expect(data.user).toBeDefined();
    });

    it('should return 400 when email already exists', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [] } },
        error: null,
      });

      const request = createMockRequest({
        body: { email: 'existing@example.com', password: 'password123' },
      });

      const response = await signupPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('An account with this email already exists. Please sign in instead.');
    });

    it('should return 400 when supabase returns an error', async () => {
      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'Signup rate limit exceeded' },
      });

      const request = createMockRequest({
        body: { email: 'test@example.com', password: 'password123' },
      });

      const response = await signupPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Signup rate limit exceeded');
    });

    it('should use correct email redirect URL', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.marksyncr.com';
      
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
        error: null,
      });

      const request = createMockRequest({
        body: { email: 'test@example.com', password: 'password123' },
      });

      await signupPOST(request);

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: 'https://app.marksyncr.com/auth/callback',
        },
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should return success message on successful logout', async () => {
      mockSignOut.mockResolvedValue({
        error: null,
      });

      const request = createMockRequest({});

      const response = await logoutPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Logged out successfully');
    });

    it('should return 400 when logout fails', async () => {
      mockSignOut.mockResolvedValue({
        error: { message: 'Session not found' },
      });

      const request = createMockRequest({});

      const response = await logoutPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Session not found');
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return 401 when no authorization header is provided', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: {},
      });

      const response = await sessionGET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authorization header required');
    });

    it('should return 401 when authorization header format is invalid', async () => {
      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'InvalidFormat token' },
      });

      const response = await sessionGET(request);
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

      const response = await sessionGET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid or expired token');
    });

    it('should return user info for valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        created_at: '2024-01-01T00:00:00Z',
        email_confirmed_at: '2024-01-01T00:01:00Z',
      };

      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const request = createMockRequest({
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await sessionGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.id).toBe('user-123');
      expect(data.user.email).toBe('test@example.com');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 400 when refresh_token is missing', async () => {
      const request = createMockRequest({
        body: {},
      });

      const response = await refreshPOST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Refresh token is required');
    });

    it('should return new session on successful refresh', async () => {
      const mockSession = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_at: 1234567890,
      };

      mockRefreshSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const request = createMockRequest({
        body: { refresh_token: 'old-refresh-token' },
      });

      const response = await refreshPOST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.session.access_token).toBe('new-access-token');
      expect(data.session.refresh_token).toBe('new-refresh-token');
    });

    it('should return 401 when refresh token is invalid', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid refresh token' },
      });

      const request = createMockRequest({
        body: { refresh_token: 'invalid-refresh-token' },
      });

      const response = await refreshPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid refresh token');
    });

    it('should return 401 when refresh token is expired', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Refresh token expired' },
      });

      const request = createMockRequest({
        body: { refresh_token: 'expired-refresh-token' },
      });

      const response = await refreshPOST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Refresh token expired');
    });
  });
});

describe('Auth API Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle empty string email', async () => {
    const request = createMockRequest({
      body: { email: '', password: 'password123' },
    });

    const response = await loginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email and password are required');
  });

  it('should handle empty string password', async () => {
    const request = createMockRequest({
      body: { email: 'test@example.com', password: '' },
    });

    const response = await loginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Email and password are required');
  });

  it('should handle whitespace-only email', async () => {
    // Whitespace-only email will pass the initial check but fail at Supabase
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid email format' },
    });

    const request = createMockRequest({
      body: { email: '   ', password: 'password123' },
    });

    const response = await loginPOST(request);
    const data = await response.json();

    // The API returns 401 for invalid credentials
    expect(response.status).toBe(401);
    expect(data.error).toBe('Invalid email format');
  });

  it('should handle special characters in password', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: { access_token: 'token' } },
      error: null,
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'P@$$w0rd!#$%^&*()' },
    });

    const response = await loginPOST(request);

    expect(response.status).toBe(200);
  });

  it('should handle unicode characters in email', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: { access_token: 'token' } },
      error: null,
    });

    const request = createMockRequest({
      body: { email: 'tëst@example.com', password: 'password123' },
    });

    const response = await loginPOST(request);

    expect(response.status).toBe(200);
  });

  it('should handle very long email addresses', async () => {
    const longEmail = 'a'.repeat(200) + '@example.com';
    
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid email format' },
    });

    const request = createMockRequest({
      body: { email: longEmail, password: 'password123' },
    });

    const response = await loginPOST(request);

    expect(response.status).toBe(401);
  });

  it('should handle very long passwords', async () => {
    const longPassword = 'a'.repeat(1000);
    
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' }, session: { access_token: 'token' } },
      error: null,
    });

    const request = createMockRequest({
      body: { email: 'test@example.com', password: longPassword },
    });

    const response = await loginPOST(request);

    expect(response.status).toBe(200);
  });
});

describe('Auth API Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not expose internal error details', async () => {
    mockSignInWithPassword.mockRejectedValue(new Error('Internal database error'));

    const request = createMockRequest({
      body: { email: 'test@example.com', password: 'password123' },
    });

    const response = await loginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
    expect(data.error).not.toContain('database');
  });

  it('should handle null body gracefully', async () => {
    const request = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => null,
    };

    const response = await loginPOST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
  });
});
