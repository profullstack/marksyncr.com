/**
 * GitHub OAuth Integration
 *
 * Handles OAuth flow for GitHub authentication to access repository storage.
 * Uses GitHub's OAuth 2.0 flow with PKCE for browser extensions.
 */

/**
 * GitHub OAuth configuration
 */
const GITHUB_CONFIG = {
  authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  tokenEndpoint: 'https://github.com/login/oauth/access_token',
  scope: 'repo', // Full control of private repositories
  responseType: 'code',
};

/**
 * Generate a random string for state parameter
 * @param {number} length - Length of the string
 * @returns {string}
 */
function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

/**
 * Generate PKCE code verifier and challenge
 * @returns {Promise<{verifier: string, challenge: string}>}
 */
export async function generatePKCE() {
  const verifier = generateRandomString(64);

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
 * Build GitHub authorization URL
 * @param {string} clientId - GitHub OAuth App client ID
 * @param {string} redirectUri - Redirect URI after authorization
 * @param {string} [state] - Optional state parameter for CSRF protection
 * @returns {string} Authorization URL
 */
export function buildAuthorizationUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: GITHUB_CONFIG.scope,
    response_type: GITHUB_CONFIG.responseType,
    state: state || generateRandomString(),
  });

  return `${GITHUB_CONFIG.authorizationEndpoint}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 * Note: This should be done server-side to protect client_secret
 * @param {string} code - Authorization code from callback
 * @param {string} clientId - GitHub OAuth App client ID
 * @param {string} clientSecret - GitHub OAuth App client secret
 * @param {string} redirectUri - Redirect URI used in authorization
 * @returns {Promise<{access_token: string, token_type: string, scope: string}>}
 */
export async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
  const response = await fetch(GITHUB_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub token exchange failed: ${error}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return data;
}

/**
 * Validate GitHub access token
 * @param {string} accessToken - GitHub access token
 * @returns {Promise<{valid: boolean, user?: object, scopes?: string[]}>}
 */
export async function validateToken(accessToken) {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    const user = await response.json();
    const scopes = response.headers.get('X-OAuth-Scopes')?.split(', ') || [];

    return {
      valid: true,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
      },
      scopes,
    };
  } catch (error) {
    console.error('GitHub token validation failed:', error);
    return { valid: false };
  }
}

/**
 * Revoke GitHub access token
 * Note: GitHub doesn't have a standard revocation endpoint
 * Users must revoke access from GitHub settings
 * @param {string} accessToken - GitHub access token
 * @param {string} clientId - GitHub OAuth App client ID
 * @param {string} clientSecret - GitHub OAuth App client secret
 * @returns {Promise<boolean>}
 */
export async function revokeToken(accessToken, clientId, clientSecret) {
  try {
    // GitHub uses a different endpoint for token revocation
    const response = await fetch(
      `https://api.github.com/applications/${clientId}/token`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      }
    );

    return response.ok || response.status === 404;
  } catch (error) {
    console.error('GitHub token revocation failed:', error);
    return false;
  }
}

/**
 * GitHub OAuth handler for browser extensions
 */
export class GitHubOAuthHandler {
  /**
   * @param {string} clientId - GitHub OAuth App client ID
   * @param {string} redirectUri - Extension redirect URI
   */
  constructor(clientId, redirectUri) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.pendingAuth = null;
  }

  /**
   * Start OAuth flow
   * @returns {Promise<{authUrl: string, state: string}>}
   */
  async startAuth() {
    const state = generateRandomString();
    const authUrl = buildAuthorizationUrl(this.clientId, this.redirectUri, state);

    this.pendingAuth = { state, startedAt: Date.now() };

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback
   * @param {string} callbackUrl - Full callback URL with code and state
   * @returns {Promise<{code: string, state: string}>}
   */
  handleCallback(callbackUrl) {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      const errorDescription = url.searchParams.get('error_description');
      throw new Error(`GitHub OAuth error: ${errorDescription || error}`);
    }

    if (!code) {
      throw new Error('No authorization code in callback');
    }

    // Verify state matches
    if (this.pendingAuth && state !== this.pendingAuth.state) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // Clear pending auth
    this.pendingAuth = null;

    return { code, state };
  }

  /**
   * Complete OAuth flow using browser extension identity API
   * @returns {Promise<string>} Authorization code
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
            const { code } = this.handleCallback(responseUrl);
            resolve(code);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }
}

export default {
  generatePKCE,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  validateToken,
  revokeToken,
  GitHubOAuthHandler,
};
