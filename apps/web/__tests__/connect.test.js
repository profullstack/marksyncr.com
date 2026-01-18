/**
 * OAuth Connection Routes Tests
 *
 * Tests for the sync source OAuth connection API routes.
 * Uses Vitest as the testing framework.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables first
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://marksyncr.com');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('GITHUB_CLIENT_ID', 'test-github-client-id');
vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-github-client-secret');
vi.stubEnv('DROPBOX_CLIENT_ID', 'test-dropbox-client-id');
vi.stubEnv('DROPBOX_CLIENT_SECRET', 'test-dropbox-client-secret');
vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client-id');
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-google-client-secret');

describe('OAuth State Generation', () => {
  it('should generate unique state strings', () => {
    const states = new Set();
    const generateState = (length = 32) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      const randomValues = new Uint8Array(length);
      crypto.getRandomValues(randomValues);
      for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
      }
      return result;
    };

    // Generate 100 states and ensure they're all unique
    for (let i = 0; i < 100; i++) {
      states.add(generateState());
    }

    expect(states.size).toBe(100);
  });

  it('should generate state strings of correct length', () => {
    const generateState = (length = 32) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      const randomValues = new Uint8Array(length);
      crypto.getRandomValues(randomValues);
      for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
      }
      return result;
    };

    expect(generateState(16).length).toBe(16);
    expect(generateState(32).length).toBe(32);
    expect(generateState(64).length).toBe(64);
  });
});

describe('OAuth URL Building', () => {
  it('should build GitHub authorization URL correctly', async () => {
    const { buildAuthorizationUrl } = await import('@marksyncr/sources/oauth/github-oauth');

    const url = buildAuthorizationUrl(
      'test-client-id',
      'https://example.com/callback',
      'test-state'
    );

    expect(url).toContain('https://github.com/login/oauth/authorize');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
    expect(url).toContain('state=test-state');
    expect(url).toContain('scope=repo');
  });

  it('should build Dropbox authorization URL correctly', async () => {
    const { buildAuthorizationUrl } = await import('@marksyncr/sources/oauth/dropbox-oauth');

    const url = buildAuthorizationUrl(
      'test-client-id',
      'https://example.com/callback',
      'test-state'
    );

    expect(url).toContain('https://www.dropbox.com/oauth2/authorize');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
    expect(url).toContain('response_type=code');
  });

  it('should build Google authorization URL correctly', async () => {
    const { buildAuthorizationUrl } = await import('@marksyncr/sources/oauth/google-oauth');

    const url = buildAuthorizationUrl(
      'test-client-id',
      'https://example.com/callback',
      'test-state'
    );

    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
    expect(url).toContain('response_type=code');
  });
});

describe('OAuth Handler Classes', () => {
  describe('GitHubOAuthHandler', () => {
    it('should create handler with client ID and redirect URI', async () => {
      const { GitHubOAuthHandler } = await import('@marksyncr/sources/oauth/github-oauth');

      const handler = new GitHubOAuthHandler('test-client-id', 'https://example.com/callback');

      expect(handler.clientId).toBe('test-client-id');
      expect(handler.redirectUri).toBe('https://example.com/callback');
    });

    it('should start auth flow and return auth URL with state', async () => {
      const { GitHubOAuthHandler } = await import('@marksyncr/sources/oauth/github-oauth');

      const handler = new GitHubOAuthHandler('test-client-id', 'https://example.com/callback');

      const { authUrl, state } = await handler.startAuth();

      expect(authUrl).toContain('https://github.com/login/oauth/authorize');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
    });

    it('should handle callback and extract code', async () => {
      const { GitHubOAuthHandler } = await import('@marksyncr/sources/oauth/github-oauth');

      const handler = new GitHubOAuthHandler('test-client-id', 'https://example.com/callback');

      // Start auth to set pending state
      const { state } = await handler.startAuth();

      // Simulate callback
      const callbackUrl = `https://example.com/callback?code=test-code&state=${state}`;
      const result = handler.handleCallback(callbackUrl);

      expect(result.code).toBe('test-code');
      expect(result.state).toBe(state);
    });

    it('should throw error on state mismatch', async () => {
      const { GitHubOAuthHandler } = await import('@marksyncr/sources/oauth/github-oauth');

      const handler = new GitHubOAuthHandler('test-client-id', 'https://example.com/callback');

      // Start auth to set pending state
      await handler.startAuth();

      // Simulate callback with wrong state
      const callbackUrl = 'https://example.com/callback?code=test-code&state=wrong-state';

      expect(() => handler.handleCallback(callbackUrl)).toThrow('State mismatch');
    });

    it('should throw error when OAuth error is returned', async () => {
      const { GitHubOAuthHandler } = await import('@marksyncr/sources/oauth/github-oauth');

      const handler = new GitHubOAuthHandler('test-client-id', 'https://example.com/callback');

      const callbackUrl =
        'https://example.com/callback?error=access_denied&error_description=User%20denied%20access';

      expect(() => handler.handleCallback(callbackUrl)).toThrow('GitHub OAuth error');
    });
  });

  describe('DropboxOAuthHandler', () => {
    it('should create handler with client ID and redirect URI', async () => {
      const { DropboxOAuthHandler } = await import('@marksyncr/sources/oauth/dropbox-oauth');

      const handler = new DropboxOAuthHandler('test-client-id', 'https://example.com/callback');

      expect(handler.clientId).toBe('test-client-id');
      expect(handler.redirectUri).toBe('https://example.com/callback');
    });

    it('should start auth flow and return auth URL with state', async () => {
      const { DropboxOAuthHandler } = await import('@marksyncr/sources/oauth/dropbox-oauth');

      const handler = new DropboxOAuthHandler('test-client-id', 'https://example.com/callback');

      const { authUrl, state } = await handler.startAuth();

      expect(authUrl).toContain('https://www.dropbox.com/oauth2/authorize');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
    });
  });

  describe('GoogleOAuthHandler', () => {
    it('should create handler with client ID and redirect URI', async () => {
      const { GoogleOAuthHandler } = await import('@marksyncr/sources/oauth/google-oauth');

      const handler = new GoogleOAuthHandler('test-client-id', 'https://example.com/callback');

      expect(handler.clientId).toBe('test-client-id');
      expect(handler.redirectUri).toBe('https://example.com/callback');
    });

    it('should start auth flow and return auth URL with state', async () => {
      const { GoogleOAuthHandler } = await import('@marksyncr/sources/oauth/google-oauth');

      const handler = new GoogleOAuthHandler('test-client-id', 'https://example.com/callback');

      const { authUrl, state } = await handler.startAuth();

      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
    });
  });
});

describe('Token Validation Functions', () => {
  it('should export validateToken for GitHub', async () => {
    const { validateToken } = await import('@marksyncr/sources/oauth/github-oauth');
    expect(typeof validateToken).toBe('function');
  });

  it('should export validateToken for Dropbox', async () => {
    const { validateToken } = await import('@marksyncr/sources/oauth/dropbox-oauth');
    expect(typeof validateToken).toBe('function');
  });

  it('should export validateToken for Google', async () => {
    const { validateToken } = await import('@marksyncr/sources/oauth/google-oauth');
    expect(typeof validateToken).toBe('function');
  });

  it('should export getTokenInfo for Google', async () => {
    const { getTokenInfo } = await import('@marksyncr/sources/oauth/google-oauth');
    expect(typeof getTokenInfo).toBe('function');
  });
});

describe('Token Exchange Functions', () => {
  it('should export exchangeCodeForToken for GitHub', async () => {
    const { exchangeCodeForToken } = await import('@marksyncr/sources/oauth/github-oauth');
    expect(typeof exchangeCodeForToken).toBe('function');
  });

  it('should export exchangeCodeForToken for Dropbox', async () => {
    const { exchangeCodeForToken } = await import('@marksyncr/sources/oauth/dropbox-oauth');
    expect(typeof exchangeCodeForToken).toBe('function');
  });

  it('should export exchangeCodeForToken for Google', async () => {
    const { exchangeCodeForToken } = await import('@marksyncr/sources/oauth/google-oauth');
    expect(typeof exchangeCodeForToken).toBe('function');
  });
});

describe('Token Revocation Functions', () => {
  it('should export revokeToken for GitHub', async () => {
    const { revokeToken } = await import('@marksyncr/sources/oauth/github-oauth');
    expect(typeof revokeToken).toBe('function');
  });

  it('should export revokeToken for Dropbox', async () => {
    const { revokeToken } = await import('@marksyncr/sources/oauth/dropbox-oauth');
    expect(typeof revokeToken).toBe('function');
  });

  it('should export revokeToken for Google', async () => {
    const { revokeToken } = await import('@marksyncr/sources/oauth/google-oauth');
    expect(typeof revokeToken).toBe('function');
  });
});

describe('Token Refresh Functions', () => {
  it('should export refreshAccessToken for Dropbox', async () => {
    const { refreshAccessToken } = await import('@marksyncr/sources/oauth/dropbox-oauth');
    expect(typeof refreshAccessToken).toBe('function');
  });

  it('should export refreshAccessToken for Google', async () => {
    const { refreshAccessToken } = await import('@marksyncr/sources/oauth/google-oauth');
    expect(typeof refreshAccessToken).toBe('function');
  });
});
