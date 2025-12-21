/**
 * @fileoverview GitHub source for syncing bookmarks with a GitHub repository
 * Uses GitHub REST API to read/write bookmark files
 */

import { BaseSource } from './base-source.js';
import { SOURCE_TYPE } from '@marksyncr/types';
import { generateChecksum } from '@marksyncr/core';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').SourceConfig} SourceConfig
 * @typedef {import('@marksyncr/types').SourceCredentials} SourceCredentials
 */

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * GitHub source for syncing bookmarks with a file in a GitHub repository
 */
export class GitHubSource extends BaseSource {
  /**
   * @param {SourceConfig} config
   * @param {SourceCredentials} credentials
   */
  constructor(config, credentials) {
    super({ ...config, type: SOURCE_TYPE.GITHUB }, credentials);

    this.repository = config.repository; // e.g., "username/repo"
    this.branch = config.branch ?? 'main';
    this.path = config.path ?? 'bookmarks.json';

    /** @type {string | null} */
    this.fileSha = null;
  }

  /**
   * Reads bookmark data from GitHub
   * @returns {Promise<BookmarkFile>}
   */
  async read() {
    if (!this.credentials?.accessToken) {
      throw this.createUnauthorizedError('GitHub access token required');
    }

    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${this.repository}/contents/${this.path}?ref=${this.branch}`,
        {
          headers: {
            Authorization: `Bearer ${this.credentials.accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (response.status === 404) {
        throw this.createNotFoundError('Bookmark file not found in repository');
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();

      // Store SHA for updates
      this.fileSha = data.sha;

      // Decode base64 content
      const content = atob(data.content);
      const bookmarkData = JSON.parse(content);

      return bookmarkData;
    } catch (error) {
      if (error.code === 'NOT_FOUND') throw error;
      throw new Error(`Failed to read from GitHub: ${error.message}`);
    }
  }

  /**
   * Writes bookmark data to GitHub
   * @param {BookmarkFile} data
   * @returns {Promise<void>}
   */
  async write(data) {
    if (!this.credentials?.accessToken) {
      throw this.createUnauthorizedError('GitHub access token required');
    }

    // Update checksum
    const checksum = await generateChecksum(data);
    data.metadata.checksum = checksum;
    data.metadata.lastModified = new Date().toISOString();

    const content = JSON.stringify(data, null, 2);
    const encodedContent = btoa(content);

    const body = {
      message: `Update bookmarks - ${new Date().toISOString()}`,
      content: encodedContent,
      branch: this.branch,
    };

    // Include SHA if updating existing file
    if (this.fileSha) {
      body.sha = this.fileSha;
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${this.repository}/contents/${this.path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.credentials.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`GitHub API error: ${error.message ?? response.status}`);
    }

    const result = await response.json();
    this.fileSha = result.content.sha;
  }

  /**
   * Validates credentials by making a test API call
   * @returns {Promise<boolean>}
   */
  async validateCredentials() {
    if (!this.credentials?.accessToken) return false;

    try {
      const response = await fetch(`${GITHUB_API_BASE}/user`, {
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
   * Validates the source configuration
   * @returns {boolean}
   */
  validateConfig() {
    return super.validateConfig() && Boolean(this.repository);
  }

  /**
   * Gets metadata about the GitHub file
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    const base = await super.getMetadata();

    return {
      ...base,
      repository: this.repository,
      branch: this.branch,
      path: this.path,
    };
  }
}

/**
 * Generates GitHub OAuth authorization URL
 * @param {string} clientId - GitHub OAuth app client ID
 * @param {string} redirectUri - Redirect URI after authorization
 * @param {string} state - State parameter for CSRF protection
 * @returns {string}
 */
export const getGitHubAuthUrl = (clientId, redirectUri, state) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo',
    state,
  });

  return `https://github.com/login/oauth/authorize?${params}`;
};
