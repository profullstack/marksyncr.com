/**
 * @fileoverview Base source class that all sync sources must extend
 */

import { SOURCE_TYPE } from '@marksyncr/types';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').SourceConfig} SourceConfig
 * @typedef {import('@marksyncr/types').SourceCredentials} SourceCredentials
 */

/**
 * Abstract base class for all sync sources
 * @abstract
 */
export class BaseSource {
  /**
   * @param {SourceConfig} config - Source configuration
   * @param {SourceCredentials} [credentials] - Optional credentials
   */
  constructor(config, credentials = null) {
    if (new.target === BaseSource) {
      throw new Error('BaseSource is abstract and cannot be instantiated directly');
    }

    this.config = config;
    this.credentials = credentials;
    this.type = config.type;
  }

  /**
   * Reads bookmark data from the source
   * @abstract
   * @returns {Promise<BookmarkFile>}
   */
  async read() {
    throw new Error('read() must be implemented by subclass');
  }

  /**
   * Writes bookmark data to the source
   * @abstract
   * @param {BookmarkFile} _data - Bookmark data to write
   * @returns {Promise<void>}
   */
  async write(_data) {
    throw new Error('write() must be implemented by subclass');
  }

  /**
   * Gets the current checksum without reading full data
   * @returns {Promise<string>}
   */
  async getChecksum() {
    // Default implementation reads full data
    const data = await this.read();
    return data.metadata?.checksum ?? '';
  }

  /**
   * Checks if the source is available/accessible
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      await this.read();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validates the source configuration
   * @returns {boolean}
   */
  validateConfig() {
    return Boolean(this.config?.type);
  }

  /**
   * Checks if credentials are valid (for sources that require auth)
   * @returns {Promise<boolean>}
   */
  async validateCredentials() {
    // Override in subclasses that require authentication
    return true;
  }

  /**
   * Refreshes credentials if needed (for OAuth sources)
   * @returns {Promise<SourceCredentials | null>}
   */
  async refreshCredentials() {
    // Override in subclasses that support token refresh
    return this.credentials;
  }

  /**
   * Gets metadata about the source
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    return {
      type: this.type,
      name: this.config.name,
      lastModified: null,
    };
  }

  /**
   * Creates a not found error
   * @param {string} [message]
   * @returns {Error}
   */
  createNotFoundError(message = 'Resource not found') {
    const error = new Error(message);
    error.code = 'NOT_FOUND';
    return error;
  }

  /**
   * Creates an unauthorized error
   * @param {string} [message]
   * @returns {Error}
   */
  createUnauthorizedError(message = 'Unauthorized') {
    const error = new Error(message);
    error.code = 'UNAUTHORIZED';
    return error;
  }

  /**
   * Creates a network error
   * @param {string} [message]
   * @returns {Error}
   */
  createNetworkError(message = 'Network error') {
    const error = new Error(message);
    error.code = 'NETWORK_ERROR';
    return error;
  }
}

/**
 * Factory function to create a source instance
 * @param {SourceConfig} config
 * @param {SourceCredentials} [credentials]
 * @returns {Promise<BaseSource>}
 */
export const createSource = async (config, credentials = null) => {
  const { type } = config;

  switch (type) {
    case SOURCE_TYPE.LOCAL: {
      const { LocalFileSource } = await import('./local-file.js');
      return new LocalFileSource(config, credentials);
    }
    case SOURCE_TYPE.GITHUB: {
      const { GitHubSource } = await import('./github.js');
      return new GitHubSource(config, credentials);
    }
    case SOURCE_TYPE.DROPBOX: {
      const { DropboxSource } = await import('./dropbox.js');
      return new DropboxSource(config, credentials);
    }
    case SOURCE_TYPE.GOOGLE_DRIVE: {
      const { GoogleDriveSource } = await import('./google-drive.js');
      return new GoogleDriveSource(config, credentials);
    }
    case SOURCE_TYPE.SUPABASE_CLOUD: {
      const { SupabaseCloudSource } = await import('./supabase-cloud.js');
      return new SupabaseCloudSource(config, credentials);
    }
    default:
      throw new Error(`Unknown source type: ${type}`);
  }
};
