/**
 * OAuth Integration Module
 *
 * Exports OAuth handlers for all supported providers.
 */

export {
  buildAuthorizationUrl as buildGitHubAuthUrl,
  exchangeCodeForToken as exchangeGitHubCode,
  validateToken as validateGitHubToken,
  revokeToken as revokeGitHubToken,
  GitHubOAuthHandler,
} from './github-oauth.js';

export {
  buildAuthorizationUrl as buildDropboxAuthUrl,
  exchangeCodeForToken as exchangeDropboxCode,
  refreshAccessToken as refreshDropboxToken,
  validateToken as validateDropboxToken,
  revokeToken as revokeDropboxToken,
  DropboxOAuthHandler,
} from './dropbox-oauth.js';

export {
  buildAuthorizationUrl as buildGoogleAuthUrl,
  exchangeCodeForToken as exchangeGoogleCode,
  refreshAccessToken as refreshGoogleToken,
  validateToken as validateGoogleToken,
  revokeToken as revokeGoogleToken,
  getTokenInfo as getGoogleTokenInfo,
  GoogleOAuthHandler,
} from './google-oauth.js';

/**
 * Create OAuth handler for a provider
 * @param {'github' | 'dropbox' | 'google-drive'} provider - Provider name
 * @param {string} clientId - OAuth client ID
 * @param {string} redirectUri - Redirect URI
 * @returns {GitHubOAuthHandler | DropboxOAuthHandler | GoogleOAuthHandler}
 */
export function createOAuthHandler(provider, clientId, redirectUri) {
  switch (provider) {
    case 'github':
      return new (require('./github-oauth.js').GitHubOAuthHandler)(clientId, redirectUri);
    case 'dropbox':
      return new (require('./dropbox-oauth.js').DropboxOAuthHandler)(clientId, redirectUri);
    case 'google-drive':
      return new (require('./google-oauth.js').GoogleOAuthHandler)(clientId, redirectUri);
    default:
      throw new Error(`Unknown OAuth provider: ${provider}`);
  }
}
