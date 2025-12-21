/**
 * Bookmark Parser/Serializer
 *
 * Converts between browser bookmark API format and MarkSyncr JSON format.
 * Handles Chrome, Firefox, and Safari bookmark structures.
 */

import { generateBookmarkId, generateChecksum } from './hash-utils.js';

/**
 * @typedef {import('@marksyncr/types').BookmarkItem} BookmarkItem
 * @typedef {import('@marksyncr/types').BookmarkData} BookmarkData
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 */

/**
 * Browser types for bookmark structure differences
 */
export const BROWSER_TYPES = {
  CHROME: 'chrome',
  FIREFOX: 'firefox',
  SAFARI: 'safari',
  EDGE: 'edge',
  UNKNOWN: 'unknown',
};

/**
 * Root folder identifiers by browser
 */
const ROOT_IDENTIFIERS = {
  [BROWSER_TYPES.CHROME]: {
    toolbar: ['Bookmarks Bar', 'Bookmarks bar'],
    menu: ['Other Bookmarks', 'Other bookmarks'],
    other: ['Mobile Bookmarks', 'Mobile bookmarks'],
  },
  [BROWSER_TYPES.FIREFOX]: {
    toolbar: ['Bookmarks Toolbar', 'toolbar_____'],
    menu: ['Bookmarks Menu', 'menu________'],
    other: ['Other Bookmarks', 'unfiled_____'],
  },
  [BROWSER_TYPES.SAFARI]: {
    toolbar: ['Favorites', 'BookmarksBar'],
    menu: ['Bookmarks Menu'],
    other: ['Reading List'],
  },
};

/**
 * Detect browser type from user agent or bookmark structure
 * @param {Array} [bookmarkTree] - Browser bookmark tree
 * @returns {string} Browser type
 */
export function detectBrowser(bookmarkTree) {
  // Try to detect from user agent first
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox/')) return BROWSER_TYPES.FIREFOX;
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return BROWSER_TYPES.SAFARI;
    if (ua.includes('Edg/')) return BROWSER_TYPES.EDGE;
    if (ua.includes('Chrome/')) return BROWSER_TYPES.CHROME;
  }

  // Try to detect from bookmark structure
  if (bookmarkTree?.[0]?.children) {
    const rootChildren = bookmarkTree[0].children;
    for (const child of rootChildren) {
      const title = child.title?.toLowerCase() || '';
      const id = child.id || '';

      // Firefox uses specific IDs
      if (id.includes('toolbar_____') || id.includes('menu________')) {
        return BROWSER_TYPES.FIREFOX;
      }

      // Chrome uses "Bookmarks Bar"
      if (title === 'bookmarks bar') {
        return BROWSER_TYPES.CHROME;
      }

      // Safari uses "Favorites"
      if (title === 'favorites') {
        return BROWSER_TYPES.SAFARI;
      }
    }
  }

  return BROWSER_TYPES.UNKNOWN;
}

/**
 * Identify root folder type from node
 * @param {object} node - Bookmark node
 * @param {string} browser - Browser type
 * @returns {'toolbar' | 'menu' | 'other' | null}
 */
function identifyRootFolder(node, browser) {
  const title = node.title?.toLowerCase() || '';
  const id = node.id || '';
  const identifiers = ROOT_IDENTIFIERS[browser] || ROOT_IDENTIFIERS[BROWSER_TYPES.CHROME];

  for (const [folderType, patterns] of Object.entries(identifiers)) {
    for (const pattern of patterns) {
      if (
        title === pattern.toLowerCase() ||
        id === pattern ||
        title.includes(pattern.toLowerCase())
      ) {
        return folderType;
      }
    }
  }

  return null;
}

/**
 * Convert a browser bookmark node to MarkSyncr format
 * @param {object} node - Browser bookmark node
 * @param {string} [parentPath=''] - Parent path for ID generation
 * @returns {BookmarkItem}
 */
function convertNode(node, parentPath = '') {
  const currentPath = parentPath ? `${parentPath}/${node.title || ''}` : node.title || '';

  if (node.url) {
    // It's a bookmark
    const bookmark = {
      id: generateBookmarkId(node.url, node.title || ''),
      type: 'bookmark',
      title: node.title || '',
      url: node.url,
      dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : new Date().toISOString(),
    };

    // Add optional fields if present
    if (node.dateGroupModified) {
      bookmark.dateModified = new Date(node.dateGroupModified).toISOString();
    }

    return bookmark;
  }

  // It's a folder
  const folder = {
    id: generateBookmarkId(currentPath, 'folder'),
    type: 'folder',
    title: node.title || '',
    children: [],
    dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : new Date().toISOString(),
  };

  // Recursively convert children
  if (node.children && Array.isArray(node.children)) {
    folder.children = node.children.map((child) => convertNode(child, currentPath));
  }

  if (node.dateGroupModified) {
    folder.dateModified = new Date(node.dateGroupModified).toISOString();
  }

  return folder;
}

/**
 * Parse browser bookmark tree to MarkSyncr JSON format
 * @param {Array} browserTree - Browser bookmark tree from bookmarks.getTree()
 * @param {object} [options] - Parser options
 * @param {string} [options.browser] - Browser type (auto-detected if not provided)
 * @returns {BookmarkFile}
 */
export function parseBrowserBookmarks(browserTree, options = {}) {
  const browser = options.browser || detectBrowser(browserTree);

  const result = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    browser,
    checksum: '',
    roots: {
      toolbar: {
        id: 'root-toolbar',
        type: 'folder',
        title: 'Bookmarks Toolbar',
        children: [],
        dateAdded: new Date().toISOString(),
      },
      menu: {
        id: 'root-menu',
        type: 'folder',
        title: 'Bookmarks Menu',
        children: [],
        dateAdded: new Date().toISOString(),
      },
      other: {
        id: 'root-other',
        type: 'folder',
        title: 'Other Bookmarks',
        children: [],
        dateAdded: new Date().toISOString(),
      },
    },
  };

  // Process the root node
  if (browserTree?.[0]?.children) {
    for (const rootChild of browserTree[0].children) {
      const folderType = identifyRootFolder(rootChild, browser);

      if (folderType && result.roots[folderType]) {
        // Convert children of this root folder
        if (rootChild.children) {
          result.roots[folderType].children = rootChild.children.map((child) =>
            convertNode(child, folderType)
          );
        }

        // Update metadata
        if (rootChild.dateAdded) {
          result.roots[folderType].dateAdded = new Date(rootChild.dateAdded).toISOString();
        }
        if (rootChild.dateGroupModified) {
          result.roots[folderType].dateModified = new Date(
            rootChild.dateGroupModified
          ).toISOString();
        }
      }
    }
  }

  // Generate checksum
  result.checksum = generateChecksum(result.roots);

  return result;
}

/**
 * Convert MarkSyncr bookmark item to browser format
 * @param {BookmarkItem} item - MarkSyncr bookmark item
 * @param {string} parentId - Browser parent folder ID
 * @returns {object} Browser bookmark create info
 */
function convertToBrowserFormat(item, parentId) {
  const browserItem = {
    parentId,
    title: item.title,
  };

  if (item.type === 'bookmark' && item.url) {
    browserItem.url = item.url;
  }

  return browserItem;
}

/**
 * Serialize MarkSyncr bookmarks to browser format for import
 * This creates the structure needed for browser.bookmarks.create()
 * @param {BookmarkFile} bookmarkFile - MarkSyncr bookmark file
 * @param {object} rootIds - Browser root folder IDs
 * @param {string} rootIds.toolbar - Toolbar folder ID
 * @param {string} rootIds.menu - Menu folder ID
 * @param {string} rootIds.other - Other folder ID
 * @returns {Array<{item: object, parentId: string, children?: Array}>}
 */
export function serializeToBrowserFormat(bookmarkFile, rootIds) {
  const operations = [];

  /**
   * Process a folder's children recursively
   * @param {Array<BookmarkItem>} children
   * @param {string} parentId
   */
  function processChildren(children, parentId) {
    for (const child of children) {
      const browserItem = convertToBrowserFormat(child, parentId);

      if (child.type === 'folder') {
        // For folders, we need to create them first, then process children
        operations.push({
          item: browserItem,
          parentId,
          isFolder: true,
          originalId: child.id,
          children: child.children || [],
        });
      } else {
        operations.push({
          item: browserItem,
          parentId,
          isFolder: false,
        });
      }
    }
  }

  // Process each root
  if (bookmarkFile.roots.toolbar?.children) {
    processChildren(bookmarkFile.roots.toolbar.children, rootIds.toolbar);
  }

  if (bookmarkFile.roots.menu?.children) {
    processChildren(bookmarkFile.roots.menu.children, rootIds.menu);
  }

  if (bookmarkFile.roots.other?.children) {
    processChildren(bookmarkFile.roots.other.children, rootIds.other);
  }

  return operations;
}

/**
 * Get browser root folder IDs
 * @param {Array} browserTree - Browser bookmark tree
 * @param {string} [browser] - Browser type
 * @returns {{toolbar: string, menu: string, other: string}}
 */
export function getBrowserRootIds(browserTree, browser) {
  const detectedBrowser = browser || detectBrowser(browserTree);
  const rootIds = {
    toolbar: null,
    menu: null,
    other: null,
  };

  if (browserTree?.[0]?.children) {
    for (const rootChild of browserTree[0].children) {
      const folderType = identifyRootFolder(rootChild, detectedBrowser);
      if (folderType) {
        rootIds[folderType] = rootChild.id;
      }
    }
  }

  return rootIds;
}

/**
 * Flatten bookmark tree to array of bookmarks (for searching/indexing)
 * @param {BookmarkFile} bookmarkFile - MarkSyncr bookmark file
 * @returns {Array<{bookmark: BookmarkItem, path: string[]}>}
 */
export function flattenBookmarks(bookmarkFile) {
  const results = [];

  function traverse(items, path = []) {
    for (const item of items) {
      const currentPath = [...path, item.title];

      if (item.type === 'bookmark') {
        results.push({
          bookmark: item,
          path: currentPath,
        });
      } else if (item.type === 'folder' && item.children) {
        traverse(item.children, currentPath);
      }
    }
  }

  // Traverse all roots
  for (const [rootName, rootFolder] of Object.entries(bookmarkFile.roots)) {
    if (rootFolder?.children) {
      traverse(rootFolder.children, [rootName]);
    }
  }

  return results;
}

/**
 * Find bookmark by ID in the tree
 * @param {BookmarkFile} bookmarkFile - MarkSyncr bookmark file
 * @param {string} id - Bookmark ID to find
 * @returns {BookmarkItem | null}
 */
export function findBookmarkById(bookmarkFile, id) {
  function search(items) {
    for (const item of items) {
      if (item.id === id) {
        return item;
      }
      if (item.type === 'folder' && item.children) {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  for (const rootFolder of Object.values(bookmarkFile.roots)) {
    if (rootFolder?.children) {
      const found = search(rootFolder.children);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find bookmark by URL
 * @param {BookmarkFile} bookmarkFile - MarkSyncr bookmark file
 * @param {string} url - URL to find
 * @returns {Array<BookmarkItem>} All bookmarks with matching URL
 */
export function findBookmarksByUrl(bookmarkFile, url) {
  const results = [];

  function search(items) {
    for (const item of items) {
      if (item.type === 'bookmark' && item.url === url) {
        results.push(item);
      }
      if (item.type === 'folder' && item.children) {
        search(item.children);
      }
    }
  }

  for (const rootFolder of Object.values(bookmarkFile.roots)) {
    if (rootFolder?.children) {
      search(rootFolder.children);
    }
  }

  return results;
}

/**
 * Count bookmarks and folders in a bookmark file
 * @param {BookmarkFile} bookmarkFile - MarkSyncr bookmark file
 * @returns {{bookmarks: number, folders: number, total: number}}
 */
export function countBookmarks(bookmarkFile) {
  let bookmarks = 0;
  let folders = 0;

  function count(items) {
    for (const item of items) {
      if (item.type === 'bookmark') {
        bookmarks++;
      } else if (item.type === 'folder') {
        folders++;
        if (item.children) {
          count(item.children);
        }
      }
    }
  }

  for (const rootFolder of Object.values(bookmarkFile.roots)) {
    if (rootFolder?.children) {
      count(rootFolder.children);
    }
  }

  return {
    bookmarks,
    folders,
    total: bookmarks + folders,
  };
}

/**
 * Validate bookmark file structure
 * @param {object} data - Data to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBookmarkFile(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Bookmark file must be an object');
    return { valid: false, errors };
  }

  if (!data.version) {
    errors.push('Missing version field');
  }

  if (!data.roots || typeof data.roots !== 'object') {
    errors.push('Missing or invalid roots field');
  } else {
    const requiredRoots = ['toolbar', 'menu', 'other'];
    for (const root of requiredRoots) {
      if (!data.roots[root]) {
        errors.push(`Missing root folder: ${root}`);
      } else if (!Array.isArray(data.roots[root].children)) {
        errors.push(`Root folder ${root} must have children array`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  BROWSER_TYPES,
  detectBrowser,
  parseBrowserBookmarks,
  serializeToBrowserFormat,
  getBrowserRootIds,
  flattenBookmarks,
  findBookmarkById,
  findBookmarksByUrl,
  countBookmarks,
  validateBookmarkFile,
};
