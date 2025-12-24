/**
 * Tests for Dropbox OAuth functionality
 * Tests the authorization URL building and token exchange
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  validateToken,
} from '../src/oauth/dropbox-oauth.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Dropbox OAuth', () => {
  const mockClientId = 'test_client_id';
  const mockClientSecret = 'test_client_secret';
  const mockRedirectUri = 'https://marksyncr.com/api/connect/dropbox/callback';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildAuthorizationUrl', () => {
    it('should build authorization URL with required parameters', () => {
      const url = buildAuthorizationUrl(mockClientId, mockRedirectUri);
      const parsedUrl = new URL(url);

      expect(parsedUrl.origin).toBe('https://www.dropbox.com');
      expect(parsedUrl.pathname).toBe('/oauth2/authorize');
      expect(parsedUrl.searchParams.get('client_id')).toBe(mockClientId);
      expect(parsedUrl.searchParams.get('redirect_uri')).toBe(mockRedirectUri);
      expect(parsedUrl.searchParams.get('response_type')).toBe('code');
      expect(parsedUrl.searchParams.get('token_access_type')).toBe('offline');
    });

    it('should include state parameter when provided as options object', () => {
      const state = 'random_state_string_123';
      const url = buildAuthorizationUrl(mockClientId, mockRedirectUri, { state });
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('state')).toBe(state);
    });

    it('should NOT include state when passed as string directly (regression test)', () => {
      // This test documents the correct API usage
      // The third parameter must be an options object, not a string
      const state = 'random_state_string_123';
      
      // Correct usage: { state }
      const correctUrl = buildAuthorizationUrl(mockClientId, mockRedirectUri, { state });
      const correctParsed = new URL(correctUrl);
      expect(correctParsed.searchParams.get('state')).toBe(state);

      // Incorrect usage: passing string directly would not set state
      // @ts-expect-error - Testing incorrect usage
      const incorrectUrl = buildAuthorizationUrl(mockClientId, mockRedirectUri, state);
      const incorrectParsed = new URL(incorrectUrl);
      // When a string is passed, options.state would be undefined
      expect(incorrectParsed.searchParams.get('state')).toBeNull();
    });

    it('should include PKCE code challenge when provided', () => {
      const codeChallenge = 'test_code_challenge_abc123';
      const url = buildAuthorizationUrl(mockClientId, mockRedirectUri, { codeChallenge });
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('code_challenge')).toBe(codeChallenge);
      expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('should include both state and code challenge when provided', () => {
      const state = 'random_state_123';
      const codeChallenge = 'test_challenge_456';
      const url = buildAuthorizationUrl(mockClientId, mockRedirectUri, { state, codeChallenge });
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('state')).toBe(state);
      expect(parsedUrl.searchParams.get('code_challenge')).toBe(codeChallenge);
      expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('should not include state when options is empty object', () => {
      const url = buildAuthorizationUrl(mockClientId, mockRedirectUri, {});
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('state')).toBeNull();
    });

    it('should not include code_challenge when not provided', () => {
      const url = buildAuthorizationUrl(mockClientId, mockRedirectUri, { state: 'test' });
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('code_challenge')).toBeNull();
      expect(parsedUrl.searchParams.get('code_challenge_method')).toBeNull();
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for tokens successfully', async () => {
      const mockTokenResponse = {
        access_token: 'sl.test_access_token',
        refresh_token: 'test_refresh_token',
        expires_in: 14400,
        token_type: 'bearer',
        account_id: 'dbid:test123',
        uid: '12345',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      });

      const result = await exchangeCodeForToken(
        'auth_code_123',
        mockClientId,
        mockClientSecret,
        mockRedirectUri
      );

      expect(result).toEqual(mockTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dropboxapi.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should include code_verifier when provided (PKCE)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token' }),
      });

      await exchangeCodeForToken(
        'auth_code_123',
        mockClientId,
        mockClientSecret,
        mockRedirectUri,
        'pkce_verifier_123'
      );

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('code_verifier=pkce_verifier_123');
    });

    it('should throw error on token exchange failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'The authorization code has expired',
        }),
      });

      await expect(
        exchangeCodeForToken('expired_code', mockClientId, mockClientSecret, mockRedirectUri)
      ).rejects.toThrow('Dropbox token exchange failed: The authorization code has expired');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token successfully', async () => {
      const mockRefreshResponse = {
        access_token: 'sl.new_access_token',
        expires_in: 14400,
        token_type: 'bearer',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      });

      const result = await refreshAccessToken(
        'refresh_token_123',
        mockClientId,
        mockClientSecret
      );

      expect(result).toEqual(mockRefreshResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dropboxapi.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should throw error on refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Refresh token has been revoked',
        }),
      });

      await expect(
        refreshAccessToken('revoked_token', mockClientId, mockClientSecret)
      ).rejects.toThrow('Dropbox token refresh failed: Refresh token has been revoked');
    });
  });

  describe('validateToken', () => {
    it('should return valid: true with user info for valid token', async () => {
      const mockUserResponse = {
        account_id: 'dbid:test123',
        name: { display_name: 'Test User' },
        email: 'test@example.com',
        email_verified: true,
        profile_photo_url: 'https://example.com/photo.jpg',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUserResponse,
      });

      const result = await validateToken('valid_access_token');

      expect(result.valid).toBe(true);
      expect(result.user).toEqual({
        account_id: 'dbid:test123',
        name: 'Test User',
        email: 'test@example.com',
        email_verified: true,
        profile_photo_url: 'https://example.com/photo.jpg',
      });
    });

    it('should return valid: false for invalid token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await validateToken('invalid_token');

      expect(result.valid).toBe(false);
      expect(result.user).toBeUndefined();
    });

    it('should return valid: false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await validateToken('any_token');

      expect(result.valid).toBe(false);
    });
  });
});
