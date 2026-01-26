/**
 * @fileoverview Main sync engine for two-way bookmark synchronization
 */

import { SYNC_STATUS, createSyncResult, createErrorSyncResult } from '@marksyncr/types';
import { generateChecksum, hasContentChanged } from './hash-utils.js';
import { detectChanges, findConflicts, summarizeChanges } from './diff-engine.js';
import { resolveAllConflicts } from './conflict-resolver.js';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').BookmarkData} BookmarkData
 * @typedef {import('@marksyncr/types').SyncResult} SyncResult
 * @typedef {import('@marksyncr/types').SyncOptions} SyncOptions
 * @typedef {import('@marksyncr/types').SyncState} SyncState
 */

/**
 * @typedef {Object} SyncSource
 * @property {() => Promise<BookmarkFile>} read - Read bookmarks from source
 * @property {(data: BookmarkFile) => Promise<void>} write - Write bookmarks to source
 * @property {() => Promise<string>} getChecksum - Get current checksum without full read
 */

/**
 * Main sync engine class
 */
export class SyncEngine {
  /**
   * @param {Object} options
   * @param {SyncSource} options.source - The remote sync source
   * @param {string} options.deviceId - Current device identifier
   * @param {SyncState} [options.lastSyncState] - Previous sync state
   */
  constructor({ source, deviceId, lastSyncState = null }) {
    this.source = source;
    this.deviceId = deviceId;
    this.lastSyncState = lastSyncState;
  }

  /**
   * Performs a full two-way sync
   * @param {BookmarkData} localBookmarks - Current local bookmarks
   * @param {SyncOptions} [options] - Sync options
   * @returns {Promise<{result: SyncResult, mergedBookmarks: BookmarkData | null}>}
   */
  async sync(localBookmarks, options = {}) {
    const { dryRun = false, defaultConflictResolution = 'newest', force = false } = options;

    try {
      // Step 1: Read remote bookmarks
      let remoteFile;
      try {
        remoteFile = await this.source.read();
      } catch (error) {
        // If remote doesn't exist, this is first sync - push local
        if (error.code === 'NOT_FOUND' || error.message?.includes('not found')) {
          return this.initialSync(localBookmarks, dryRun);
        }
        throw error;
      }

      const remoteBookmarks = remoteFile.bookmarks;
      const remoteChecksum = remoteFile.metadata.checksum;

      // Step 2: Generate local checksum
      const localChecksum = await generateChecksum({ bookmarks: localBookmarks });

      // Step 3: Check if sync is needed
      if (!force && !hasContentChanged(localChecksum, remoteChecksum)) {
        // No changes detected
        return {
          result: createSyncResult({
            status: SYNC_STATUS.SUCCESS,
            newChecksum: localChecksum,
          }),
          mergedBookmarks: null,
        };
      }

      // Step 4: Detect changes
      const { localChanges, remoteChanges } = detectChanges(localBookmarks, remoteBookmarks);

      // Step 5: Find and resolve conflicts
      const conflicts = findConflicts(localChanges, remoteChanges);
      const resolvedConflicts = resolveAllConflicts(conflicts, defaultConflictResolution);

      // Step 6: Merge bookmarks
      const mergedBookmarks = this.mergeBookmarkData(
        localBookmarks,
        remoteBookmarks,
        localChanges,
        remoteChanges,
        resolvedConflicts
      );

      // Step 7: Calculate new checksum
      const newChecksum = await generateChecksum({ bookmarks: mergedBookmarks });

      // Step 8: Apply changes (if not dry run)
      if (!dryRun) {
        // Write merged data to remote
        const newFile = this.createBookmarkFile(mergedBookmarks, newChecksum);
        await this.source.write(newFile);
      }

      // Step 9: Create result
      const localSummary = summarizeChanges(localChanges);
      const remoteSummary = summarizeChanges(remoteChanges);

      const result = createSyncResult({
        status: resolvedConflicts.length > 0 ? SYNC_STATUS.CONFLICT : SYNC_STATUS.SUCCESS,
        pushed: localSummary.total - conflicts.length,
        pulled: remoteSummary.total - conflicts.length,
        conflicts: resolvedConflicts,
        newChecksum,
      });

      return { result, mergedBookmarks };
    } catch (error) {
      return {
        result: createErrorSyncResult(error.message ?? 'Unknown sync error'),
        mergedBookmarks: null,
      };
    }
  }

  /**
   * Performs initial sync when remote doesn't exist
   * @param {BookmarkData} localBookmarks - Local bookmarks to push
   * @param {boolean} dryRun - Whether to actually write
   * @returns {Promise<{result: SyncResult, mergedBookmarks: BookmarkData}>}
   */
  async initialSync(localBookmarks, dryRun = false) {
    const checksum = await generateChecksum({ bookmarks: localBookmarks });

    if (!dryRun) {
      const file = this.createBookmarkFile(localBookmarks, checksum);
      await this.source.write(file);
    }

    return {
      result: createSyncResult({
        status: SYNC_STATUS.SUCCESS,
        pushed: this.countBookmarks(localBookmarks),
        pulled: 0,
        newChecksum: checksum,
      }),
      mergedBookmarks: localBookmarks,
    };
  }

  /**
   * Merges local and remote bookmark data based on detected changes
   * @param {BookmarkData} local - Local bookmarks
   * @param {BookmarkData} remote - Remote bookmarks
   * @param {Array} localChanges - Changes detected locally
   * @param {Array} remoteChanges - Changes detected remotely
   * @param {Array} resolvedConflicts - Resolved conflicts
   * @returns {BookmarkData} Merged bookmark data
   */
  mergeBookmarkData(local, remote, localChanges, remoteChanges, resolvedConflicts) {
    // Create a deep copy of local as base
    // Use structuredClone for better memory efficiency than JSON.parse(JSON.stringify())
    const merged = structuredClone(local);

    // Create a map of conflict resolutions for quick lookup
    const conflictResolutions = new Map();
    for (const conflict of resolvedConflicts) {
      conflictResolutions.set(conflict.id, conflict);
    }

    // Apply remote changes that aren't conflicts
    for (const change of remoteChanges) {
      // Skip if this is a conflict (already resolved)
      if (conflictResolutions.has(change.id)) {
        continue;
      }

      // Apply the remote change
      this.applyChange(merged, change);
    }

    // Apply conflict resolutions
    for (const conflict of resolvedConflicts) {
      if (conflict.resolvedValue) {
        this.applyResolvedConflict(merged, conflict);
      }
    }

    return merged;
  }

  /**
   * Applies a single change to the bookmark data
   * @param {BookmarkData} bookmarks - Bookmark data to modify
   * @param {Object} change - Change to apply
   */
  applyChange(bookmarks, change) {
    const { id, type, path, after } = change;

    // Parse the path to find the target location
    const pathParts = path.split('/');
    const rootFolder = pathParts[0]; // 'toolbar', 'menu', or 'other'

    if (!bookmarks[rootFolder]) return;

    // Find the parent folder
    let parent = bookmarks[rootFolder];
    for (let i = 1; i < pathParts.length - 1; i++) {
      const folderName = pathParts[i];
      const folder = parent.children?.find((c) => c.title === folderName && c.type === 'folder');
      if (!folder) return;
      parent = folder;
    }

    // Apply the change based on type
    switch (type) {
      case 'added':
        if (after && !parent.children?.some((c) => c.id === id)) {
          parent.children = parent.children ?? [];
          parent.children.push(after);
        }
        break;

      case 'modified':
        if (after && parent.children) {
          const index = parent.children.findIndex((c) => c.id === id);
          if (index !== -1) {
            parent.children[index] = { ...parent.children[index], ...after };
          }
        }
        break;

      case 'deleted':
        if (parent.children) {
          parent.children = parent.children.filter((c) => c.id !== id);
        }
        break;
    }
  }

  /**
   * Applies a resolved conflict to the bookmark data
   * @param {BookmarkData} bookmarks - Bookmark data to modify
   * @param {Object} conflict - Resolved conflict
   */
  applyResolvedConflict(bookmarks, conflict) {
    const { id, resolvedValue, localChange, remoteChange } = conflict;
    const path = localChange?.path ?? remoteChange?.path;

    if (!path || !resolvedValue) return;

    // Use the same logic as applyChange but with the resolved value
    this.applyChange(bookmarks, {
      id,
      type: 'modified',
      path,
      after: resolvedValue,
    });
  }

  /**
   * Creates a bookmark file with metadata
   * @param {BookmarkData} bookmarks - Bookmark data
   * @param {string} checksum - Calculated checksum
   * @returns {BookmarkFile}
   */
  createBookmarkFile(bookmarks, checksum) {
    return {
      version: '1.0',
      schemaVersion: 1,
      metadata: {
        lastModified: new Date().toISOString(),
        lastSyncedBy: this.deviceId,
        checksum,
      },
      bookmarks,
    };
  }

  /**
   * Counts total bookmarks in a bookmark data structure
   * @param {BookmarkData} bookmarks - Bookmark data
   * @returns {number} Total count
   */
  countBookmarks(bookmarks) {
    let count = 0;

    const countChildren = (children) => {
      for (const child of children ?? []) {
        count++;
        if (child.children) {
          countChildren(child.children);
        }
      }
    };

    countChildren(bookmarks.toolbar?.children);
    countChildren(bookmarks.menu?.children);
    countChildren(bookmarks.other?.children);

    return count;
  }
}

/**
 * Creates a new sync engine instance
 * @param {Object} options - Engine options
 * @returns {SyncEngine}
 */
export const createSyncEngine = (options) => new SyncEngine(options);
