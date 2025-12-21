/**
 * @fileoverview Source type definitions for storage backends
 */

/**
 * @typedef {'local' | 'github' | 'dropbox' | 'google-drive' | 'supabase-cloud'} SourceType
 */

/**
 * @typedef {'free' | 'paid'} SourceTier
 */

/**
 * @typedef {Object} SourceConfig
 * @property {SourceType} type - Type of source
 * @property {string} name - Display name for the source
 * @property {string} [path] - Path to file (for local/github)
 * @property {string} [repository] - Repository name (for github)
 * @property {string} [branch] - Branch name (for github)
 * @property {string} [folderId] - Folder ID (for google-drive/dropbox)
 * @property {string} [fileName] - File name in cloud storage
 */

/**
 * @typedef {Object} SourceCredentials
 * @property {string} [accessToken] - OAuth access token
 * @property {string} [refreshToken] - OAuth refresh token
 * @property {string} [expiresAt] - Token expiration ISO timestamp
 * @property {string} [apiKey] - API key (if applicable)
 */

/**
 * @typedef {Object} SourceInfo
 * @property {SourceType} type
 * @property {string} name
 * @property {string} description
 * @property {SourceTier} tier
 * @property {boolean} requiresAuth
 * @property {string} [authUrl] - OAuth authorization URL
 * @property {string} icon - Icon identifier
 */

// Source type constants
export const SOURCE_TYPE = {
  LOCAL: 'local',
  GITHUB: 'github',
  DROPBOX: 'dropbox',
  GOOGLE_DRIVE: 'google-drive',
  SUPABASE_CLOUD: 'supabase-cloud',
};

// Source tier constants
export const SOURCE_TIER = {
  FREE: 'free',
  PAID: 'paid',
};

/**
 * Source information for UI display
 * @type {Record<SourceType, SourceInfo>}
 */
export const SOURCE_INFO = {
  [SOURCE_TYPE.LOCAL]: {
    type: SOURCE_TYPE.LOCAL,
    name: 'Local File',
    description: 'Sync with a local JSON file on your computer',
    tier: SOURCE_TIER.FREE,
    requiresAuth: false,
    icon: 'folder',
  },
  [SOURCE_TYPE.GITHUB]: {
    type: SOURCE_TYPE.GITHUB,
    name: 'GitHub',
    description: 'Sync with a file in your GitHub repository',
    tier: SOURCE_TIER.FREE,
    requiresAuth: true,
    authUrl: 'https://github.com/login/oauth/authorize',
    icon: 'github',
  },
  [SOURCE_TYPE.DROPBOX]: {
    type: SOURCE_TYPE.DROPBOX,
    name: 'Dropbox',
    description: 'Sync with a file in your Dropbox',
    tier: SOURCE_TIER.FREE,
    requiresAuth: true,
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    icon: 'dropbox',
  },
  [SOURCE_TYPE.GOOGLE_DRIVE]: {
    type: SOURCE_TYPE.GOOGLE_DRIVE,
    name: 'Google Drive',
    description: 'Sync with a file in your Google Drive',
    tier: SOURCE_TIER.FREE,
    requiresAuth: true,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    icon: 'google-drive',
  },
  [SOURCE_TYPE.SUPABASE_CLOUD]: {
    type: SOURCE_TYPE.SUPABASE_CLOUD,
    name: 'MarkSyncr Cloud',
    description: 'Sync with our managed cloud storage (requires subscription)',
    tier: SOURCE_TIER.PAID,
    requiresAuth: true,
    icon: 'cloud',
  },
};

/**
 * Creates a source configuration
 * @param {SourceType} type
 * @param {Partial<SourceConfig>} config
 * @returns {SourceConfig}
 */
export const createSourceConfig = (type, config = {}) => ({
  type,
  name: SOURCE_INFO[type]?.name ?? type,
  ...config,
});

/**
 * Checks if a source type requires authentication
 * @param {SourceType} type
 * @returns {boolean}
 */
export const sourceRequiresAuth = (type) => SOURCE_INFO[type]?.requiresAuth ?? false;

/**
 * Checks if a source type is available for free tier
 * @param {SourceType} type
 * @returns {boolean}
 */
export const isFreeTierSource = (type) => SOURCE_INFO[type]?.tier === SOURCE_TIER.FREE;

/**
 * Gets all free tier sources
 * @returns {SourceInfo[]}
 */
export const getFreeTierSources = () =>
  Object.values(SOURCE_INFO).filter((s) => s.tier === SOURCE_TIER.FREE);

/**
 * Gets all paid tier sources
 * @returns {SourceInfo[]}
 */
export const getPaidTierSources = () =>
  Object.values(SOURCE_INFO).filter((s) => s.tier === SOURCE_TIER.PAID);
