/**
 * @fileoverview Version history management for bookmark sync
 * Provides functionality to track, retrieve, and rollback bookmark versions
 */

import { generateChecksum } from './hash-utils.js';

/**
 * @typedef {Object} VersionInfo
 * @property {string} id - Version UUID
 * @property {number} version - Version number
 * @property {string} checksum - Data checksum
 * @property {string} sourceType - Source type (github, dropbox, etc.)
 * @property {string} [sourceName] - Source name
 * @property {string} [deviceName] - Device name
 * @property {Object} changeSummary - Summary of changes
 * @property {string} createdAt - ISO timestamp
 * @property {number} bookmarkCount - Number of bookmarks
 * @property {number} folderCount - Number of folders
 */

/**
 * @typedef {Object} VersionData
 * @property {string} id - Version UUID
 * @property {number} version - Version number
 * @property {import('@marksyncr/types').BookmarkFile} bookmarkData - Full bookmark data
 * @property {string} checksum - Data checksum
 * @property {string} sourceType - Source type
 * @property {string} [sourceName] - Source name
 * @property {string} [deviceId] - Device ID
 * @property {string} [deviceName] - Device name
 * @property {Object} changeSummary - Summary of changes
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} ChangeSummary
 * @property {number} added - Number of bookmarks added
 * @property {number} removed - Number of bookmarks removed
 * @property {number} modified - Number of bookmarks modified
 * @property {string} [type] - Change type (sync, rollback, etc.)
 */

/**
 * Version history manager class
 */
export class VersionHistoryManager {
  /**
   * @param {Object} supabaseClient - Supabase client instance
   */
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  /**
   * Save a new version after sync
   * @param {string} userId - User ID
   * @param {import('@marksyncr/types').BookmarkFile} bookmarkData - Bookmark data
   * @param {Object} options - Additional options
   * @param {string} options.sourceType - Source type
   * @param {string} [options.sourceName] - Source name
   * @param {string} [options.deviceId] - Device ID
   * @param {string} [options.deviceName] - Device name
   * @param {ChangeSummary} [options.changeSummary] - Change summary
   * @returns {Promise<VersionData>}
   */
  async saveVersion(userId, bookmarkData, options = {}) {
    const { sourceType, sourceName, deviceId, deviceName, changeSummary = {} } = options;

    const checksum = await generateChecksum(bookmarkData);

    const { data, error } = await this.supabase.rpc('save_bookmark_version', {
      p_user_id: userId,
      p_bookmark_data: bookmarkData,
      p_checksum: checksum,
      p_source_type: sourceType,
      p_source_name: sourceName || null,
      p_device_id: deviceId || null,
      p_device_name: deviceName || null,
      p_change_summary: changeSummary,
    });

    if (error) {
      throw new Error(`Failed to save version: ${error.message}`);
    }

    return this._mapVersionData(data);
  }

  /**
   * Get version history for a user
   * @param {string} userId - User ID
   * @param {Object} [options] - Pagination options
   * @param {number} [options.limit=20] - Number of versions to retrieve
   * @param {number} [options.offset=0] - Offset for pagination
   * @returns {Promise<VersionInfo[]>}
   */
  async getHistory(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const { data, error } = await this.supabase.rpc('get_version_history', {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`Failed to get version history: ${error.message}`);
    }

    return data.map(this._mapVersionInfo);
  }

  /**
   * Get a specific version's full data
   * @param {string} userId - User ID
   * @param {number} version - Version number
   * @returns {Promise<VersionData>}
   */
  async getVersion(userId, version) {
    const { data, error } = await this.supabase.rpc('get_version_data', {
      p_user_id: userId,
      p_version: version,
    });

    if (error) {
      throw new Error(`Failed to get version: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Version ${version} not found`);
    }

    return this._mapVersionData(data);
  }

  /**
   * Rollback to a specific version
   * @param {string} userId - User ID
   * @param {number} targetVersion - Version to rollback to
   * @returns {Promise<VersionData>}
   */
  async rollback(userId, targetVersion) {
    const { data, error } = await this.supabase.rpc('rollback_to_version', {
      p_user_id: userId,
      p_target_version: targetVersion,
    });

    if (error) {
      throw new Error(`Failed to rollback: ${error.message}`);
    }

    return this._mapVersionData(data);
  }

  /**
   * Get the current version number
   * @param {string} userId - User ID
   * @returns {Promise<number>}
   */
  async getCurrentVersion(userId) {
    const { data, error } = await this.supabase
      .from('cloud_bookmarks')
      .select('version')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw new Error(`Failed to get current version: ${error.message}`);
    }

    return data?.version ?? 0;
  }

  /**
   * Get version retention limit based on user's plan
   * @param {string} userId - User ID
   * @returns {Promise<number>}
   */
  async getRetentionLimit(userId) {
    const { data, error } = await this.supabase.rpc('get_version_retention_limit', {
      p_user_id: userId,
    });

    if (error) {
      throw new Error(`Failed to get retention limit: ${error.message}`);
    }

    return data;
  }

  /**
   * Compare two versions and get the diff
   * @param {string} userId - User ID
   * @param {number} versionA - First version
   * @param {number} versionB - Second version
   * @returns {Promise<Object>}
   */
  async compareVersions(userId, versionA, versionB) {
    const [dataA, dataB] = await Promise.all([
      this.getVersion(userId, versionA),
      this.getVersion(userId, versionB),
    ]);

    return this._computeDiff(dataA.bookmarkData, dataB.bookmarkData);
  }

  /**
   * Map database row to VersionInfo
   * @private
   */
  _mapVersionInfo(row) {
    return {
      id: row.id,
      version: row.version,
      checksum: row.checksum,
      sourceType: row.source_type,
      sourceName: row.source_name,
      deviceName: row.device_name,
      changeSummary: row.change_summary || {},
      createdAt: row.created_at,
      bookmarkCount: row.bookmark_count || 0,
      folderCount: row.folder_count || 0,
    };
  }

  /**
   * Map database row to VersionData
   * @private
   */
  _mapVersionData(row) {
    return {
      id: row.id,
      version: row.version,
      bookmarkData: row.bookmark_data,
      checksum: row.checksum,
      sourceType: row.source_type,
      sourceName: row.source_name,
      deviceId: row.device_id,
      deviceName: row.device_name,
      changeSummary: row.change_summary || {},
      createdAt: row.created_at,
    };
  }

  /**
   * Compute diff between two bookmark datasets
   * @private
   */
  _computeDiff(dataA, dataB) {
    const bookmarksA = this._flattenBookmarks(dataA);
    const bookmarksB = this._flattenBookmarks(dataB);

    const idsA = new Set(bookmarksA.map((b) => b.id));
    const idsB = new Set(bookmarksB.map((b) => b.id));

    const added = bookmarksB.filter((b) => !idsA.has(b.id));
    const removed = bookmarksA.filter((b) => !idsB.has(b.id));

    const mapA = new Map(bookmarksA.map((b) => [b.id, b]));
    const mapB = new Map(bookmarksB.map((b) => [b.id, b]));

    const modified = bookmarksB.filter((b) => {
      if (!idsA.has(b.id)) return false;
      const oldBookmark = mapA.get(b.id);
      return JSON.stringify(oldBookmark) !== JSON.stringify(b);
    });

    return {
      added,
      removed,
      modified,
      summary: {
        added: added.length,
        removed: removed.length,
        modified: modified.length,
      },
    };
  }

  /**
   * Flatten bookmark tree into array
   * @private
   */
  _flattenBookmarks(data) {
    const bookmarks = [];

    const traverse = (items) => {
      for (const item of items || []) {
        bookmarks.push(item);
        if (item.children) {
          traverse(item.children);
        }
      }
    };

    traverse(data?.bookmarks?.toolbar || []);
    traverse(data?.bookmarks?.menu || []);
    traverse(data?.bookmarks?.other || []);

    return bookmarks;
  }
}

/**
 * Create a change summary from diff
 * @param {Object} oldData - Previous bookmark data
 * @param {Object} newData - New bookmark data
 * @returns {ChangeSummary}
 */
export function createChangeSummary(oldData, newData) {
  const manager = new VersionHistoryManager(null);
  const diff = manager._computeDiff(oldData, newData);

  return {
    type: 'sync',
    ...diff.summary,
  };
}

export default VersionHistoryManager;
