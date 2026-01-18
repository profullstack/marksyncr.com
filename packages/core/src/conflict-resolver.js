/**
 * @fileoverview Conflict resolution strategies for two-way bookmark sync
 */

import { CONFLICT_RESOLUTION, CHANGE_TYPE } from '@marksyncr/types';

/**
 * @typedef {import('@marksyncr/types').SyncChange} SyncChange
 * @typedef {import('@marksyncr/types').SyncConflict} SyncConflict
 * @typedef {import('@marksyncr/types').BookmarkItem} BookmarkItem
 */

/**
 * Resolves a conflict using the specified strategy
 * @param {Object} conflict - Conflict object with local and remote changes
 * @param {SyncChange} conflict.localChange - Local change
 * @param {SyncChange} conflict.remoteChange - Remote change
 * @param {string} strategy - Resolution strategy ('local', 'remote', 'merged', 'newest')
 * @returns {SyncConflict} Resolved conflict with resolution details
 */
export const resolveConflict = (conflict, strategy = 'newest') => {
  const { localChange, remoteChange } = conflict;

  /** @type {SyncConflict} */
  const resolved = {
    id: localChange.id,
    localChange,
    remoteChange,
    resolution: null,
    resolvedValue: null,
  };

  switch (strategy) {
    case CONFLICT_RESOLUTION.LOCAL:
      resolved.resolution = CONFLICT_RESOLUTION.LOCAL;
      resolved.resolvedValue = localChange.after ?? localChange.before;
      break;

    case CONFLICT_RESOLUTION.REMOTE:
      resolved.resolution = CONFLICT_RESOLUTION.REMOTE;
      resolved.resolvedValue = remoteChange.after ?? remoteChange.before;
      break;

    case CONFLICT_RESOLUTION.MERGED:
      resolved.resolution = CONFLICT_RESOLUTION.MERGED;
      resolved.resolvedValue = mergeBookmarks(localChange, remoteChange);
      break;

    case 'newest':
    default: {
      // Use the most recent change based on timestamp
      const localTime = new Date(localChange.timestamp).getTime();
      const remoteTime = new Date(remoteChange.timestamp).getTime();

      if (localTime >= remoteTime) {
        resolved.resolution = CONFLICT_RESOLUTION.LOCAL;
        resolved.resolvedValue = localChange.after ?? localChange.before;
      } else {
        resolved.resolution = CONFLICT_RESOLUTION.REMOTE;
        resolved.resolvedValue = remoteChange.after ?? remoteChange.before;
      }
      break;
    }
  }

  return resolved;
};

/**
 * Merges two bookmark items, preferring non-null values and newer timestamps
 * @param {SyncChange} localChange - Local change
 * @param {SyncChange} remoteChange - Remote change
 * @returns {BookmarkItem} Merged bookmark item
 */
export const mergeBookmarks = (localChange, remoteChange) => {
  const local = localChange.after ?? localChange.before;
  const remote = remoteChange.after ?? remoteChange.before;

  if (!local) return remote;
  if (!remote) return local;

  const localTime = new Date(localChange.timestamp).getTime();
  const remoteTime = new Date(remoteChange.timestamp).getTime();

  // Start with the newer item as base
  const base = localTime >= remoteTime ? { ...local } : { ...remote };
  const other = localTime >= remoteTime ? remote : local;

  // Merge specific fields
  // Title: prefer non-empty, then newer
  if (!base.title && other.title) {
    base.title = other.title;
  }

  // URL: prefer the one that changed most recently
  // If both changed, use the newer one (already in base)

  // Children: merge recursively if both are folders
  if (base.type === 'folder' && other.type === 'folder') {
    base.children = mergeChildren(base.children ?? [], other.children ?? []);
  }

  // Update modification timestamp
  base.dateModified = new Date().toISOString();

  return base;
};

/**
 * Merges two arrays of bookmark children
 * @param {BookmarkItem[]} localChildren - Local children
 * @param {BookmarkItem[]} remoteChildren - Remote children
 * @returns {BookmarkItem[]} Merged children array
 */
export const mergeChildren = (localChildren, remoteChildren) => {
  const merged = new Map();

  // Add all local children
  for (const child of localChildren) {
    merged.set(child.id, child);
  }

  // Merge or add remote children
  for (const child of remoteChildren) {
    if (!merged.has(child.id)) {
      // New item from remote
      merged.set(child.id, child);
    }
    // If exists in both, keep local (already added)
    // More sophisticated merging could be done here
  }

  return Array.from(merged.values());
};

/**
 * Resolves a delete vs modify conflict
 * @param {SyncChange} deleteChange - The deletion change
 * @param {SyncChange} modifyChange - The modification change
 * @param {string} strategy - Resolution strategy
 * @returns {SyncConflict} Resolved conflict
 */
export const resolveDeleteModifyConflict = (deleteChange, modifyChange, strategy = 'keep') => {
  const isLocalDelete = deleteChange.type === CHANGE_TYPE.DELETED;

  /** @type {SyncConflict} */
  const resolved = {
    id: deleteChange.id,
    localChange: isLocalDelete ? deleteChange : modifyChange,
    remoteChange: isLocalDelete ? modifyChange : deleteChange,
    resolution: null,
    resolvedValue: null,
  };

  switch (strategy) {
    case 'delete':
      // Honor the deletion
      resolved.resolution = isLocalDelete ? CONFLICT_RESOLUTION.LOCAL : CONFLICT_RESOLUTION.REMOTE;
      resolved.resolvedValue = null; // Indicates deletion
      break;

    case 'keep':
    default:
      // Keep the modified version (safer default)
      resolved.resolution = isLocalDelete ? CONFLICT_RESOLUTION.REMOTE : CONFLICT_RESOLUTION.LOCAL;
      resolved.resolvedValue = modifyChange.after;
      break;
  }

  return resolved;
};

/**
 * Batch resolves multiple conflicts with the same strategy
 * @param {Array<{localChange: SyncChange, remoteChange: SyncChange}>} conflicts
 * @param {string} strategy - Resolution strategy
 * @returns {SyncConflict[]} Array of resolved conflicts
 */
export const resolveAllConflicts = (conflicts, strategy = 'newest') => {
  return conflicts.map((conflict) => {
    const { localChange, remoteChange } = conflict;

    // Check for delete vs modify conflicts
    if (localChange.type === CHANGE_TYPE.DELETED && remoteChange.type === CHANGE_TYPE.MODIFIED) {
      return resolveDeleteModifyConflict(localChange, remoteChange, 'keep');
    }
    if (localChange.type === CHANGE_TYPE.MODIFIED && remoteChange.type === CHANGE_TYPE.DELETED) {
      return resolveDeleteModifyConflict(remoteChange, localChange, 'keep');
    }

    // Regular conflict resolution
    return resolveConflict(conflict, strategy);
  });
};

/**
 * Determines if a conflict requires user intervention
 * @param {Object} conflict - Conflict object
 * @returns {boolean} True if manual resolution is recommended
 */
export const requiresManualResolution = (conflict) => {
  const { localChange, remoteChange } = conflict;

  // Delete vs modify always needs attention
  if (
    (localChange.type === CHANGE_TYPE.DELETED && remoteChange.type === CHANGE_TYPE.MODIFIED) ||
    (localChange.type === CHANGE_TYPE.MODIFIED && remoteChange.type === CHANGE_TYPE.DELETED)
  ) {
    return true;
  }

  // Both modified with different URLs
  if (
    localChange.type === CHANGE_TYPE.MODIFIED &&
    remoteChange.type === CHANGE_TYPE.MODIFIED &&
    localChange.after?.url !== remoteChange.after?.url
  ) {
    return true;
  }

  return false;
};

/**
 * Creates a conflict summary for user display
 * @param {SyncConflict} conflict - Resolved conflict
 * @returns {Object} Human-readable conflict summary
 */
export const createConflictSummary = (conflict) => {
  const { localChange, remoteChange, resolution, resolvedValue } = conflict;

  return {
    id: conflict.id,
    title:
      resolvedValue?.title ?? localChange.after?.title ?? remoteChange.after?.title ?? 'Unknown',
    localAction: localChange.type,
    remoteAction: remoteChange.type,
    resolution,
    resolvedTo:
      resolution === CONFLICT_RESOLUTION.LOCAL
        ? 'local version'
        : resolution === CONFLICT_RESOLUTION.REMOTE
          ? 'remote version'
          : 'merged version',
  };
};
