/**
 * @fileoverview Hash utilities for generating stable bookmark IDs and checksums
 * Uses Web Crypto API which is available in both Node.js and browsers
 */

/**
 * Generates a SHA-256 hash of the input string
 * @param {string} input - String to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
export const sha256 = async (input) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use Web Crypto API (available in Node.js 20+ and browsers)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
};

/**
 * Generates a stable ID for a bookmark based on its content
 * This ensures the same bookmark gets the same ID across different browsers
 * @param {Object} bookmark - Bookmark object
 * @param {string} bookmark.url - Bookmark URL (for bookmarks)
 * @param {string} bookmark.title - Bookmark title
 * @param {string} [bookmark.parentPath] - Path to parent folder
 * @returns {Promise<string>} Stable bookmark ID
 */
export const generateBookmarkId = async ({ url, title, parentPath = '' }) => {
  // For bookmarks, use URL as primary identifier (most stable)
  // For folders, use title + parent path
  const content = url ? `bookmark:${url}` : `folder:${parentPath}/${title}`;
  const hash = await sha256(content);

  // Return first 16 characters for a shorter but still unique ID
  return hash.substring(0, 16);
};

/**
 * Generates a stable ID for a folder based on its path
 * @param {string} path - Full path to the folder (e.g., "toolbar/Work/Projects")
 * @returns {Promise<string>} Stable folder ID
 */
export const generateFolderId = async (path) => {
  const hash = await sha256(`folder:${path}`);
  return hash.substring(0, 16);
};

/**
 * Generates a checksum for a bookmark file to detect changes
 * @param {Object} bookmarkFile - The bookmark file object
 * @returns {Promise<string>} SHA-256 checksum
 */
export const generateChecksum = async (bookmarkFile) => {
  // Create a deterministic string representation
  // Sort keys to ensure consistent ordering
  const content = JSON.stringify(bookmarkFile.bookmarks, Object.keys(bookmarkFile.bookmarks).sort());
  return sha256(content);
};

/**
 * Generates a unique device ID
 * @returns {Promise<string>} Unique device identifier
 */
export const generateDeviceId = async () => {
  // Generate a random UUID-like string
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);

  // Convert to hex string
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Format as UUID-like string
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
};

/**
 * Compares two checksums to determine if content has changed
 * @param {string} checksum1 - First checksum
 * @param {string} checksum2 - Second checksum
 * @returns {boolean} True if checksums are different (content changed)
 */
export const hasContentChanged = (checksum1, checksum2) => {
  if (!checksum1 || !checksum2) return true;
  return checksum1 !== checksum2;
};
