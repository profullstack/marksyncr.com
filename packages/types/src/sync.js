/**
 * @fileoverview Sync-related type definitions
 */

/**
 * @typedef {'pending' | 'syncing' | 'success' | 'error' | 'conflict'} SyncStatus
 */

/**
 * @typedef {'added' | 'modified' | 'deleted' | 'moved'} ChangeType
 */

/**
 * @typedef {'local' | 'remote' | 'merged'} ConflictResolution
 */

/**
 * @typedef {Object} SyncChange
 * @property {string} id - Bookmark ID that changed
 * @property {ChangeType} type - Type of change
 * @property {string} path - Path to the bookmark in the tree
 * @property {Object} [before] - Previous state (for modifications/deletions)
 * @property {Object} [after] - New state (for additions/modifications)
 * @property {string} timestamp - ISO 8601 timestamp of the change
 */

/**
 * @typedef {Object} SyncConflict
 * @property {string} id - Bookmark ID with conflict
 * @property {SyncChange} localChange - Local change
 * @property {SyncChange} remoteChange - Remote change
 * @property {ConflictResolution} [resolution] - How the conflict was resolved
 * @property {Object} [resolvedValue] - The resolved bookmark value
 */

/**
 * @typedef {Object} SyncResult
 * @property {SyncStatus} status - Overall sync status
 * @property {string} timestamp - ISO 8601 timestamp of sync completion
 * @property {number} pushed - Number of changes pushed to remote
 * @property {number} pulled - Number of changes pulled from remote
 * @property {SyncConflict[]} conflicts - Any conflicts that occurred
 * @property {string} [error] - Error message if status is 'error'
 * @property {string} newChecksum - New checksum after sync
 */

/**
 * @typedef {Object} SyncState
 * @property {string} deviceId - Unique device identifier
 * @property {string} sourceType - Type of sync source
 * @property {string} sourcePath - Path/identifier for the source
 * @property {string} lastChecksum - Last known checksum
 * @property {string} lastSyncAt - ISO 8601 timestamp of last sync
 * @property {Object} [metadata] - Additional sync metadata
 */

/**
 * @typedef {Object} SyncOptions
 * @property {boolean} [dryRun] - If true, don't apply changes, just report what would happen
 * @property {ConflictResolution} [defaultConflictResolution] - Default resolution for conflicts
 * @property {boolean} [force] - Force sync even if checksums match
 * @property {number} [timeout] - Timeout in milliseconds
 */

// Sync status constants
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SUCCESS: 'success',
  ERROR: 'error',
  CONFLICT: 'conflict',
};

// Change type constants
export const CHANGE_TYPE = {
  ADDED: 'added',
  MODIFIED: 'modified',
  DELETED: 'deleted',
  MOVED: 'moved',
};

// Conflict resolution constants
export const CONFLICT_RESOLUTION = {
  LOCAL: 'local',
  REMOTE: 'remote',
  MERGED: 'merged',
};

/**
 * Creates an initial sync state
 * @param {Object} params
 * @param {string} params.deviceId
 * @param {string} params.sourceType
 * @param {string} params.sourcePath
 * @returns {SyncState}
 */
export const createSyncState = ({ deviceId, sourceType, sourcePath }) => ({
  deviceId,
  sourceType,
  sourcePath,
  lastChecksum: '',
  lastSyncAt: new Date().toISOString(),
  metadata: {},
});

/**
 * Creates a sync result object
 * @param {Partial<SyncResult>} params
 * @returns {SyncResult}
 */
export const createSyncResult = (params = {}) => ({
  status: SYNC_STATUS.SUCCESS,
  timestamp: new Date().toISOString(),
  pushed: 0,
  pulled: 0,
  conflicts: [],
  newChecksum: '',
  ...params,
});

/**
 * Creates an error sync result
 * @param {string} error - Error message
 * @returns {SyncResult}
 */
export const createErrorSyncResult = (error) => ({
  status: SYNC_STATUS.ERROR,
  timestamp: new Date().toISOString(),
  pushed: 0,
  pulled: 0,
  conflicts: [],
  error,
  newChecksum: '',
});
