/**
 * @fileoverview Dropbox source for syncing bookmarks with Dropbox
 * Uses Dropbox API v2
 */

import { BaseSource } from './base-source.js';
import { SOURCE_TYPE } from '@marksyncr/types';
import { generateChecksum } from '@marksyncr/core';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').SourceConfig} SourceConfig
 * @typedef {import('@marksyncr/types').SourceCredentials} SourceCredentials
 */

const DROPBOX_API_BASE = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_BASE = 'https://content.dropboxapi.com/2';

/**
 * Dropbox source for syncing bookmarks with a file in Dropbox
 */
export class DropboxSource extends BaseSource {
  /**
   * @param {SourceConfig} config
   * @param {SourceCredentials} credentials
   */
  constructor(config, credentials) {
    super({ ...config, type: SOURCE_TYPE.DROPBOX }, credentials);

    this.path = config.path ?? '/Apps/MarkSyncr/bookmarks.json';
  }

  /**
   * Reads bookmark data from Dropbox
   * @returns {Promise<BookmarkFile>}
   */
  async read() {
    if (!this.credentials?.accessToken) {
      throw this.createUnauthorizedError('Dropbox access token required');
    }

    try {
      const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({ path: this.path }),
        },
      });

      if (response.status === 409) {
        // Path not found
        throw this.createNotFoundError('Bookmark file not found in Dropbox');
      }

      if (!response.ok) {
        throw new Error(`Dropbox API error: ${response.status}`);
      }

      const content = await response.text();
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to read from Dropbox: ${error.message}`);
    }
  }

  /**
   * Writes bookmark data to Dropbox
   * @param {BookmarkFile} data
   * @returns {Promise<void>}
   */
  async write(data) {
    if (!this.credentials?.accessToken) {
      throw this.createUnauthorizedError('Dropbox access token required');
    }

    // Update checksum
    const checksum = await generateChecksum(data);
    data.metadata.checksum = checksum;
    data.metadata.lastModified = new Date().toISOString();

    const content = JSON.stringify(data, null, 2);

    const response = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: this.path,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Dropbox API error: ${error.error_summary ?? response.status}`);
    }
  }

  /**
   * Validates credentials by making a test API call
   * @returns {Promise<boolean>}
   */
  async validateCredentials() {
    if (!this.credentials?.accessToken) return false;

    try {
      const response = await fetch(`${DROPBOX_API_BASE}/users/get_current_account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Gets metadata about the Dropbox file
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    const base = await super.getMetadata();

    if (!this.credentials?.accessToken) {
      return base;
    }

    try {
      const response = await fetch(`${DROPBOX_API_BASE}/files/get_metadata`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: this.path }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          ...base,
          path: this.path,
          size: data.size,
          lastModified: data.server_modified,
        };
      }
    } catch {
      // Return base metadata if file doesn't exist
    }

    return { ...base, path: this.path };
  }
}

/**
 * Generates Dropbox OAuth authorization URL
 * @param {string} clientId - Dropbox app key
 * @param {string} redirectUri - Redirect URI after authorization
 * @param {string} state - State parameter for CSRF protection
 * @returns {string}
 */
export const getDropboxAuthUrl = (clientId, redirectUri, state) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    token_access_type: 'offline',
    state,
  });

  return `https://www.dropbox.com/oauth2/authorize?${params}`;
};
