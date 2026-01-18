/**
 * Google OAuth Integration
 *
 * Handles OAuth 2.0 flow for Google Drive authentication with PKCE support.
 * Uses Google's OAuth 2.0 for Web Server Applications flow.
 */

/**
 * Google OAuth configuration
 */
const GOOGLE_CONFIG = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
  // Scope for Google Drive file access (only files created by the app)
  scope:
    'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
};

/**
 * Generate a random string for state/verifier
 * @param {number} length - Length of the string
 * @returns {string}
 */
function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

/**
 * Generate PKCE code verifier and challenge
 * @returns {Promise<{verifier: string, challenge: string}>}
 */
async function generatePKCE() {
  const verifier = generateRandomString(128);

  // Create SHA-256 hash of verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);

  // Base64url encode the hash
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { verifier, challenge };
}

/**
 * Build Google authorization URL with PKCE
 * @param {string} clientId - Google OAuth client ID
 * @param {string} redirectUri - Redirect URI after authorization
 * @param {object} [options] - Additional options
 * @param {string} [options.state] - State parameter for CSRF protection
 * @param {string} [options.codeChallenge] - PKCE code challenge
 * @param {boolean} [options.prompt] - Force consent screen
 * @returns {string} Authorization URL
 */
export function buildAuthorizationUrl(clientId, redirectUri, options = {}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CONFIG.scope,
    access_type: 'offline', // Get refresh token
    include_granted_scopes: 'true',
  });

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.codeChallenge) {
    params.set('code_challenge', options.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  if (options.prompt) {
    params.set('prompt', 'consent'); // Force consent to get refresh token
  }

  return `${GOOGLE_CONFIG.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from callback
 * @param {string} clientId - Google OAuth client ID
 * @param {string} clientSecret - Google OAuth client secret
 * @param {string} redirectUri - Redirect URI used in authorization
 * @param {string} [codeVerifier] - PKCE code verifier
 * @returns {Promise<{access_token: string, refresh_token?: string, expires_in: number, token_type: string, scope: string, id_token?: string}>}
 */
export async function exchangeCodeForToken(
  code,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier
) {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const response = await fetch(GOOGLE_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Google token exchange failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @param {string} clientId - Google OAuth client ID
 * @param {string} clientSecret - Google OAuth client secret
 * @returns {Promise<{access_token: string, expires_in: number, token_type: string, scope: string}>}
 */
export async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Google token refresh failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Validate Google access token and get user info
 * @param {string} accessToken - Google access token
 * @returns {Promise<{valid: boolean, user?: object}>}
 */
export async function validateToken(accessToken) {
  try {
    const response = await fetch(GOOGLE_CONFIG.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const user = await response.json();

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        verified_email: user.verified_email,
        name: user.name,
        given_name: user.given_name,
        family_name: user.family_name,
        picture: user.picture,
      },
    };
  } catch (error) {
    console.error('Google token validation failed:', error);
    return { valid: false };
  }
}

/**
 * Revoke Google access token
 * @param {string} token - Access token or refresh token to revoke
 * @returns {Promise<boolean>}
 */
export async function revokeToken(token) {
  try {
    const response = await fetch(`${GOOGLE_CONFIG.revokeEndpoint}?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Google token revocation failed:', error);
    return false;
  }
}

/**
 * Get token info (for debugging/validation)
 * @param {string} accessToken - Google access token
 * @returns {Promise<object>}
 */
export async function getTokenInfo(accessToken) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
  );

  if (!response.ok) {
    throw new Error('Failed to get token info');
  }

  return response.json();
}

/**
 * Google OAuth handler for browser extensions
 */
export class GoogleOAuthHandler {
  /**
   * @param {string} clientId - Google OAuth client ID
   * @param {string} redirectUri - Extension redirect URI
   */
  constructor(clientId, redirectUri) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.pendingAuth = null;
  }

  /**
   * Start OAuth flow with PKCE
   * @param {boolean} [forceConsent=false] - Force consent screen to get refresh token
   * @returns {Promise<{authUrl: string, state: string, codeVerifier: string}>}
   */
  async startAuth(forceConsent = false) {
    const state = generateRandomString();
    const { verifier, challenge } = await generatePKCE();

    const authUrl = buildAuthorizationUrl(this.clientId, this.redirectUri, {
      state,
      codeChallenge: challenge,
      prompt: forceConsent,
    });

    this.pendingAuth = {
      state,
      codeVerifier: verifier,
      startedAt: Date.now(),
    };

    return { authUrl, state, codeVerifier: verifier };
  }

  /**
   * Handle OAuth callback
   * @param {string} callbackUrl - Full callback URL with code and state
   * @returns {{code: string, state: string, codeVerifier: string}}
   */
  handleCallback(callbackUrl) {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      const errorDescription = url.searchParams.get('error_description');
      throw new Error(`Google OAuth error: ${errorDescription || error}`);
    }

    if (!code) {
      throw new Error('No authorization code in callback');
    }

    // Verify state matches
    if (!this.pendingAuth || state !== this.pendingAuth.state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    const { codeVerifier } = this.pendingAuth;

    // Clear pending auth
    this.pendingAuth = null;

    return { code, state, codeVerifier };
  }

  /**
   * Complete OAuth flow using browser extension identity API
   * @param {boolean} [forceConsent=false] - Force consent screen
   * @returns {Promise<{code: string, codeVerifier: string}>}
   */
  async launchWebAuthFlow(forceConsent = false) {
    const { authUrl } = await this.startAuth(forceConsent);

    // Use browser extension identity API
    const browser = globalThis.browser || globalThis.chrome;

    if (!browser?.identity?.launchWebAuthFlow) {
      throw new Error('Browser identity API not available');
    }

    return new Promise((resolve, reject) => {
      browser.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        (responseUrl) => {
          if (browser.runtime.lastError) {
            reject(new Error(browser.runtime.lastError.message));
            return;
          }

          try {
            const { code, codeVerifier } = this.handleCallback(responseUrl);
            resolve({ code, codeVerifier });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }

  /**
   * Use Chrome's identity.getAuthToken for simpler flow
   * Note: This only works with Chrome and requires the extension to be published
   * @returns {Promise<string>} Access token
   */
  async getChromeAuthToken() {
    const chrome = globalThis.chrome;

    if (!chrome?.identity?.getAuthToken) {
      throw new Error('Chrome identity API not available');
    }

    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken(
        {
          interactive: true,
          scopes: GOOGLE_CONFIG.scope.split(' '),
        },
        (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(token);
        }
      );
    });
  }

  /**
   * Remove cached Chrome auth token
   * @param {string} token - Token to remove
   * @returns {Promise<void>}
   */
  async removeChromeAuthToken(token) {
    const chrome = globalThis.chrome;

    if (!chrome?.identity?.removeCachedAuthToken) {
      throw new Error('Chrome identity API not available');
    }

    return new Promise((resolve, reject) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }
}

export default {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  validateToken,
  revokeToken,
  getTokenInfo,
  GoogleOAuthHandler,
};
