/**
 * @fileoverview Google Drive source for syncing bookmarks with Google Drive
 * Uses Google Drive API v3
 */

import { BaseSource } from './base-source.js';
import { SOURCE_TYPE } from '@marksyncr/types';
import { generateChecksum } from '@marksyncr/core';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').SourceConfig} SourceConfig
 * @typedef {import('@marksyncr/types').SourceCredentials} SourceCredentials
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Google Drive source for syncing bookmarks with a file in Google Drive
 */
export class GoogleDriveSource extends BaseSource {
  /**
   * @param {SourceConfig} config
   * @param {SourceCredentials} credentials
   */
  constructor(config, credentials) {
    super({ ...config, type: SOURCE_TYPE.GOOGLE_DRIVE }, credentials);

    this.fileName = config.fileName ?? 'marksyncr-bookmarks.json';
    this.folderId = config.folderId ?? null; // null = root folder

    /** @type {string | null} */
    this.fileId = null;
  }

  /**
   * Reads bookmark data from Google Drive
   * @returns {Promise<BookmarkFile>}
   */
  async read() {
    if (!this.credentials?.accessToken) {
      throw this.createUnauthorizedError('Google Drive access token required');
    }

    try {
      // First, find the file
      const fileId = await this.findFile();

      if (!fileId) {
        throw this.createNotFoundError('Bookmark file not found in Google Drive');
      }

      this.fileId = fileId;

      // Download file content
      const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Google Drive API error: ${response.status}`);
      }

      const content = await response.text();
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to read from Google Drive: ${error.message}`);
    }
  }

  /**
   * Writes bookmark data to Google Drive
   * @param {BookmarkFile} data
   * @returns {Promise<void>}
   */
  async write(data) {
    if (!this.credentials?.accessToken) {
      throw this.createUnauthorizedError('Google Drive access token required');
    }

    // Update checksum
    const checksum = await generateChecksum(data);
    data.metadata.checksum = checksum;
    data.metadata.lastModified = new Date().toISOString();

    const content = JSON.stringify(data, null, 2);

    // Check if file exists
    if (!this.fileId) {
      this.fileId = await this.findFile();
    }

    if (this.fileId) {
      // Update existing file
      await this.updateFile(this.fileId, content);
    } else {
      // Create new file
      this.fileId = await this.createFile(content);
    }
  }

  /**
   * Finds the bookmark file in Google Drive
   * @returns {Promise<string | null>}
   */
  async findFile() {
    let query = `name='${this.fileName}' and mimeType='application/json' and trashed=false`;

    if (this.folderId) {
      query += ` and '${this.folderId}' in parents`;
    }

    const response = await fetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`);
    }

    const data = await response.json();
    return data.files?.[0]?.id ?? null;
  }

  /**
   * Creates a new file in Google Drive
   * @param {string} content
   * @returns {Promise<string>}
   */
  async createFile(content) {
    const metadata = {
      name: this.fileName,
      mimeType: 'application/json',
    };

    if (this.folderId) {
      metadata.parents = [this.folderId];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: 'application/json' }));

    const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Updates an existing file in Google Drive
   * @param {string} fileId
   * @param {string} content
   * @returns {Promise<void>}
   */
  async updateFile(fileId, content) {
    const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.status}`);
    }
  }

  /**
   * Validates credentials by making a test API call
   * @returns {Promise<boolean>}
   */
  async validateCredentials() {
    if (!this.credentials?.accessToken) return false;

    try {
      const response = await fetch(`${DRIVE_API_BASE}/about?fields=user`, {
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
   * Gets metadata about the Google Drive file
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    const base = await super.getMetadata();

    if (!this.credentials?.accessToken || !this.fileId) {
      return { ...base, fileName: this.fileName };
    }

    try {
      const response = await fetch(
        `${DRIVE_API_BASE}/files/${this.fileId}?fields=id,name,size,modifiedTime`,
        {
          headers: {
            Authorization: `Bearer ${this.credentials.accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return {
          ...base,
          fileId: data.id,
          fileName: data.name,
          size: parseInt(data.size, 10),
          lastModified: data.modifiedTime,
        };
      }
    } catch {
      // Return base metadata if file doesn't exist
    }

    return { ...base, fileName: this.fileName };
  }
}

/**
 * Generates Google OAuth authorization URL
 * @param {string} clientId - Google OAuth client ID
 * @param {string} redirectUri - Redirect URI after authorization
 * @param {string} state - State parameter for CSRF protection
 * @returns {string}
 */
export const getGoogleDriveAuthUrl = (clientId, redirectUri, state) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};
