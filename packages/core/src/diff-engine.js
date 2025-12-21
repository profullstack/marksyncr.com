/**
 * @fileoverview Diff engine for detecting changes between bookmark trees
 */

import { CHANGE_TYPE } from '@marksyncr/types';

/**
 * Change types constant for external use
 */
export const CHANGE_TYPES = CHANGE_TYPE;

/**
 * @typedef {import('@marksyncr/types').BookmarkItem} BookmarkItem
 * @typedef {import('@marksyncr/types').BookmarkData} BookmarkData
 * @typedef {import('@marksyncr/types').SyncChange} SyncChange
 */

/**
 * Creates a flat map of all bookmarks by ID for efficient lookup
 * @param {BookmarkData} bookmarks - Bookmark data structure
 * @returns {Map<string, {item: BookmarkItem, path: string}>}
 */
export const flattenBookmarks = (bookmarks) => {
  const map = new Map();

  const traverse = (items, path = '') => {
    for (const item of items) {
      const itemPath = path ? `${path}/${item.title}` : item.title;
      map.set(item.id, { item, path: itemPath });

      if (item.children?.length > 0) {
        traverse(item.children, itemPath);
      }
    }
  };

  // Traverse all root folders
  if (bookmarks.toolbar?.children) {
    traverse(bookmarks.toolbar.children, 'toolbar');
  }
  if (bookmarks.menu?.children) {
    traverse(bookmarks.menu.children, 'menu');
  }
  if (bookmarks.other?.children) {
    traverse(bookmarks.other.children, 'other');
  }

  return map;
};

/**
 * Compares two bookmark items to check if they are equal
 * @param {BookmarkItem} item1 - First bookmark item
 * @param {BookmarkItem} item2 - Second bookmark item
 * @returns {boolean} True if items are equal
 */
export const areBookmarksEqual = (item1, item2) => {
  if (item1.type !== item2.type) return false;
  if (item1.title !== item2.title) return false;
  if (item1.url !== item2.url) return false;

  // Don't compare children here - that's handled by the diff algorithm
  return true;
};

/**
 * Detects changes between two bookmark data structures
 * @param {BookmarkData} localBookmarks - Local bookmark data
 * @param {BookmarkData} remoteBookmarks - Remote bookmark data
 * @returns {Object} Object containing local and remote changes
 */
export const detectChanges = (localBookmarks, remoteBookmarks) => {
  const localMap = flattenBookmarks(localBookmarks);
  const remoteMap = flattenBookmarks(remoteBookmarks);

  /** @type {SyncChange[]} */
  const localChanges = [];
  /** @type {SyncChange[]} */
  const remoteChanges = [];

  const now = new Date().toISOString();

  // Find items added or modified locally (exist in local but not in remote, or different)
  for (const [id, { item: localItem, path }] of localMap) {
    const remoteEntry = remoteMap.get(id);

    if (!remoteEntry) {
      // Item exists locally but not remotely - added locally or deleted remotely
      localChanges.push({
        id,
        type: CHANGE_TYPE.ADDED,
        path,
        after: localItem,
        timestamp: localItem.dateModified ?? localItem.dateAdded ?? now,
      });
    } else if (!areBookmarksEqual(localItem, remoteEntry.item)) {
      // Item exists in both but is different - modified
      localChanges.push({
        id,
        type: CHANGE_TYPE.MODIFIED,
        path,
        before: remoteEntry.item,
        after: localItem,
        timestamp: localItem.dateModified ?? now,
      });
    }
  }

  // Find items added or modified remotely (exist in remote but not in local, or different)
  for (const [id, { item: remoteItem, path }] of remoteMap) {
    const localEntry = localMap.get(id);

    if (!localEntry) {
      // Item exists remotely but not locally - added remotely or deleted locally
      remoteChanges.push({
        id,
        type: CHANGE_TYPE.ADDED,
        path,
        after: remoteItem,
        timestamp: remoteItem.dateModified ?? remoteItem.dateAdded ?? now,
      });
    } else if (!areBookmarksEqual(remoteItem, localEntry.item)) {
      // Item exists in both but is different - modified
      // Only add if not already in localChanges (avoid duplicates)
      const alreadyTracked = localChanges.some((c) => c.id === id);
      if (!alreadyTracked) {
        remoteChanges.push({
          id,
          type: CHANGE_TYPE.MODIFIED,
          path,
          before: localEntry.item,
          after: remoteItem,
          timestamp: remoteItem.dateModified ?? now,
        });
      }
    }
  }

  // Detect deletions
  // Items in remote but not in local could be:
  // 1. Added remotely (handled above)
  // 2. Deleted locally
  // We need additional context (previous sync state) to distinguish these

  return {
    localChanges,
    remoteChanges,
    localMap,
    remoteMap,
  };
};

/**
 * Detects deletions by comparing current state with previous sync state
 * @param {Map<string, Object>} currentMap - Current bookmark map
 * @param {Map<string, Object>} previousMap - Previous sync state bookmark map
 * @returns {SyncChange[]} Array of deletion changes
 */
export const detectDeletions = (currentMap, previousMap) => {
  /** @type {SyncChange[]} */
  const deletions = [];
  const now = new Date().toISOString();

  for (const [id, { item, path }] of previousMap) {
    if (!currentMap.has(id)) {
      deletions.push({
        id,
        type: CHANGE_TYPE.DELETED,
        path,
        before: item,
        timestamp: now,
      });
    }
  }

  return deletions;
};

/**
 * Finds conflicts between local and remote changes
 * @param {SyncChange[]} localChanges - Local changes
 * @param {SyncChange[]} remoteChanges - Remote changes
 * @returns {Array<{localChange: SyncChange, remoteChange: SyncChange}>}
 */
export const findConflicts = (localChanges, remoteChanges) => {
  const conflicts = [];

  for (const localChange of localChanges) {
    const remoteChange = remoteChanges.find((rc) => rc.id === localChange.id);

    if (remoteChange) {
      // Same item changed in both places - potential conflict
      conflicts.push({
        localChange,
        remoteChange,
      });
    }
  }

  return conflicts;
};

/**
 * Gets the path to a bookmark's parent folder
 * @param {string} path - Full path to the bookmark
 * @returns {string} Parent folder path
 */
export const getParentPath = (path) => {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
};

/**
 * Calculates a summary of changes
 * @param {SyncChange[]} changes - Array of changes
 * @returns {Object} Summary object with counts
 */
export const summarizeChanges = (changes) => {
  const summary = {
    added: 0,
    modified: 0,
    deleted: 0,
    moved: 0,
    total: changes.length,
  };

  for (const change of changes) {
    switch (change.type) {
      case CHANGE_TYPE.ADDED:
        summary.added++;
        break;
      case CHANGE_TYPE.MODIFIED:
        summary.modified++;
        break;
      case CHANGE_TYPE.DELETED:
        summary.deleted++;
        break;
      case CHANGE_TYPE.MOVED:
        summary.moved++;
        break;
    }
  }

  return summary;
};

/**
 * Checks if there are any changes between two bookmark data structures
 * @param {BookmarkData} localBookmarks - Local bookmark data
 * @param {BookmarkData} remoteBookmarks - Remote bookmark data
 * @returns {boolean} True if there are changes
 */
export const hasChanges = (localBookmarks, remoteBookmarks) => {
  const { localChanges, remoteChanges } = detectChanges(localBookmarks, remoteBookmarks);
  return localChanges.length > 0 || remoteChanges.length > 0;
};

/**
 * Applies changes to a bookmark data structure
 * @param {BookmarkData} bookmarks - Base bookmark data
 * @param {SyncChange[]} changes - Changes to apply
 * @returns {BookmarkData} Updated bookmark data
 */
export const applyChanges = (bookmarks, changes) => {
  // Deep clone the bookmarks to avoid mutation
  const result = JSON.parse(JSON.stringify(bookmarks));
  
  for (const change of changes) {
    switch (change.type) {
      case CHANGE_TYPE.ADDED:
        // Add the bookmark to the appropriate location
        if (change.after) {
          addBookmarkToPath(result, change.path, change.after);
        }
        break;
      case CHANGE_TYPE.MODIFIED:
        // Update the bookmark at the location
        if (change.after) {
          updateBookmarkAtPath(result, change.path, change.after);
        }
        break;
      case CHANGE_TYPE.DELETED:
        // Remove the bookmark from the location
        removeBookmarkAtPath(result, change.path);
        break;
      case CHANGE_TYPE.MOVED:
        // Move the bookmark to a new location
        if (change.before && change.after) {
          removeBookmarkAtPath(result, change.path);
          addBookmarkToPath(result, change.newPath || change.path, change.after);
        }
        break;
    }
  }
  
  return result;
};

/**
 * Helper to add a bookmark to a specific path
 * @param {BookmarkData} bookmarks - Bookmark data
 * @param {string} path - Path to add to
 * @param {BookmarkItem} item - Item to add
 */
const addBookmarkToPath = (bookmarks, path, item) => {
  const parts = path.split('/');
  const rootKey = parts[0]; // toolbar, menu, or other
  
  if (!bookmarks[rootKey]) {
    bookmarks[rootKey] = { id: rootKey, title: rootKey, type: 'folder', children: [] };
  }
  
  let current = bookmarks[rootKey];
  
  // Navigate to parent folder
  for (let i = 1; i < parts.length - 1; i++) {
    const folderName = parts[i];
    let folder = current.children?.find(c => c.title === folderName && c.type === 'folder');
    if (!folder) {
      folder = { id: `folder-${Date.now()}`, title: folderName, type: 'folder', children: [] };
      current.children = current.children || [];
      current.children.push(folder);
    }
    current = folder;
  }
  
  // Add the item
  current.children = current.children || [];
  current.children.push(item);
};

/**
 * Helper to update a bookmark at a specific path
 * @param {BookmarkData} bookmarks - Bookmark data
 * @param {string} path - Path to update
 * @param {BookmarkItem} item - Updated item
 */
const updateBookmarkAtPath = (bookmarks, path, item) => {
  const parts = path.split('/');
  const rootKey = parts[0];
  
  if (!bookmarks[rootKey]) return;
  
  let current = bookmarks[rootKey];
  
  // Navigate to parent folder
  for (let i = 1; i < parts.length - 1; i++) {
    const folderName = parts[i];
    const folder = current.children?.find(c => c.title === folderName && c.type === 'folder');
    if (!folder) return;
    current = folder;
  }
  
  // Find and update the item
  const itemName = parts[parts.length - 1];
  const index = current.children?.findIndex(c => c.title === itemName);
  if (index !== undefined && index >= 0) {
    current.children[index] = { ...current.children[index], ...item };
  }
};

/**
 * Helper to remove a bookmark at a specific path
 * @param {BookmarkData} bookmarks - Bookmark data
 * @param {string} path - Path to remove
 */
const removeBookmarkAtPath = (bookmarks, path) => {
  const parts = path.split('/');
  const rootKey = parts[0];
  
  if (!bookmarks[rootKey]) return;
  
  let current = bookmarks[rootKey];
  
  // Navigate to parent folder
  for (let i = 1; i < parts.length - 1; i++) {
    const folderName = parts[i];
    const folder = current.children?.find(c => c.title === folderName && c.type === 'folder');
    if (!folder) return;
    current = folder;
  }
  
  // Find and remove the item
  const itemName = parts[parts.length - 1];
  const index = current.children?.findIndex(c => c.title === itemName);
  if (index !== undefined && index >= 0) {
    current.children.splice(index, 1);
  }
};
