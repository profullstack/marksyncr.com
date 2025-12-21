/**
 * @fileoverview Bookmark type definitions using JSDoc
 * These types define the JSON bookmark schema that preserves toolbar/menu/other locations
 */

/**
 * @typedef {'bookmark' | 'folder' | 'separator'} BookmarkType
 */

/**
 * @typedef {Object} BookmarkItem
 * @property {string} id - Unique stable ID (content-based hash)
 * @property {BookmarkType} type - Type of bookmark item
 * @property {string} title - Display title
 * @property {string} [url] - URL for bookmarks (not present for folders/separators)
 * @property {string} dateAdded - ISO 8601 timestamp when bookmark was added
 * @property {string} [dateModified] - ISO 8601 timestamp when bookmark was last modified
 * @property {BookmarkItem[]} [children] - Child items for folders
 */

/**
 * @typedef {Object} BookmarkFolder
 * @property {string} id - Root folder ID
 * @property {string} title - Folder title
 * @property {BookmarkItem[]} children - Child bookmark items
 */

/**
 * @typedef {Object} BookmarkData
 * @property {BookmarkFolder} toolbar - Bookmarks toolbar items
 * @property {BookmarkFolder} menu - Bookmarks menu items
 * @property {BookmarkFolder} other - Other bookmarks
 */

/**
 * @typedef {Object} BookmarkMetadata
 * @property {string} lastModified - ISO 8601 timestamp of last modification
 * @property {string} lastSyncedBy - Device UUID that last synced
 * @property {string} checksum - SHA-256 hash of bookmark data for change detection
 */

/**
 * @typedef {Object} BookmarkFile
 * @property {string} version - Schema version string (e.g., "1.0")
 * @property {number} schemaVersion - Numeric schema version for migrations
 * @property {BookmarkMetadata} metadata - File metadata
 * @property {BookmarkData} bookmarks - The actual bookmark data
 */

/**
 * Creates an empty bookmark file structure
 * @returns {BookmarkFile}
 */
export const createEmptyBookmarkFile = () => ({
  version: '1.0',
  schemaVersion: 1,
  metadata: {
    lastModified: new Date().toISOString(),
    lastSyncedBy: '',
    checksum: '',
  },
  bookmarks: {
    toolbar: {
      id: 'toolbar_root',
      title: 'Bookmarks Toolbar',
      children: [],
    },
    menu: {
      id: 'menu_root',
      title: 'Bookmarks Menu',
      children: [],
    },
    other: {
      id: 'other_root',
      title: 'Other Bookmarks',
      children: [],
    },
  },
});

/**
 * Creates a new bookmark item
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.title
 * @param {string} params.url
 * @returns {BookmarkItem}
 */
export const createBookmarkItem = ({ id, title, url }) => ({
  id,
  type: 'bookmark',
  title,
  url,
  dateAdded: new Date().toISOString(),
});

/**
 * Creates a new folder item
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.title
 * @param {BookmarkItem[]} [params.children]
 * @returns {BookmarkItem}
 */
export const createFolderItem = ({ id, title, children = [] }) => ({
  id,
  type: 'folder',
  title,
  dateAdded: new Date().toISOString(),
  children,
});

/**
 * Creates a separator item
 * @param {string} id
 * @returns {BookmarkItem}
 */
export const createSeparatorItem = (id) => ({
  id,
  type: 'separator',
  title: '',
  dateAdded: new Date().toISOString(),
});

// Export type constants for runtime use
export const BOOKMARK_TYPES = {
  BOOKMARK: 'bookmark',
  FOLDER: 'folder',
  SEPARATOR: 'separator',
};

export const ROOT_FOLDER_IDS = {
  TOOLBAR: 'toolbar_root',
  MENU: 'menu_root',
  OTHER: 'other_root',
};
