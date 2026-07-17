/**
 * @fileoverview Tests for Next.js middleware that refreshes Supabase sessions
 *
 * The middleware intercepts every request and delegates to updateSession()
 * from @profullstack/stack/supabase, which reads session cookies and calls
 * supabase.auth.getUser() to trigger a token refresh if the JWT is expiring.
 * Without this middleware, web app sessions expire after ~1 hour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the stack session helper
const mockUpdateSession = vi.fn();

vi.mock('@profullstack/stack/supabase', () => ({
  updateSession: mockUpdateSession,
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
  });

  it('should call updateSession() to refresh the session', async () => {
    const mockResponse = { headers: new Map() };
    mockUpdateSession.mockResolvedValue({ response: mockResponse, user: null });

    const request = createMockRequest('/dashboard', [
      { name: 'sb-access-token', value: 'old-jwt' },
    ]);

    await middleware(request);

    expect(mockUpdateSession).toHaveBeenCalledOnce();
    expect(mockUpdateSession).toHaveBeenCalledWith(request);
  });

  it('should return the response even when no user is authenticated', async () => {
    const mockResponse = { headers: new Map() };
    mockUpdateSession.mockResolvedValue({ response: mockResponse, user: null });

    const request = createMockRequest('/');
    const response = await middleware(request);

    expect(response).toBe(mockResponse);
  });

  it('should return the response when user is authenticated', async () => {
    const mockResponse = { headers: new Map() };
    mockUpdateSession.mockResolvedValue({
      response: mockResponse,
      user: { id: 'user-123', email: 'test@example.com' },
    });

    const request = createMockRequest('/dashboard', [
      { name: 'sb-access-token', value: 'valid-jwt' },
    ]);

    const response = await middleware(request);

    expect(response).toBe(mockResponse);
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
