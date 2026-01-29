/**
 * @fileoverview Tests for Next.js middleware that refreshes Supabase sessions
 *
 * The middleware intercepts every request, reads session cookies, and calls
 * supabase.auth.getUser() to trigger a token refresh if the JWT is expiring.
 * Without this middleware, web app sessions expire after ~1 hour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase SSR
const mockGetUser = vi.fn();
const mockSetAll = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((url, key, options) => {
    // Capture the cookie handlers so we can verify they work
    mockSetAll.mockImplementation((cookiesToSet) => {
      options.cookies.setAll(cookiesToSet);
    });

    return {
      auth: {
        getUser: mockGetUser,
      },
    };
  }),
}));

// Import after mocks
const { middleware, config } = await import('../middleware.js');

/**
 * Create a mock Next.js request with cookies
 */
function createMockRequest(path = '/', cookies = []) {
  const cookieMap = new Map(cookies.map((c) => [c.name, c]));

  return {
    url: `https://marksyncr.com${path}`,
    cookies: {
      getAll() {
        return cookies;
      },
      get(name) {
        return cookieMap.get(name);
      },
      set(name, value) {
        cookieMap.set(name, { name, value });
      },
    },
  };
}

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it('should call supabase.auth.getUser() to refresh the session', async () => {
    const request = createMockRequest('/dashboard', [
      { name: 'sb-access-token', value: 'old-jwt' },
    ]);

    await middleware(request);

    expect(mockGetUser).toHaveBeenCalledOnce();
  });

  it('should return a response even when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'No session' } });

    const request = createMockRequest('/');
    const response = await middleware(request);

    expect(response).toBeDefined();
    expect(mockGetUser).toHaveBeenCalledOnce();
  });

  it('should return a response when user is authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });

    const request = createMockRequest('/dashboard', [
      { name: 'sb-access-token', value: 'valid-jwt' },
    ]);

    const response = await middleware(request);

    expect(response).toBeDefined();
    expect(mockGetUser).toHaveBeenCalledOnce();
  });

  it('should pass cookies from request to Supabase client', async () => {
    const { createServerClient } = await import('@supabase/ssr');

    const sessionCookies = [
      { name: 'sb-access-token', value: 'jwt-token' },
      { name: 'sb-refresh-token', value: 'refresh-token' },
    ];
    const request = createMockRequest('/dashboard', sessionCookies);

    await middleware(request);

    // Verify createServerClient was called with cookie handlers
    expect(createServerClient).toHaveBeenCalledWith(
      // URL and key come from process.env (may be undefined in test env)
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      })
    );
  });
});

describe('Middleware Route Matcher', () => {
  it('should have a matcher config defined', () => {
    expect(config).toBeDefined();
    expect(config.matcher).toBeDefined();
    expect(config.matcher).toHaveLength(1);
  });

  it('should match dynamic routes', () => {
    const pattern = new RegExp(config.matcher[0]);
    expect(pattern.test('/dashboard')).toBe(true);
    expect(pattern.test('/api/auth/session')).toBe(true);
    expect(pattern.test('/settings')).toBe(true);
  });

  it('should exclude static assets from the matcher pattern', () => {
    const pattern = new RegExp(config.matcher[0]);
    // These should NOT match (static files excluded)
    expect(pattern.test('/favicon.ico')).toBe(false);
    expect(pattern.test('/logo.svg')).toBe(false);
    expect(pattern.test('/icon.png')).toBe(false);
    expect(pattern.test('/photo.jpg')).toBe(false);
  });
});
