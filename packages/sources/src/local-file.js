/**
 * @fileoverview Local file source using File System Access API (browser) or Node.js fs (server)
 */

import { BaseSource } from './base-source.js';
import { SOURCE_TYPE, createEmptyBookmarkFile } from '@marksyncr/types';
import { generateChecksum } from '@marksyncr/core';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').SourceConfig} SourceConfig
 */

/**
 * Local file source for syncing bookmarks with a local JSON file
 * Works in both browser (File System Access API) and Node.js environments
 */
export class LocalFileSource extends BaseSource {
  /**
   * @param {SourceConfig} config
   */
  constructor(config) {
    super({ ...config, type: SOURCE_TYPE.LOCAL });

    /** @type {FileSystemFileHandle | null} */
    this.fileHandle = null;

    /** @type {string | null} */
    this.filePath = config.path ?? null;
  }

  /**
   * Sets the file handle (for browser File System Access API)
   * @param {FileSystemFileHandle} handle
   */
  setFileHandle(handle) {
    this.fileHandle = handle;
  }

  /**
   * Sets the file path (for Node.js)
   * @param {string} path
   */
  setFilePath(path) {
    this.filePath = path;
  }

  /**
   * Reads bookmark data from the local file
   * @returns {Promise<BookmarkFile>}
   */
  async read() {
    try {
      const content = await this.readFileContent();
      const data = JSON.parse(content);

      // Validate the data structure
      if (!this.isValidBookmarkFile(data)) {
        throw new Error('Invalid bookmark file format');
      }

      return data;
    } catch (error) {
      if (error.name === 'NotFoundError' || error.code === 'ENOENT') {
        throw this.createNotFoundError('Bookmark file not found');
      }
      throw error;
    }
  }

  /**
   * Writes bookmark data to the local file
   * @param {BookmarkFile} data
   * @returns {Promise<void>}
   */
  async write(data) {
    // Update checksum before writing
    const checksum = await generateChecksum(data);
    data.metadata.checksum = checksum;
    data.metadata.lastModified = new Date().toISOString();

    const content = JSON.stringify(data, null, 2);
    await this.writeFileContent(content);
  }

  /**
   * Reads file content based on environment
   * @returns {Promise<string>}
   */
  async readFileContent() {
    // Browser environment with File System Access API
    if (this.fileHandle) {
      const file = await this.fileHandle.getFile();
      return file.text();
    }

    // Node.js environment
    if (this.filePath && typeof process !== 'undefined') {
      const { readFile } = await import('node:fs/promises');
      return readFile(this.filePath, 'utf-8');
    }

    throw new Error('No file handle or path configured');
  }

  /**
   * Writes file content based on environment
   * @param {string} content
   * @returns {Promise<void>}
   */
  async writeFileContent(content) {
    // Browser environment with File System Access API
    if (this.fileHandle) {
      const writable = await this.fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }

    // Node.js environment
    if (this.filePath && typeof process !== 'undefined') {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(this.filePath, content, 'utf-8');
      return;
    }

    throw new Error('No file handle or path configured');
  }

  /**
   * Checks if the source is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      if (this.fileHandle) {
        // Check if we still have permission
        const permission = await this.fileHandle.queryPermission({ mode: 'readwrite' });
        return permission === 'granted';
      }

      if (this.filePath && typeof process !== 'undefined') {
        const { access, constants } = await import('node:fs/promises');
        await access(this.filePath, constants.R_OK | constants.W_OK);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Validates the source configuration
   * @returns {boolean}
   */
  validateConfig() {
    return super.validateConfig() && (Boolean(this.fileHandle) || Boolean(this.filePath));
  }

  /**
   * Gets metadata about the file
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    const base = await super.getMetadata();

    try {
      if (this.fileHandle) {
        const file = await this.fileHandle.getFile();
        return {
          ...base,
          fileName: file.name,
          size: file.size,
          lastModified: new Date(file.lastModified).toISOString(),
        };
      }

      if (this.filePath && typeof process !== 'undefined') {
        const { stat } = await import('node:fs/promises');
        const stats = await stat(this.filePath);
        return {
          ...base,
          fileName: this.filePath.split('/').pop(),
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        };
      }
    } catch {
      // Return base metadata if file doesn't exist yet
    }

    return base;
  }

  /**
   * Validates that the data is a valid bookmark file
   * @param {any} data
   * @returns {boolean}
   */
  isValidBookmarkFile(data) {
    return (
      data &&
      typeof data === 'object' &&
      data.version &&
      data.bookmarks &&
      typeof data.bookmarks === 'object'
    );
  }

  /**
   * Creates a new bookmark file at the configured location
   * @returns {Promise<BookmarkFile>}
   */
  async createNewFile() {
    const emptyFile = createEmptyBookmarkFile();
    await this.write(emptyFile);
    return emptyFile;
  }

  /**
   * Prompts user to select a file (browser only)
   * @returns {Promise<FileSystemFileHandle>}
   */
  static async promptForFile() {
    if (typeof window === 'undefined' || !('showOpenFilePicker' in window)) {
      throw new Error('File System Access API not available');
    }

    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] },
        },
      ],
      multiple: false,
    });

    return handle;
  }

  /**
   * Prompts user to create a new file (browser only)
   * @param {string} [suggestedName='bookmarks.json']
   * @returns {Promise<FileSystemFileHandle>}
   */
  static async promptForNewFile(suggestedName = 'bookmarks.json') {
    if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
      throw new Error('File System Access API not available');
    }

    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });

    return handle;
  }
}
