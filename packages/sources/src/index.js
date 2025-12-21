/**
 * @marksyncr/sources
 *
 * Storage source implementations for MarkSyncr
 */

// Base source
export { BaseSource, createSource } from './base-source.js';

// Source implementations
export { LocalFileSource } from './local-file.js';
export { GitHubSource } from './github.js';
export { DropboxSource } from './dropbox.js';
export { GoogleDriveSource } from './google-drive.js';
export {
  SupabaseCloudSource,
  createSupabaseCloudSource,
  generateDeviceId,
  getOrCreateDeviceId,
} from './supabase-cloud.js';

// OAuth handlers
export {
  GitHubOAuthHandler,
  buildGitHubAuthUrl,
  exchangeGitHubCode,
  validateGitHubToken,
  revokeGitHubToken,
} from './oauth/github-oauth.js';

export {
  DropboxOAuthHandler,
  buildDropboxAuthUrl,
  exchangeDropboxCode,
  refreshDropboxToken,
  validateDropboxToken,
  revokeDropboxToken,
} from './oauth/dropbox-oauth.js';

export {
  GoogleOAuthHandler,
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  validateGoogleToken,
  revokeGoogleToken,
  getGoogleTokenInfo,
} from './oauth/google-oauth.js';
