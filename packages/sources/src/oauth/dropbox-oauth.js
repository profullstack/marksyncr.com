/**
 * Dropbox OAuth Integration
 *
 * Handles OAuth 2.0 flow for Dropbox authentication with PKCE support.
 */

/**
 * Dropbox OAuth configuration
 */
const DROPBOX_CONFIG = {
  authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
  tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
  revokeEndpoint: 'https://api.dropboxapi.com/2/auth/token/revoke',
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
 * Default scopes required for MarkSyncr bookmark sync
 * - files.content.read: Read file content (to check existing bookmarks)
 * - files.content.write: Write file content (to save bookmarks)
 * - account_info.read: Read account info (for user display)
 */
const DEFAULT_SCOPES = ['files.content.read', 'files.content.write', 'account_info.read'];

/**
 * Build Dropbox authorization URL with PKCE
 * @param {string} clientId - Dropbox App key
 * @param {string} redirectUri - Redirect URI after authorization
 * @param {object} [options] - Additional options
 * @param {string} [options.state] - State parameter for CSRF protection
 * @param {string} [options.codeChallenge] - PKCE code challenge
 * @param {string[]} [options.scopes] - OAuth scopes to request
 * @returns {string} Authorization URL
 */
export function buildAuthorizationUrl(clientId, redirectUri, options = {}) {
  const scopes = options.scopes || DEFAULT_SCOPES;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    token_access_type: 'offline', // Get refresh token
    scope: scopes.join(' '), // Space-separated scopes
  });

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.codeChallenge) {
    params.set('code_challenge', options.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return `${DROPBOX_CONFIG.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from callback
 * @param {string} clientId - Dropbox App key
 * @param {string} clientSecret - Dropbox App secret
 * @param {string} redirectUri - Redirect URI used in authorization
 * @param {string} [codeVerifier] - PKCE code verifier
 * @returns {Promise<{access_token: string, refresh_token?: string, expires_in: number, token_type: string, account_id: string, uid: string}>}
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
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const response = await fetch(DROPBOX_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Dropbox token exchange failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @param {string} clientId - Dropbox App key
 * @param {string} clientSecret - Dropbox App secret
 * @returns {Promise<{access_token: string, expires_in: number, token_type: string}>}
 */
export async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(DROPBOX_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Dropbox token refresh failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Validate Dropbox access token and get user info
 * @param {string} accessToken - Dropbox access token
 * @returns {Promise<{valid: boolean, user?: object}>}
 */
export async function validateToken(accessToken) {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
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
        account_id: user.account_id,
        name: user.name?.display_name,
        email: user.email,
        email_verified: user.email_verified,
        profile_photo_url: user.profile_photo_url,
      },
    };
  } catch (error) {
    console.error('Dropbox token validation failed:', error);
    return { valid: false };
  }
}

/**
 * Revoke Dropbox access token
 * @param {string} accessToken - Dropbox access token
 * @returns {Promise<boolean>}
 */
export async function revokeToken(accessToken) {
  try {
    const response = await fetch(DROPBOX_CONFIG.revokeEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Dropbox token revocation failed:', error);
    return false;
  }
}

/**
 * Dropbox OAuth handler for browser extensions
 */
export class DropboxOAuthHandler {
  /**
   * @param {string} clientId - Dropbox App key
   * @param {string} redirectUri - Extension redirect URI
   */
  constructor(clientId, redirectUri) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.pendingAuth = null;
  }

  /**
   * Start OAuth flow with PKCE
   * @returns {Promise<{authUrl: string, state: string, codeVerifier: string}>}
   */
  async startAuth() {
    const state = generateRandomString();
    const { verifier, challenge } = await generatePKCE();

    const authUrl = buildAuthorizationUrl(this.clientId, this.redirectUri, {
      state,
      codeChallenge: challenge,
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
      throw new Error(`Dropbox OAuth error: ${errorDescription || error}`);
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
   * @returns {Promise<{code: string, codeVerifier: string}>}
   */
  async launchWebAuthFlow() {
    const { authUrl } = await this.startAuth();

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
}

export default {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  validateToken,
  revokeToken,
  DropboxOAuthHandler,
};
