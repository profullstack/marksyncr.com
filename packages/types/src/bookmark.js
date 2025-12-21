/**
 * @fileoverview Bookmark type definitions using JSDoc
 * These types define the JSON bookmark schema that preserves toolbar/menu/other locations
 * Schema version 1.1 adds support for tags, notes, and link status (Pro features)
 */

/**
 * @typedef {'bookmark' | 'folder' | 'separator'} BookmarkType
 */

/**
 * @typedef {'valid' | 'broken' | 'redirect' | 'timeout' | 'unknown'} LinkStatus
 */

/**
 * @typedef {Object} BookmarkTag
 * @property {string} name - Tag name
 * @property {string} [color] - Tag color (hex code)
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
 * @property {string[]} [tags] - Array of tag names (Pro feature)
 * @property {string} [notes] - Personal notes/description (Pro feature)
 * @property {LinkStatus} [linkStatus] - Link health status (Pro feature)
 * @property {string} [lastChecked] - ISO 8601 timestamp of last link check (Pro feature)
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
 * @property {string} version - Schema version string (e.g., "1.0", "1.1")
 * @property {number} schemaVersion - Numeric schema version for migrations
 * @property {BookmarkMetadata} metadata - File metadata
 * @property {BookmarkData} bookmarks - The actual bookmark data
 * @property {BookmarkTag[]} [tags] - User-defined tags with colors (Pro feature, schema 1.1+)
 */

// Current schema version
export const CURRENT_SCHEMA_VERSION = 2;
export const CURRENT_VERSION_STRING = '1.1';

/**
 * Creates an empty bookmark file structure
 * @param {Object} [options]
 * @param {boolean} [options.includeProFeatures=false] - Include Pro feature fields
 * @returns {BookmarkFile}
 */
export const createEmptyBookmarkFile = ({ includeProFeatures = false } = {}) => {
  const baseFile = {
    version: CURRENT_VERSION_STRING,
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
  };

  if (includeProFeatures) {
    baseFile.tags = [];
  }

  return baseFile;
};

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

/**
 * Creates a new bookmark item with Pro features
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.title
 * @param {string} params.url
 * @param {string[]} [params.tags] - Array of tag names
 * @param {string} [params.notes] - Personal notes
 * @returns {BookmarkItem}
 */
export const createBookmarkItemWithProFeatures = ({ id, title, url, tags = [], notes = '' }) => ({
  id,
  type: 'bookmark',
  title,
  url,
  dateAdded: new Date().toISOString(),
  tags,
  notes,
  linkStatus: 'unknown',
});

/**
 * Creates a new tag
 * @param {Object} params
 * @param {string} params.name - Tag name
 * @param {string} [params.color] - Tag color (hex code)
 * @returns {BookmarkTag}
 */
export const createTag = ({ name, color = '#3B82F6' }) => ({
  name: name.toLowerCase().trim(),
  color,
});

/**
 * Adds tags to a bookmark item
 * @param {BookmarkItem} bookmark - The bookmark to modify
 * @param {string[]} tags - Tags to add
 * @returns {BookmarkItem} - Modified bookmark
 */
export const addTagsToBookmark = (bookmark, tags) => ({
  ...bookmark,
  tags: [...new Set([...(bookmark.tags || []), ...tags])],
  dateModified: new Date().toISOString(),
});

/**
 * Removes tags from a bookmark item
 * @param {BookmarkItem} bookmark - The bookmark to modify
 * @param {string[]} tagsToRemove - Tags to remove
 * @returns {BookmarkItem} - Modified bookmark
 */
export const removeTagsFromBookmark = (bookmark, tagsToRemove) => ({
  ...bookmark,
  tags: (bookmark.tags || []).filter((tag) => !tagsToRemove.includes(tag)),
  dateModified: new Date().toISOString(),
});

/**
 * Updates notes on a bookmark item
 * @param {BookmarkItem} bookmark - The bookmark to modify
 * @param {string} notes - New notes content
 * @returns {BookmarkItem} - Modified bookmark
 */
export const updateBookmarkNotes = (bookmark, notes) => ({
  ...bookmark,
  notes,
  dateModified: new Date().toISOString(),
});

/**
 * Updates link status on a bookmark item
 * @param {BookmarkItem} bookmark - The bookmark to modify
 * @param {LinkStatus} status - New link status
 * @returns {BookmarkItem} - Modified bookmark
 */
export const updateBookmarkLinkStatus = (bookmark, status) => ({
  ...bookmark,
  linkStatus: status,
  lastChecked: new Date().toISOString(),
});

/**
 * Migrates a bookmark file from schema v1 to v2 (1.0 to 1.1)
 * @param {BookmarkFile} bookmarkFile - The bookmark file to migrate
 * @returns {BookmarkFile} - Migrated bookmark file
 */
export const migrateToSchemaV2 = (bookmarkFile) => {
  if (bookmarkFile.schemaVersion >= 2) {
    return bookmarkFile;
  }

  // Recursively add Pro feature fields to all bookmarks
  const migrateBookmarkItem = (item) => {
    const migrated = { ...item };

    if (item.type === 'bookmark') {
      migrated.tags = item.tags || [];
      migrated.notes = item.notes || '';
      migrated.linkStatus = item.linkStatus || 'unknown';
    }

    if (item.children) {
      migrated.children = item.children.map(migrateBookmarkItem);
    }

    return migrated;
  };

  return {
    ...bookmarkFile,
    version: CURRENT_VERSION_STRING,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    bookmarks: {
      toolbar: {
        ...bookmarkFile.bookmarks.toolbar,
        children: bookmarkFile.bookmarks.toolbar.children.map(migrateBookmarkItem),
      },
      menu: {
        ...bookmarkFile.bookmarks.menu,
        children: bookmarkFile.bookmarks.menu.children.map(migrateBookmarkItem),
      },
      other: {
        ...bookmarkFile.bookmarks.other,
        children: bookmarkFile.bookmarks.other.children.map(migrateBookmarkItem),
      },
    },
    tags: bookmarkFile.tags || [],
  };
};

/**
 * Checks if a bookmark file needs migration
 * @param {BookmarkFile} bookmarkFile - The bookmark file to check
 * @returns {boolean} - True if migration is needed
 */
export const needsMigration = (bookmarkFile) => {
  return (bookmarkFile.schemaVersion || 1) < CURRENT_SCHEMA_VERSION;
};

/**
 * Gets all unique tags from a bookmark file
 * @param {BookmarkFile} bookmarkFile - The bookmark file
 * @returns {string[]} - Array of unique tag names
 */
export const getAllTagsFromBookmarks = (bookmarkFile) => {
  const tags = new Set();

  const collectTags = (items) => {
    for (const item of items) {
      if (item.tags) {
        item.tags.forEach((tag) => tags.add(tag));
      }
      if (item.children) {
        collectTags(item.children);
      }
    }
  };

  collectTags(bookmarkFile.bookmarks.toolbar.children);
  collectTags(bookmarkFile.bookmarks.menu.children);
  collectTags(bookmarkFile.bookmarks.other.children);

  return [...tags].sort();
};

/**
 * Finds all bookmarks with a specific tag
 * @param {BookmarkFile} bookmarkFile - The bookmark file
 * @param {string} tagName - Tag name to search for
 * @returns {BookmarkItem[]} - Array of bookmarks with the tag
 */
export const findBookmarksByTag = (bookmarkFile, tagName) => {
  const results = [];

  const searchItems = (items) => {
    for (const item of items) {
      if (item.type === 'bookmark' && item.tags?.includes(tagName)) {
        results.push(item);
      }
      if (item.children) {
        searchItems(item.children);
      }
    }
  };

  searchItems(bookmarkFile.bookmarks.toolbar.children);
  searchItems(bookmarkFile.bookmarks.menu.children);
  searchItems(bookmarkFile.bookmarks.other.children);

  return results;
};

/**
 * Finds all bookmarks with broken links
 * @param {BookmarkFile} bookmarkFile - The bookmark file
 * @returns {BookmarkItem[]} - Array of bookmarks with broken links
 */
export const findBrokenLinks = (bookmarkFile) => {
  const results = [];

  const searchItems = (items) => {
    for (const item of items) {
      if (item.type === 'bookmark' && item.linkStatus === 'broken') {
        results.push(item);
      }
      if (item.children) {
        searchItems(item.children);
      }
    }
  };

  searchItems(bookmarkFile.bookmarks.toolbar.children);
  searchItems(bookmarkFile.bookmarks.menu.children);
  searchItems(bookmarkFile.bookmarks.other.children);

  return results;
};

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

export const LINK_STATUS = {
  VALID: 'valid',
  BROKEN: 'broken',
  REDIRECT: 'redirect',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

// Default tag colors for UI
export const DEFAULT_TAG_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];
