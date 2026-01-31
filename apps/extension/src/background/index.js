/**
 * MarkSyncr Background Service Worker
 *
 * Handles:
 * - Bookmark sync operations
 * - OAuth authentication flows
 * - Alarm-based automatic sync
 * - Message passing with popup/options pages
 */

import browser from 'webextension-polyfill';

// Constants
const SYNC_ALARM_NAME = 'marksyncr-auto-sync';
const TOKEN_REFRESH_ALARM_NAME = 'marksyncr-token-refresh';
const TOKEN_REFRESH_INTERVAL = 50; // minutes - refresh access token before 1 hour expiry
const DEFAULT_SYNC_INTERVAL = 5; // minutes - sync every 5 minutes by default
const TOMBSTONES_STORAGE_KEY = 'marksyncr-tombstones';
const LAST_CLOUD_CHECKSUM_KEY = 'marksyncr-last-cloud-checksum';
const LAST_SYNC_TIME_KEY = 'marksyncr-last-sync-time';
const LOCALLY_MODIFIED_IDS_KEY = 'marksyncr-locally-modified-ids';

// Flag to disable tombstone creation during Force Pull operations
let isForcePullInProgress = false;

// Flag to prevent sync loops - when true, bookmark changes won't trigger new syncs
let isSyncInProgress = false;

// Track pending changes that occurred during sync - these need to be synced after current sync completes
let pendingSyncNeeded = false;
let pendingSyncReasons = [];

// Track bookmarks modified locally since last sync - these take priority over cloud versions
let locallyModifiedBookmarkIds = new Set();

// Retry limiting for failed syncs
const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveSyncFailures = 0;
let lastSyncError = null;

/**
 * Get API base URL - uses VITE_APP_URL from build config or falls back to production URL
 */
function getApiBaseUrl() {
  // In production builds, this will be replaced by Vite with the actual URL

  return typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL
    ? import.meta.env.VITE_APP_URL
    : 'https://marksyncr.com';
}

/**
 * Get stored session
 */
async function getSession() {
  const { session } = await browser.storage.local.get('session');
  return session || null;
}

/**
 * Get stored access token
 */
async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

/**
 * Store session data
 */
async function storeSession(session) {
  await browser.storage.local.set({ session });
}

/**
 * Clear session data
 */
async function clearSession() {
  await browser.storage.local.remove(['session', 'user', 'isLoggedIn']);
}

/**
 * Get stored tombstones (deleted bookmark records)
 * @returns {Promise<Array<{url: string, deletedAt: number}>>}
 */
async function getTombstones() {
  const data = await browser.storage.local.get(TOMBSTONES_STORAGE_KEY);
  return data[TOMBSTONES_STORAGE_KEY] || [];
}

/**
 * Store tombstones
 * @param {Array<{url: string, deletedAt: number}>} tombstones
 */
async function storeTombstones(tombstones) {
  await browser.storage.local.set({ [TOMBSTONES_STORAGE_KEY]: tombstones });
}

/**
 * Add a tombstone for a deleted bookmark
 * @param {string} url - URL of the deleted bookmark
 */
async function addTombstone(url) {
  if (!url) return;

  const tombstones = await getTombstones();
  const existingIndex = tombstones.findIndex((t) => t.url === url);

  if (existingIndex >= 0) {
    // Update existing tombstone with new deletion time
    tombstones[existingIndex].deletedAt = Date.now();
  } else {
    // Add new tombstone
    tombstones.push({ url, deletedAt: Date.now() });
  }

  await storeTombstones(tombstones);
  console.log(`[MarkSyncr] Added tombstone for: ${url}`);
}

/**
 * Remove a tombstone (when a bookmark is re-added)
 * @param {string} url - URL of the bookmark
 */
async function removeTombstone(url) {
  if (!url) return;

  const tombstones = await getTombstones();
  const filtered = tombstones.filter((t) => t.url !== url);

  if (filtered.length !== tombstones.length) {
    await storeTombstones(filtered);
    console.log(`[MarkSyncr] Removed tombstone for: ${url}`);
  }
}

/**
 * Clear tombstones that are older than a certain age (cleanup)
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 30 days)
 */
async function cleanupOldTombstones(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  const tombstones = await getTombstones();
  const cutoff = Date.now() - maxAgeMs;
  const filtered = tombstones.filter((t) => t.deletedAt > cutoff);

  if (filtered.length !== tombstones.length) {
    await storeTombstones(filtered);
    console.log(`[MarkSyncr] Cleaned up ${tombstones.length - filtered.length} old tombstones`);
  }
}

/**
 * Load persisted locally modified bookmark IDs from storage
 * This survives service worker restarts in MV3
 * @returns {Promise<Set<string>>}
 */
async function loadLocallyModifiedIds() {
  const data = await browser.storage.local.get(LOCALLY_MODIFIED_IDS_KEY);
  const ids = data[LOCALLY_MODIFIED_IDS_KEY] || [];
  return new Set(ids);
}

/**
 * Persist locally modified bookmark IDs to storage
 * Called after every bookmark change to survive service worker restarts
 */
async function saveLocallyModifiedIds() {
  await browser.storage.local.set({
    [LOCALLY_MODIFIED_IDS_KEY]: Array.from(locallyModifiedBookmarkIds),
  });
}

// Debounce saveLocallyModifiedIds to avoid excessive storage writes
// when multiple bookmark changes happen rapidly (e.g., bulk import)
let saveModifiedIdsTimeout = null;
function debouncedSaveLocallyModifiedIds() {
  if (saveModifiedIdsTimeout) {
    clearTimeout(saveModifiedIdsTimeout);
  }
  saveModifiedIdsTimeout = setTimeout(() => {
    saveModifiedIdsTimeout = null;
    saveLocallyModifiedIds();
  }, 500);
}

/**
 * Normalize bookmarks AND folders for checksum comparison
 * Extracts only the fields that matter for content comparison,
 * matching the server-side normalization
 *
 * IMPORTANT: We include both bookmarks and folders with their index
 * to detect order changes. Folders need index tracking too because
 * their position within their parent folder matters for preserving
 * the complete bookmark structure across browsers.
 *
 * NOTE: We intentionally EXCLUDE dateAdded from the checksum because:
 * 1. When bookmarks are synced from cloud to local browser, the browser
 *    assigns the CURRENT time as dateAdded (we can't set it via API)
 * 2. This causes the local dateAdded to differ from cloud dateAdded
 * 3. Which causes checksums to never match, triggering unnecessary syncs
 * 4. dateAdded is not user-editable, so changes to it don't represent
 *    meaningful user changes that need to be synced
 *
 * @param {Array} items - Array of bookmarks and folders to normalize
 * @returns {Array} - Normalized items with only comparable fields
 */
function normalizeItemsForChecksum(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (item.type === 'folder') {
        // Folder entry
        return {
          type: 'folder',
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      } else {
        // Bookmark entry (default for backwards compatibility)
        // NOTE: dateAdded is intentionally excluded - see function comment
        return {
          type: 'bookmark',
          url: item.url,
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      }
    })
    .sort((a, b) => {
      // Sort by folderPath first, then by index within the folder
      // IMPORTANT: Do NOT sort by type - this would break the interleaved order
      // of folders and bookmarks. When a user moves a folder from position 3 to
      // the last position, the index should be preserved, not reset based on type.
      const folderCompare = a.folderPath.localeCompare(b.folderPath);
      if (folderCompare !== 0) return folderCompare;
      // Then by index within the folder to preserve original order
      return (a.index ?? 0) - (b.index ?? 0);
    });
}

/**
 * @deprecated Use normalizeItemsForChecksum instead
 * Kept for backwards compatibility during transition
 */
function normalizeBookmarksForChecksum(bookmarks) {
  return normalizeItemsForChecksum(bookmarks);
}

/**
 * Generate checksum for bookmark data (matches server-side algorithm)
 * Uses SHA-256 hash of JSON stringified data
 * @param {Array} bookmarks - Array of bookmarks to hash
 * @returns {Promise<string>} - Hex string of SHA-256 hash
 */
async function generateChecksum(bookmarks) {
  // Normalize bookmarks to only include comparable fields
  const normalized = normalizeBookmarksForChecksum(bookmarks);
  const data = JSON.stringify(normalized);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the last known cloud checksum
 * @returns {Promise<string|null>}
 */
async function getLastCloudChecksum() {
  const data = await browser.storage.local.get(LAST_CLOUD_CHECKSUM_KEY);
  return data[LAST_CLOUD_CHECKSUM_KEY] || null;
}

/**
 * Store the last known cloud checksum
 * @param {string} checksum
 */
async function storeLastCloudChecksum(checksum) {
  await browser.storage.local.set({ [LAST_CLOUD_CHECKSUM_KEY]: checksum });
}

/**
 * Get the last sync time (timestamp in milliseconds)
 * @returns {Promise<number|null>}
 */
async function getLastSyncTime() {
  const data = await browser.storage.local.get(LAST_SYNC_TIME_KEY);
  return data[LAST_SYNC_TIME_KEY] || null;
}

/**
 * Store the last sync time
 * @param {number} timestamp - Timestamp in milliseconds
 */
async function storeLastSyncTime(timestamp) {
  await browser.storage.local.set({ [LAST_SYNC_TIME_KEY]: timestamp });
}

/**
 * Filter cloud tombstones to only include those that should be applied
 *
 * This is a SAFEGUARD to prevent unintended bookmark deletions when:
 * 1. Local tombstones are cleared (e.g., user clears extension storage)
 * 2. Cloud has tombstones from previous syncs
 *
 * A tombstone should be applied if:
 * 1. It was created AFTER the last sync time (new deletion from another browser)
 * 2. OR there's a matching local tombstone (we already know about this deletion)
 *
 * A tombstone should NOT be applied if:
 * 1. It was created BEFORE the last sync time AND we have no local tombstone for it
 *    (This means we cleared local storage and the tombstone is stale)
 *
 * @param {Array<{url: string, deletedAt: number}>} cloudTombstones - Tombstones from cloud
 * @param {Array<{url: string, deletedAt: number}>} localTombstones - Local tombstones
 * @param {number|null} lastSyncTime - Timestamp of last successful sync (null if never synced)
 * @returns {Array<{url: string, deletedAt: number}>} - Filtered tombstones to apply
 */
function filterTombstonesToApply(cloudTombstones, localTombstones, lastSyncTime) {
  if (!cloudTombstones || cloudTombstones.length === 0) {
    return [];
  }

  // If we've never synced before, don't apply any cloud tombstones
  // This is a fresh install, so we shouldn't delete anything
  if (!lastSyncTime) {
    console.log('[MarkSyncr] First sync - not applying cloud tombstones (safeguard)');
    return [];
  }

  // Create a set of local tombstone URLs for quick lookup
  const localTombstoneUrls = new Set(localTombstones.map((t) => t.url));

  // Filter cloud tombstones
  const filtered = cloudTombstones.filter((tombstone) => {
    // If we have a local tombstone for this URL, we already know about this deletion
    if (localTombstoneUrls.has(tombstone.url)) {
      return true;
    }

    // If the tombstone was created AFTER our last sync, it's a new deletion
    // from another browser that we should apply
    if (tombstone.deletedAt > lastSyncTime) {
      return true;
    }

    // Otherwise, this is a stale tombstone from before our last sync
    // We don't have a local tombstone for it, which means either:
    // 1. We cleared local storage (lost our tombstones)
    // 2. The bookmark was re-added after the tombstone was created
    // In either case, we should NOT delete the local bookmark
    console.log(
      `[MarkSyncr] Skipping stale tombstone (safeguard): ${tombstone.url} (deletedAt: ${new Date(tombstone.deletedAt).toISOString()}, lastSync: ${new Date(lastSyncTime).toISOString()})`
    );
    return false;
  });

  const skipped = cloudTombstones.length - filtered.length;
  if (skipped > 0) {
    console.log(
      `[MarkSyncr] Tombstone safeguard: ${skipped} stale tombstones skipped, ${filtered.length} will be applied`
    );
  }

  return filtered;
}

/**
 * Normalize folder path for cross-browser comparison
 * Different browsers use different root folder names:
 * - Chrome: "Bookmarks Bar", "Other Bookmarks"
 * - Firefox: "Bookmarks Toolbar", "Bookmarks Menu", "Unsorted Bookmarks"
 * - Opera: "Speed Dial"
 * - Edge: "Favorites Bar"
 *
 * This function normalizes these to a common format for comparison.
 *
 * @param {string} path - Folder path to normalize
 * @returns {string} - Normalized path
 */
function normalizeFolderPath(path) {
  if (!path) return '';
  return (
    path
      // Normalize toolbar variations
      .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
      .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
      .replace(/^Speed Dial\/?/i, 'toolbar/')
      .replace(/^Favourites Bar\/?/i, 'toolbar/')
      .replace(/^Favorites Bar\/?/i, 'toolbar/')
      // Normalize other bookmarks variations
      .replace(/^Other Bookmarks\/?/i, 'other/')
      .replace(/^Unsorted Bookmarks\/?/i, 'other/')
      // Normalize menu variations (Firefox)
      .replace(/^Bookmarks Menu\/?/i, 'menu/')
      // Clean up trailing slashes
      .replace(/\/+$/, '')
  );
}

/**
 * Check if a bookmark needs to be updated based on cloud data
 * Compares title, folder path (normalized), and index
 *
 * @param {Object} cloudBm - Cloud bookmark
 * @param {Object} localBm - Local bookmark
 * @returns {boolean} - True if bookmark needs updating
 */
function bookmarkNeedsUpdate(cloudBm, localBm) {
  // Title changed
  if ((cloudBm.title ?? '') !== (localBm.title ?? '')) return true;

  // Folder changed (with normalization)
  const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
  const localFolder = normalizeFolderPath(localBm.folderPath);
  if (cloudFolder !== localFolder) return true;

  // Index changed (position within folder)
  if (cloudBm.index !== undefined && localBm.index !== undefined && cloudBm.index !== localBm.index)
    return true;

  return false;
}

/**
 * Categorize cloud bookmarks into those that need to be added vs updated
 *
 * @param {Array} cloudBookmarks - Bookmarks from cloud
 * @param {Array} localBookmarks - Local bookmarks
 * @param {Array} tombstones - Merged tombstones
 * @returns {{toAdd: Array, toUpdate: Array, skippedByTombstone: Array}} - Categorized bookmarks
 */
function categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones, modifiedLocalIds) {
  const localByUrl = new Map(localBookmarks.filter((b) => b.url).map((b) => [b.url, b]));

  const toAdd = [];
  const toUpdate = [];
  const skippedByTombstone = [];
  const skippedByLocalModification = [];
  const alreadyExistsUnchanged = [];

  console.log(
    `[MarkSyncr] categorizeCloudBookmarks: ${cloudBookmarks.length} cloud, ${localBookmarks.length} local, ${tombstones.length} tombstones, ${modifiedLocalIds?.size || 0} locally modified`
  );

  for (const cloudBm of cloudBookmarks) {
    // Skip folders (handled separately)
    if (!cloudBm.url) continue;

    // Check tombstones - only add if bookmark is newer than tombstone
    const tombstone = tombstones.find((t) => t.url === cloudBm.url);
    if (tombstone) {
      // Normalize dateAdded to a number — cloud may return a string (ISO) or number
      const rawDate = cloudBm.dateAdded;
      const bookmarkDate = typeof rawDate === 'string' ? new Date(rawDate).getTime() : (rawDate || 0);
      const tombstoneDate = tombstone.deletedAt || 0;
      if (isNaN(bookmarkDate) || bookmarkDate <= tombstoneDate) {
        skippedByTombstone.push({
          bookmark: cloudBm,
          tombstone,
          reason: `dateAdded(${bookmarkDate}) <= deletedAt(${tombstoneDate})`,
        });
        continue; // Skip - tombstone is newer (or dateAdded is invalid)
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (modifiedLocalIds?.has(localBm.id)) {
      // Local bookmark was modified by the user since last sync - local wins
      skippedByLocalModification.push(cloudBm.url);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      toUpdate.push({ cloud: cloudBm, local: localBm });
    } else {
      alreadyExistsUnchanged.push(cloudBm.url);
    }
  }

  // Log categorization results for debugging
  if (skippedByTombstone.length > 0) {
    console.log(
      `[MarkSyncr] ⚠️ Skipped ${skippedByTombstone.length} cloud bookmarks due to tombstones:`
    );
    for (const { bookmark, reason } of skippedByTombstone.slice(0, 5)) {
      console.log(`  - ${bookmark.url}: ${reason}`);
    }
  }

  if (skippedByLocalModification.length > 0) {
    console.log(
      `[MarkSyncr] 🏠 Skipped ${skippedByLocalModification.length} cloud→local updates (locally modified, local wins):`
    );
    for (const url of skippedByLocalModification.slice(0, 5)) {
      console.log(`  - ${url}`);
    }
  }

  if (alreadyExistsUnchanged.length > 0) {
    console.log(
      `[MarkSyncr] ✓ ${alreadyExistsUnchanged.length} cloud bookmarks already exist locally (unchanged)`
    );
  }

  console.log(
    `[MarkSyncr] Categorization result: toAdd=${toAdd.length}, toUpdate=${toUpdate.length}, skipped=${skippedByTombstone.length}, localWins=${skippedByLocalModification.length}, unchanged=${alreadyExistsUnchanged.length}`
  );

  return { toAdd, toUpdate, skippedByTombstone };
}

/**
 * Find or create a folder for a bookmark based on its folderPath
 * Uses the same root folder detection logic as addCloudBookmarksToLocal
 *
 * @param {string} folderPath - The folder path (e.g., "Bookmarks Toolbar/Work/Projects")
 * @returns {Promise<string|null>} - The folder ID, or null if not found/created
 */
async function findOrCreateFolderForBookmark(folderPath) {
  if (!folderPath) return null;

  // Get current browser bookmarks to find root folders
  const currentTree = await browser.bookmarks.getTree();
  const rootFolders = {};

  if (currentTree[0]?.children) {
    for (const root of currentTree[0].children) {
      const title = root.title?.toLowerCase() || '';
      const id = root.id;

      if (title.includes('toolbar') || title.includes('bar') || id === '1') {
        rootFolders.toolbar = root;
      } else if (title.includes('menu') || id === 'menu________') {
        rootFolders.menu = root;
      } else if (
        title.includes('other') ||
        title.includes('unsorted') ||
        id === '2' ||
        id === 'unfiled_____'
      ) {
        rootFolders.other = root;
      }
    }
  }

  // Parse the folder path to determine root and relative path
  let rootFolderKey = 'other';
  let relativePath = folderPath;
  const lowerPath = folderPath.toLowerCase();

  if (
    lowerPath.startsWith('bookmarks bar') ||
    lowerPath.startsWith('bookmarks toolbar') ||
    lowerPath.startsWith('speed dial')
  ) {
    rootFolderKey = 'toolbar';
    relativePath = folderPath.split('/').slice(1).join('/');
  } else if (lowerPath.startsWith('bookmarks menu')) {
    rootFolderKey = 'menu';
    relativePath = folderPath.split('/').slice(1).join('/');
  } else if (
    lowerPath.startsWith('other bookmarks') ||
    lowerPath.startsWith('unsorted bookmarks')
  ) {
    rootFolderKey = 'other';
    relativePath = folderPath.split('/').slice(1).join('/');
  }

  const rootFolder = rootFolders[rootFolderKey] || rootFolders.other || rootFolders.toolbar;
  if (!rootFolder) return null;

  // If no relative path, return the root folder
  if (!relativePath) return rootFolder.id;

  // Navigate/create the folder path
  const parts = relativePath.split('/').filter((p) => p);
  let currentParentId = rootFolder.id;

  for (const part of parts) {
    const children = await browser.bookmarks.getChildren(currentParentId);
    const existingFolder = children.find((c) => !c.url && c.title === part);

    if (existingFolder) {
      currentParentId = existingFolder.id;
    } else {
      // Create the folder
      const newFolder = await browser.bookmarks.create({
        parentId: currentParentId,
        title: part,
      });
      currentParentId = newFolder.id;
    }
  }

  return currentParentId;
}

/**
 * Get the parent folder ID for a bookmark
 *
 * @param {string} bookmarkId - The bookmark ID
 * @returns {Promise<string|null>} - The parent folder ID, or null if not found
 */
async function getParentIdForBookmark(bookmarkId) {
  try {
    const [bookmark] = await browser.bookmarks.get(bookmarkId);
    return bookmark?.parentId || null;
  } catch {
    return null;
  }
}

/**
 * Try to refresh the access token using the long-lived extension token
 *
 * Extension sessions are designed to last 2 years, so users rarely need to re-login.
 * When the access_token expires (1 hour), we use the extension_token to get a new one.
 *
 * Includes retry logic for transient network errors and 503 responses.
 *
 * @returns {Promise<boolean>} - True if refresh was successful
 */
async function tryRefreshToken() {
  const session = await getSession();
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  // First try extension token refresh (preferred for long-lived sessions)
  if (session?.extension_token) {
    const baseUrl = getApiBaseUrl();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(
          `[MarkSyncr] Attempting to refresh token using extension_token (attempt ${attempt}/${MAX_RETRIES})...`
        );

        const response = await fetch(`${baseUrl}/api/auth/extension/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ extension_token: session.extension_token }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.session?.access_token) {
            console.log('[MarkSyncr] Token refreshed successfully via extension_token');
            // Update the session with new access token, keeping extension_token
            await storeSession({
              ...session,
              access_token: data.session.access_token,
              access_token_expires_at: data.session.access_token_expires_at,
            });
            return true;
          }
        }

        // If extension token refresh failed with 401, the session is truly expired - don't retry
        if (response.status === 401) {
          console.log('[MarkSyncr] Extension session expired (401), clearing session');
          await clearSession();
          return false;
        }

        // Retry on 503 (service unavailable) or 500 (server error)
        if (response.status === 503 || response.status === 500) {
          console.log(`[MarkSyncr] Server error (${response.status}), will retry...`);
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            continue;
          }
        }

        console.log('[MarkSyncr] Extension token refresh failed:', response.status);
        // Don't retry on other status codes (400, 404, etc.)
        break;
      } catch (err) {
        console.error(
          `[MarkSyncr] Extension token refresh error (attempt ${attempt}):`,
          err.message
        );
        // Retry on network errors
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          continue;
        }
      }
    }
  }

  // Fallback to legacy refresh token if available (for backwards compatibility during migration)
  if (session?.refresh_token) {
    try {
      const baseUrl = getApiBaseUrl();
      console.log('[MarkSyncr] Attempting legacy refresh token...');

      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });

      if (!response.ok) {
        console.log('[MarkSyncr] Legacy token refresh failed:', response.status);
        return false;
      }

      const data = await response.json();
      if (data.session) {
        console.log('[MarkSyncr] Token refreshed successfully via legacy refresh_token');
        await storeSession(data.session);
        return true;
      }
    } catch (err) {
      console.error('[MarkSyncr] Legacy token refresh error:', err);
    }
  }

  console.log('[MarkSyncr] No valid refresh token available');
  return false;
}

/**
 * Check if user is logged in (has valid session token)
 * Will attempt to refresh token if expired
 */
async function isLoggedIn() {
  const token = await getAccessToken();
  return !!token;
}

/**
 * Validate the current token by making a test request
 * @returns {Promise<boolean>} - True if token is valid
 */
async function validateToken() {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if the access token is expired or about to expire
 * We refresh proactively 5 minutes before expiry to avoid mid-operation failures
 * @returns {Promise<boolean>} - True if token is expired or expiring soon
 */
async function isTokenExpiredOrExpiringSoon() {
  const session = await getSession();
  if (!session?.access_token_expires_at) {
    // No expiry stored, assume expired to trigger refresh
    return true;
  }

  const expiresAt = new Date(session.access_token_expires_at).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  // Return true if token expires within 5 minutes
  return now >= expiresAt - fiveMinutes;
}

/**
 * Ensure we have a valid token, refreshing if necessary
 * Uses proactive refresh based on stored expiry time to avoid network calls
 * @returns {Promise<boolean>} - True if we have a valid token
 */
async function ensureValidToken() {
  // First check if we have a token at all
  const token = await getAccessToken();
  if (!token) {
    console.log('[MarkSyncr] No access token found');
    return false;
  }

  // Check if token is expired or expiring soon (proactive refresh)
  const needsRefresh = await isTokenExpiredOrExpiringSoon();
  if (needsRefresh) {
    console.log('[MarkSyncr] Token expired or expiring soon, proactively refreshing...');
    const refreshed = await tryRefreshToken();

    if (!refreshed) {
      // Refresh failed - try validating anyway (token might still work)
      console.log('[MarkSyncr] Proactive refresh failed, validating current token...');
      const isValid = await validateToken();
      if (isValid) {
        return true;
      }
      // Don't clear the session here — tryRefreshToken already clears on definitive 401.
      // Temporary failures (503, network errors) should NOT destroy the extension_token.
      console.log('[MarkSyncr] Token invalid and refresh failed, will retry on next attempt');
      return false;
    }
    return true;
  }

  // Token should be valid based on expiry, but validate to be sure
  // Only do this if we haven't refreshed recently (avoid unnecessary network calls)
  const isValid = await validateToken();
  if (isValid) {
    return true;
  }

  // Token validation failed despite not being expired - try refresh
  console.log('[MarkSyncr] Token validation failed unexpectedly, attempting refresh...');
  const refreshed = await tryRefreshToken();

  if (!refreshed) {
    // Don't clear — preserve extension_token for future retry.
    // tryRefreshToken handles clearing on definitive 401 (session revoked/expired).
    console.log('[MarkSyncr] Token refresh failed, will retry on next attempt');
    return false;
  }

  return true;
}

/**
 * Make an authenticated API request using Bearer token
 */
async function apiRequest(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();
  const token = await getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add Authorization header if we have a token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  return response;
}

/**
 * Sync bookmarks to cloud (with tombstones for deletion sync)
 * @param {Array} bookmarks - Bookmarks to sync
 * @param {string} source - Source identifier (browser type)
 * @param {Array} tombstones - Tombstones for deleted bookmarks
 */
async function syncBookmarksToCloud(bookmarks, source = 'browser', tombstones = []) {
  try {
    const response = await apiRequest('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ bookmarks, source, tombstones }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to sync bookmarks');
    }

    return await response.json();
  } catch (err) {
    console.error('[MarkSyncr] Failed to sync bookmarks to cloud:', err);
    throw err;
  }
}

/**
 * Save bookmark version to cloud
 */
async function saveVersionToCloud(bookmarkData, sourceType, deviceName, changeSummary = {}) {
  try {
    const response = await apiRequest('/api/versions', {
      method: 'POST',
      body: JSON.stringify({
        bookmarkData,
        sourceType,
        deviceName,
        changeSummary,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save version');
    }

    return await response.json();
  } catch (err) {
    console.error('[MarkSyncr] Failed to save version to cloud:', err);
    throw err;
  }
}

/**
 * Generate a unique device ID for this browser instance
 * @returns {Promise<string>}
 */
async function getDeviceId() {
  const { deviceId } = await browser.storage.local.get('deviceId');
  if (deviceId) {
    return deviceId;
  }

  // Generate a new device ID
  const newDeviceId = `${detectBrowser()}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  await browser.storage.local.set({ deviceId: newDeviceId });
  return newDeviceId;
}

/**
 * Get OS information
 * @returns {string}
 */
function detectOS() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

/**
 * Register this device with the server
 * @returns {Promise<{success: boolean, device?: object, error?: string}>}
 */
async function registerDevice() {
  try {
    const deviceId = await getDeviceId();
    const browserName = detectBrowser();
    const os = detectOS();

    const response = await apiRequest('/api/devices', {
      method: 'POST',
      body: JSON.stringify({
        deviceId,
        name: `${browserName.charAt(0).toUpperCase() + browserName.slice(1)} on ${os}`,
        browser: browserName,
        os,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.warn('[MarkSyncr] Failed to register device:', data.error);
      return { success: false, error: data.error };
    }

    const data = await response.json();
    console.log('[MarkSyncr] Device registered:', data.device);
    return { success: true, device: data.device };
  } catch (err) {
    console.warn('[MarkSyncr] Device registration error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get bookmarks from cloud
 */
async function getBookmarksFromCloud() {
  try {
    const response = await apiRequest('/api/bookmarks', {
      method: 'GET',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to get bookmarks from cloud');
    }

    return await response.json();
  } catch (err) {
    console.error('[MarkSyncr] Failed to get bookmarks from cloud:', err);
    throw err;
  }
}

/**
 * Get latest version data from cloud
 */
async function getLatestVersionFromCloud() {
  try {
    const response = await apiRequest('/api/versions?limit=1', {
      method: 'GET',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to get latest version');
    }

    const data = await response.json();
    if (!data.versions || data.versions.length === 0) {
      return null;
    }

    // Get full version data
    const versionResponse = await apiRequest(`/api/versions/${data.versions[0].version}`, {
      method: 'GET',
    });

    if (!versionResponse.ok) {
      const errorData = await versionResponse.json();
      throw new Error(errorData.error || 'Failed to get version data');
    }

    return await versionResponse.json();
  } catch (err) {
    console.error('[MarkSyncr] Failed to get latest version from cloud:', err);
    throw err;
  }
}

/**
 * Initialize the background script
 * Note: Firefox MV3 uses persistent background scripts, not service workers
 * Chrome MV3 uses service workers
 */
async function initialize() {
  const browserInfo = detectBrowser();
  const isFirefox = browserInfo === 'firefox';

  console.log(`[MarkSyncr] Background script initialized (${browserInfo})`);
  console.log(`[MarkSyncr] User agent: ${navigator.userAgent}`);
  console.log(
    `[MarkSyncr] Script type: ${isFirefox ? 'persistent background script' : 'service worker'}`
  );

  // Set up alarm for automatic sync
  await setupAutoSync();

  // Set up alarm for proactive token refresh (keeps session alive independent of sync)
  await setupTokenRefreshAlarm();

  // Restore locally modified bookmark IDs from storage (survives service worker restarts)
  locallyModifiedBookmarkIds = await loadLocallyModifiedIds();
  console.log(
    `[MarkSyncr] Restored ${locallyModifiedBookmarkIds.size} locally modified bookmark IDs from storage`
  );

  // Listen for bookmark changes
  setupBookmarkListeners();

  // For Firefox, set up a periodic check to ensure alarm is still active
  // Firefox background scripts are persistent, so we can use setInterval
  if (isFirefox) {
    console.log('[MarkSyncr] Firefox detected - setting up alarm health check');

    // Check alarm health every 2 minutes
    setInterval(
      async () => {
        const { settings } = await browser.storage.local.get('settings');
        const expectedInterval = settings?.syncInterval || DEFAULT_SYNC_INTERVAL;

        const alarm = await browser.alarms.get(SYNC_ALARM_NAME);
        if (!alarm) {
          console.warn('[MarkSyncr] Firefox: Alarm not found, recreating...');
          await setupAutoSync();
        } else {
          const nextFire = new Date(alarm.scheduledTime);
          const now = new Date();
          const minutesUntilFire = Math.round((nextFire - now) / 60000);

          // Check if alarm interval matches expected interval OR if alarm is stale
          if (alarm.periodInMinutes !== expectedInterval) {
            console.warn(
              `[MarkSyncr] Firefox: Alarm interval mismatch (${alarm.periodInMinutes} vs ${expectedInterval}), recreating...`
            );
            await browser.alarms.clear(SYNC_ALARM_NAME);
            await setupAutoSync();
          } else if (nextFire <= now) {
            // Alarm is stale (scheduled time in past) - recreate it
            console.warn(
              `[MarkSyncr] Firefox: Alarm is stale (scheduled for ${nextFire.toISOString()}), recreating...`
            );
            await browser.alarms.clear(SYNC_ALARM_NAME);
            await setupAutoSync();
          } else {
            console.log(
              `[MarkSyncr] Firefox: Alarm health check OK - next fire in ${minutesUntilFire} minutes (interval: ${alarm.periodInMinutes})`
            );
          }
        }
      },
      2 * 60 * 1000
    ); // Every 2 minutes
  }

  // Log that initialization is complete
  console.log('[MarkSyncr] Initialization complete');
}

/**
 * Set up automatic sync alarm
 */
async function setupAutoSync() {
  try {
    const browserInfo = detectBrowser();
    const { settings } = await browser.storage.local.get('settings');
    const interval = settings?.syncInterval || DEFAULT_SYNC_INTERVAL;

    // Auto-sync is enabled by default (when settings.autoSync is undefined or true)
    const autoSyncEnabled = settings?.autoSync !== false;

    console.log(
      `[MarkSyncr] Auto-sync setup (${browserInfo}): enabled=${autoSyncEnabled}, interval=${interval} minutes`
    );

    if (autoSyncEnabled) {
      // Check if alarm already exists
      const existingAlarm = await browser.alarms.get(SYNC_ALARM_NAME);

      if (existingAlarm) {
        console.log(`[MarkSyncr] Existing alarm found:`, existingAlarm);
        const nextFireTime = new Date(existingAlarm.scheduledTime);
        const now = new Date();
        console.log(`[MarkSyncr] Next fire time: ${nextFireTime.toISOString()}`);
        console.log(`[MarkSyncr] Current time: ${now.toISOString()}`);

        // Check if the alarm interval matches the settings
        // If not, recreate the alarm
        if (existingAlarm.periodInMinutes !== interval) {
          console.log(
            `[MarkSyncr] Alarm interval mismatch (${existingAlarm.periodInMinutes} vs ${interval}), recreating...`
          );
          await browser.alarms.clear(SYNC_ALARM_NAME);
        } else if (nextFireTime <= now) {
          // Alarm's scheduledTime is in the past - this is stale and won't fire correctly
          // This can happen after browser sleep, system hibernate, or clock changes
          console.log(
            `[MarkSyncr] Alarm is stale (scheduled for past: ${nextFireTime.toISOString()}), recreating...`
          );
          await browser.alarms.clear(SYNC_ALARM_NAME);
        } else {
          console.log(`[MarkSyncr] Alarm already configured correctly, skipping recreation`);
          return;
        }
      }

      // Create new alarm with both delayInMinutes and periodInMinutes
      // delayInMinutes: fire first alarm after 'interval' minutes
      // periodInMinutes: then repeat every 'interval' minutes
      await browser.alarms.create(SYNC_ALARM_NAME, {
        delayInMinutes: interval,
        periodInMinutes: interval,
      });

      console.log(
        `[MarkSyncr] Auto-sync alarm created: first fire in ${interval} minutes, then every ${interval} minutes`
      );

      // Verify the alarm was created
      const verifyAlarm = await browser.alarms.get(SYNC_ALARM_NAME);
      if (verifyAlarm) {
        const nextFireTime = new Date(verifyAlarm.scheduledTime);
        console.log(`[MarkSyncr] Alarm verified - next fire: ${nextFireTime.toISOString()}`);
      } else {
        console.error(`[MarkSyncr] ERROR: Alarm was not created!`);
      }

      // Log all current alarms for debugging
      const alarms = await browser.alarms.getAll();
      console.log('[MarkSyncr] All current alarms:', JSON.stringify(alarms));
    } else {
      // Auto-sync disabled, clear any existing alarm
      await browser.alarms.clear(SYNC_ALARM_NAME);
      console.log('[MarkSyncr] Auto-sync disabled, alarm cleared');
    }
  } catch (err) {
    console.error('[MarkSyncr] Failed to set up auto-sync:', err);
  }
}

/**
 * Set up a periodic alarm to proactively refresh the access token.
 * This runs independently of auto-sync so sessions stay alive even
 * when sync is disabled. Fires every 50 minutes (before the 1-hour JWT expiry).
 */
async function setupTokenRefreshAlarm() {
  try {
    const existing = await browser.alarms.get(TOKEN_REFRESH_ALARM_NAME);
    if (existing) {
      console.log('[MarkSyncr] Token refresh alarm already exists');
      return;
    }

    await browser.alarms.create(TOKEN_REFRESH_ALARM_NAME, {
      delayInMinutes: TOKEN_REFRESH_INTERVAL,
      periodInMinutes: TOKEN_REFRESH_INTERVAL,
    });
    console.log(
      `[MarkSyncr] Token refresh alarm created: every ${TOKEN_REFRESH_INTERVAL} minutes`
    );
  } catch (err) {
    console.error('[MarkSyncr] Failed to set up token refresh alarm:', err);
  }
}

/**
 * Set up bookmark change listeners
 */
function setupBookmarkListeners() {
  // Listen for bookmark creation - remove tombstone if bookmark is re-added
  browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
    console.log('[MarkSyncr] Bookmark created:', bookmark.title);

    // Always track locally modified bookmarks, even during sync
    locallyModifiedBookmarkIds.add(id);
    debouncedSaveLocallyModifiedIds();

    // Skip processing during sync operations to prevent sync loops
    // BUT mark that we need a follow-up sync after current sync completes
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Queuing pending sync (bookmark created during sync)');
      pendingSyncNeeded = true;
      pendingSyncReasons.push('bookmark-created-during-sync');
      return;
    }

    // If a bookmark is re-added, remove its tombstone
    if (bookmark.url) {
      await removeTombstone(bookmark.url);
    }

    console.log(`[MarkSyncr] Tracked locally created bookmark: ${id}`);
  });

  // Listen for bookmark removal - add tombstone for deletion sync
  browser.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
    console.log('[MarkSyncr] Bookmark removed:', id, removeInfo);

    // Skip tombstone creation during sync operations to prevent sync loops
    // Force Pull clears all bookmarks before recreating from cloud,
    // so we don't want to create tombstones for those deletions
    if (isForcePullInProgress) {
      console.log('[MarkSyncr] Skipping tombstone (force pull in progress)');
      return;
    }

    // Always track locally modified bookmarks, even during sync
    locallyModifiedBookmarkIds.add(id);
    debouncedSaveLocallyModifiedIds();

    // ALWAYS create tombstones for deleted bookmarks, even during sync.
    // Without a tombstone, the next sync will re-add the bookmark from cloud.
    // The tombstone is the only way to signal "this bookmark was intentionally deleted."
    if (removeInfo.node?.url) {
      await addTombstone(removeInfo.node.url);
      console.log('[MarkSyncr] Added tombstone for deleted bookmark:', removeInfo.node.url);
    } else if (removeInfo.node?.children) {
      // It's a folder - add tombstones for all bookmarks in the folder
      await addTombstonesForFolder(removeInfo.node);
    }

    if (isSyncInProgress) {
      // Queue a follow-up sync to capture these changes
      console.log('[MarkSyncr] Queuing pending sync (bookmark removed during sync)');
      pendingSyncNeeded = true;
      pendingSyncReasons.push('bookmark-removed-during-sync');
      return;
    }

    console.log(`[MarkSyncr] Tracked locally removed bookmark: ${id}`);
  });

  // Listen for bookmark changes
  browser.bookmarks.onChanged.addListener((id, changeInfo) => {
    console.log('[MarkSyncr] Bookmark changed:', id);

    // Always track locally modified bookmarks, even during sync
    locallyModifiedBookmarkIds.add(id);
    debouncedSaveLocallyModifiedIds();

    // Skip during sync operations to prevent sync loops
    // BUT mark that we need a follow-up sync after current sync completes
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Queuing pending sync (bookmark changed during sync)');
      pendingSyncNeeded = true;
      pendingSyncReasons.push('bookmark-changed-during-sync');
      return;
    }

    console.log(`[MarkSyncr] Tracked locally changed bookmark: ${id}`);
  });

  // Listen for bookmark moves
  browser.bookmarks.onMoved.addListener((id, moveInfo) => {
    console.log('[MarkSyncr] Bookmark moved:', id);

    // Always track locally modified bookmarks, even during sync
    locallyModifiedBookmarkIds.add(id);
    debouncedSaveLocallyModifiedIds();

    // Skip during sync operations to prevent sync loops
    // BUT mark that we need a follow-up sync after current sync completes
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Queuing pending sync (bookmark moved during sync)');
      pendingSyncNeeded = true;
      pendingSyncReasons.push('bookmark-moved-during-sync');
      return;
    }

    console.log(`[MarkSyncr] Tracked locally moved bookmark: ${id}`);
  });
}

/**
 * Add tombstones for all bookmarks in a folder (recursive)
 * @param {object} folder - Folder node with children
 */
async function addTombstonesForFolder(folder) {
  if (!folder.children) return;

  for (const child of folder.children) {
    if (child.url) {
      await addTombstone(child.url);
    } else if (child.children) {
      await addTombstonesForFolder(child);
    }
  }
}


/**
 * Flatten bookmark tree to array for API sync
 * Now includes BOTH bookmarks AND folders with their index for complete ordering
 *
 * @param {Array} tree - Browser bookmark tree
 * @returns {Array} - Flat array of bookmarks AND folders with ordering information
 */
function flattenBookmarkTree(tree) {
  const items = [];

  function traverse(nodes, parentPath = '') {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeIndex = node.index ?? i;

      if (node.url) {
        // It's a bookmark
        items.push({
          type: 'bookmark',
          id: node.id,
          url: node.url,
          // Preserve empty titles - don't replace with URL
          title: node.title ?? '',
          folderPath: parentPath,
          dateAdded: node.dateAdded,
          // Track the index within the parent folder for ordering
          index: nodeIndex,
        });
      } else if (node.children) {
        // It's a folder - add folder metadata
        const folderPath = node.title
          ? parentPath
            ? `${parentPath}/${node.title}`
            : node.title
          : parentPath;

        // Only add folder entry if:
        // 1. It has a title (skip root nodes without titles)
        // 2. It's NOT a root-level folder (parentPath is not empty)
        // Root folders like "Bookmarks Bar", "Other Bookmarks" already exist in the browser
        // and shouldn't be recreated during sync
        if (node.title && parentPath) {
          items.push({
            type: 'folder',
            id: node.id,
            title: node.title,
            folderPath: parentPath, // Parent path (where this folder lives)
            dateAdded: node.dateAdded,
            index: nodeIndex,
          });
        }

        // Recurse into children
        traverse(node.children, folderPath);
      }
    }
  }

  traverse(tree);
  return items;
}

/**
 * Perform bookmark sync (two-way: pull from cloud, merge, push back, with tombstone support)
 * @param {string} [sourceId] - Optional specific source to sync with
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function performSync(sourceId) {
  console.log('[MarkSyncr] performSync called with sourceId:', sourceId);

  // Prevent concurrent syncs and sync loops
  if (isSyncInProgress) {
    console.log('[MarkSyncr] Sync already in progress, skipping');
    return { success: false, error: 'Sync already in progress' };
  }

  // Stop retrying after MAX_CONSECUTIVE_FAILURES
  if (consecutiveSyncFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.error(
      `[MarkSyncr] Sync disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Last error: ${lastSyncError}`
    );
    return {
      success: false,
      error: `Sync stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Please check your connection and try again manually. Last error: ${lastSyncError}`,
      retryLimitReached: true,
    };
  }

  isSyncInProgress = true;
  console.log('[MarkSyncr] Sync started, setting isSyncInProgress=true');

  try {
    const storageData = await browser.storage.local.get(['selectedSource', 'sources', 'session']);

    const { selectedSource, sources, session } = storageData;

    console.log('[MarkSyncr] Storage data:');
    console.log('  - selectedSource:', selectedSource);
    console.log('  - sources count:', sources?.length || 0);
    console.log('  - has session:', !!session);
    console.log('  - has access_token:', !!session?.access_token);

    const targetSourceId = sourceId || selectedSource;

    if (!targetSourceId) {
      console.log('[MarkSyncr] No sync source configured');
      return {
        success: false,
        error: 'No sync source configured. Please select a source in the extension popup.',
      };
    }

    console.log(`[MarkSyncr] Starting two-way sync with source: ${targetSourceId}`);

    // Get source configuration
    const source = sources?.find((s) => s.id === targetSourceId);
    console.log('[MarkSyncr] Source config:', source);

    // Browser bookmarks source is always available
    const isBrowserSource = targetSourceId === 'browser-bookmarks';

    if (!isBrowserSource && !source?.connected) {
      console.log('[MarkSyncr] Source not connected:', targetSourceId, source);
      return {
        success: false,
        error: `Source "${targetSourceId}" is not connected. Please connect it first.`,
      };
    }

    // Ensure we have a valid token (will attempt refresh if expired)
    console.log('[MarkSyncr] Validating authentication...');
    const hasValidToken = await ensureValidToken();
    console.log('[MarkSyncr] Has valid token:', hasValidToken);

    // Cloud sync requires authentication
    if (!hasValidToken) {
      console.log('[MarkSyncr] No valid token, cannot sync to cloud');
      return {
        success: false,
        error:
          'Please log in to sync bookmarks to the cloud. Go to the Account tab in the extension popup.',
        requiresAuth: true,
      };
    }

    // Register this device with the server (updates last_seen_at if already registered)
    console.log('[MarkSyncr] Registering device...');
    await registerDevice();

    // Two-way sync with tombstone support
    try {
      // Step 1: Get current local bookmarks and tombstones
      const bookmarkTree = await browser.bookmarks.getTree();
      const localFlat = flattenBookmarkTree(bookmarkTree);
      const localTombstones = await getTombstones();
      console.log(`[MarkSyncr] Local bookmarks: ${localFlat.length}`);
      console.log(`[MarkSyncr] Local tombstones: ${localTombstones.length}`);

      // Debug: Log sample local tombstones
      if (localTombstones.length > 0) {
        console.log(
          '[MarkSyncr] Sample local tombstones:',
          JSON.stringify(localTombstones.slice(0, 3))
        );
      }

      // Step 2: Get bookmarks and tombstones from cloud
      console.log('[MarkSyncr] 📥 Fetching cloud bookmarks...');
      const cloudData = await getBookmarksFromCloud();
      const cloudBookmarks = cloudData.bookmarks || [];
      const cloudTombstones = cloudData.tombstones || [];
      console.log(`[MarkSyncr] 📥 Cloud data received:`);
      console.log(`  - Bookmarks: ${cloudBookmarks.length}`);
      console.log(`  - Tombstones: ${cloudTombstones.length}`);
      console.log(`  - Cloud checksum: ${cloudData.checksum || 'none'}`);
      console.log(`  - Cloud version: ${cloudData.version || 'none'}`);

      // Step 2.5: Get last sync time for tombstone safeguard
      const lastSyncTime = await getLastSyncTime();
      console.log(
        `[MarkSyncr] Last sync time: ${lastSyncTime ? new Date(lastSyncTime).toISOString() : 'never'}`
      );

      // Step 3: Apply cloud tombstones to local bookmarks (delete locally if deleted elsewhere)
      // IMPORTANT: Use the tombstone safeguard to prevent unintended deletions
      // when local storage was cleared but cloud still has old tombstones
      let deletedLocally = 0;
      if (cloudTombstones.length > 0) {
        // Filter tombstones using the safeguard
        const tombstonesToApply = filterTombstonesToApply(
          cloudTombstones,
          localTombstones,
          lastSyncTime
        );

        if (tombstonesToApply.length > 0) {
          deletedLocally = await applyTombstonesToLocal(tombstonesToApply, localFlat);
          console.log(
            `[MarkSyncr] Deleted ${deletedLocally} local bookmarks based on ${tombstonesToApply.length} filtered cloud tombstones`
          );
        } else {
          console.log(`[MarkSyncr] No tombstones to apply after safeguard filtering`);
        }
      }

      // Step 4: Merge tombstones (keep the newest deletion time for each URL)
      const mergedTombstones = mergeTombstonesLocal(localTombstones, cloudTombstones);
      await storeTombstones(mergedTombstones);
      console.log(`[MarkSyncr] Merged tombstones: ${mergedTombstones.length}`);

      // Step 5: Get updated local bookmarks after applying tombstones
      const updatedTree = await browser.bookmarks.getTree();
      const updatedLocalFlat = flattenBookmarkTree(updatedTree);

      // Step 6: Categorize cloud bookmarks into those to add vs update
      // This uses the new categorizeCloudBookmarks function that properly handles:
      // - New bookmarks (URL not in local)
      // - Updated bookmarks (URL exists but title/folder/index differs)
      // - Tombstone filtering (only add if bookmark is newer than tombstone)
      const { toAdd: newFromCloud, toUpdate: bookmarksToUpdate } = categorizeCloudBookmarks(
        cloudBookmarks,
        updatedLocalFlat,
        mergedTombstones,
        locallyModifiedBookmarkIds
      );

      console.log(`[MarkSyncr] 🔍 New bookmarks from cloud: ${newFromCloud.length}`);
      console.log(`[MarkSyncr] 🔍 Bookmarks to update from cloud: ${bookmarksToUpdate.length}`);

      if (newFromCloud.length > 0) {
        console.log(
          '[MarkSyncr] 🔍 Sample new bookmarks from cloud:',
          newFromCloud.slice(0, 3).map((b) => ({
            url: b.url,
            title: b.title,
            folderPath: b.folderPath,
          }))
        );
      }

      if (bookmarksToUpdate.length > 0) {
        console.log(
          '[MarkSyncr] 🔍 Sample bookmarks to update:',
          bookmarksToUpdate.slice(0, 3).map((u) => ({
            url: u.cloud.url,
            cloudTitle: u.cloud.title,
            localTitle: u.local.title,
            cloudFolder: u.cloud.folderPath,
            localFolder: u.local.folderPath,
          }))
        );
      }

      // Step 6.5: Find local bookmarks that are not in cloud (local additions to push)
      // This is used to determine if we have local changes that need to be pushed
      const cloudUrls = new Set(cloudBookmarks.filter((b) => b.url).map((b) => b.url));
      const localAdditions = updatedLocalFlat.filter((lb) => {
        // Skip folders (they don't have URLs)
        if (!lb.url) {
          return false;
        }
        // Check if this local bookmark exists in cloud
        return !cloudUrls.has(lb.url);
      });
      console.log(`[MarkSyncr] Local additions (not in cloud): ${localAdditions.length}`);

      // Step 7: Add new cloud bookmarks to local browser
      if (newFromCloud.length > 0) {
        await addCloudBookmarksToLocal(newFromCloud);
        console.log(`[MarkSyncr] Added ${newFromCloud.length} bookmarks from cloud to local`);
      }

      // Step 7.5: Apply updates from cloud to local bookmarks
      // This is critical for proper two-way sync: if another browser modified
      // a bookmark's title, folder, or position, those changes should be pulled here.
      let updatedLocally = 0;
      if (bookmarksToUpdate.length > 0) {
        console.log(`[MarkSyncr] Found ${bookmarksToUpdate.length} bookmarks to update from cloud`);
        updatedLocally = await updateLocalBookmarksFromCloud(bookmarksToUpdate);
        console.log(`[MarkSyncr] Updated ${updatedLocally} local bookmarks from cloud`);
      }

      // Step 8: Get final local bookmarks after all merges
      const finalTree = await browser.bookmarks.getTree();
      const mergedFlat = flattenBookmarkTree(finalTree);
      const mergedData = convertBrowserBookmarks(finalTree);
      // Pass the merged bookmark count as synced count since we're syncing to cloud
      const stats = countBookmarks(finalTree, mergedFlat.filter((b) => b.url).length);

      // Step 8.5: Check if there are any actual changes by comparing checksums
      // Generate checksum of merged bookmarks (same algorithm as server)
      const localChecksum = await generateChecksum(mergedFlat);
      const cloudChecksum = cloudData.checksum;

      console.log(`[MarkSyncr] Local checksum: ${localChecksum}`);
      console.log(`[MarkSyncr] Cloud checksum: ${cloudChecksum}`);

      // Determine if we have local changes to push to cloud
      // Local changes = bookmarks that exist locally but not in cloud (before this sync)
      // OR bookmarks that differ from cloud (local-first model: local changes override cloud)
      // OR tombstones that need to be synced
      const hasLocalChangesToPush =
        localAdditions.length > 0 ||
        bookmarksToUpdate.length > 0 ||
        locallyModifiedBookmarkIds.size > 0 ||
        localTombstones.length > cloudTombstones.length ||
        deletedLocally > 0;

      // Check if there were any changes during this sync
      const hasChanges =
        newFromCloud.length > 0 || deletedLocally > 0 || localChecksum !== cloudChecksum;

      console.log(
        `[MarkSyncr] Has changes: ${hasChanges}, Has local changes to push: ${hasLocalChangesToPush}`
      );

      if (!hasChanges) {
        console.log('[MarkSyncr] No changes detected - checksums match and no new bookmarks');

        // Update last sync time even when skipping (both ISO string and timestamp)
        const syncTimestamp = Date.now();
        await browser.storage.local.set({
          lastSync: new Date(syncTimestamp).toISOString(),
        });
        await storeLastSyncTime(syncTimestamp);

        // Store the cloud checksum for future reference
        await storeLastCloudChecksum(cloudChecksum);

        // Reset failure count on success (even skipped syncs are successful)
        consecutiveSyncFailures = 0;
        lastSyncError = null;

        // Clear locally modified tracking - changes are in sync
        locallyModifiedBookmarkIds.clear();
        await saveLocallyModifiedIds();

        return {
          success: true,
          stats,
          addedFromCloud: 0,
          updatedLocally: 0,
          deletedLocally: 0,
          pushedToCloud: 0,
          skipped: true,
          message: 'No new updates',
        };
      }

      // Step 9: Push merged bookmarks and tombstones back to cloud
      console.log(
        `[MarkSyncr] Pushing ${mergedFlat.length} merged bookmarks and ${mergedTombstones.length} tombstones to cloud...`
      );
      const syncResult = await syncBookmarksToCloud(mergedFlat, detectBrowser(), mergedTombstones);
      console.log('[MarkSyncr] Cloud sync result:', syncResult);

      // Store the new checksum
      if (syncResult.checksum) {
        await storeLastCloudChecksum(syncResult.checksum);
      }

      // Step 10: Save version history ONLY when we have local changes being pushed to cloud
      // This prevents version history from being cluttered with "pull-only" syncs
      // Version history should only record when THIS browser pushes changes to cloud/3rd-party storage
      // NOTE: Version save is non-blocking - sync succeeds even if version save fails (e.g., timeout)
      if (hasLocalChangesToPush) {
        console.log('[MarkSyncr] Saving version history (local changes pushed to cloud)...');
        try {
          const versionResult = await saveVersionToCloud(
            mergedData,
            detectBrowser(),
            `${detectBrowser()}-extension`,
            {
              type: 'two_way_sync',
              addedFromCloud: newFromCloud.length,
              deletedLocally,
              pushedToCloud: localAdditions.length,
              tombstones: mergedTombstones.length,
            }
          );
          console.log('[MarkSyncr] Version saved:', versionResult);
        } catch (versionErr) {
          // Don't fail the sync because of version save failure
          console.warn('[MarkSyncr] Version save failed (sync will continue):', versionErr.message);
        }
      } else {
        console.log(
          '[MarkSyncr] Skipping version history (only pulled from cloud, no local changes pushed)'
        );
      }

      // Step 11: Cleanup old tombstones (older than 30 days)
      await cleanupOldTombstones();

      console.log('[MarkSyncr] Two-way sync with tombstones completed:', stats);

      // Update last sync time (both ISO string for display and timestamp for tombstone safeguard)
      const syncTimestamp = Date.now();
      await browser.storage.local.set({
        lastSync: new Date(syncTimestamp).toISOString(),
      });
      await storeLastSyncTime(syncTimestamp);

      // Reset failure count on success
      consecutiveSyncFailures = 0;
      lastSyncError = null;

      // Clear locally modified tracking - changes have been pushed to cloud
      locallyModifiedBookmarkIds.clear();
      await saveLocallyModifiedIds();

      return {
        success: true,
        stats,
        addedFromCloud: newFromCloud.length,
        updatedLocally,
        deletedLocally,
        pushedToCloud: localAdditions.length,
      };
    } catch (cloudErr) {
      console.error('[MarkSyncr] Cloud sync failed:', cloudErr);
      consecutiveSyncFailures++;
      lastSyncError = cloudErr.message;
      console.warn(
        `[MarkSyncr] Consecutive sync failures: ${consecutiveSyncFailures}/${MAX_CONSECUTIVE_FAILURES}`
      );
      return { success: false, error: `Cloud sync failed: ${cloudErr.message}` };
    }
  } catch (err) {
    console.error('[MarkSyncr] Sync failed:', err);
    consecutiveSyncFailures++;
    lastSyncError = err.message;
    console.warn(
      `[MarkSyncr] Consecutive sync failures: ${consecutiveSyncFailures}/${MAX_CONSECUTIVE_FAILURES}`
    );
    return { success: false, error: err.message };
  } finally {
    // Always reset the sync flag, even if an error occurred
    isSyncInProgress = false;
    console.log('[MarkSyncr] Sync completed, setting isSyncInProgress=false');

    // Check if any bookmark changes occurred during sync that need a follow-up sync
    if (pendingSyncNeeded) {
      const reasons = pendingSyncReasons.join(', ');
      console.log(`[MarkSyncr] Pending sync needed due to changes during sync: ${reasons}`);

      // Reset pending sync state
      pendingSyncNeeded = false;
      pendingSyncReasons = [];

      // Schedule a follow-up sync with a short delay to capture the pending changes
      // Use a shorter delay (2 seconds) since user already made changes
      setTimeout(async () => {
        console.log('[MarkSyncr] Triggering follow-up sync for pending changes');
        await performSync();
      }, 2000);
    }
  }
}

/**
 * Apply tombstones from cloud to local bookmarks (delete bookmarks that were deleted elsewhere)
 *
 * IMPORTANT: We do NOT compare dateAdded vs deletedAt here because:
 * 1. When bookmarks are synced from cloud to local, browser.bookmarks.create()
 *    assigns the CURRENT time as dateAdded (we can't set it)
 * 2. This means locally-synced bookmarks always have dateAdded > tombstone.deletedAt
 * 3. So we would never delete them, breaking cross-browser deletion sync
 *
 * Instead, we simply delete any local bookmark that has a matching tombstone.
 * The date comparison is only used when deciding whether to ADD bookmarks from cloud
 * (in Step 6 of performSync), where we skip adding if tombstone is newer.
 *
 * @param {Array<{url: string, deletedAt: number}>} tombstones - Tombstones from cloud
 * @param {Array} localBookmarks - Current local bookmarks
 * @returns {Promise<number>} - Number of bookmarks deleted
 */
async function applyTombstonesToLocal(tombstones, localBookmarks) {
  let deletedCount = 0;

  console.log(
    `[MarkSyncr] applyTombstonesToLocal: ${tombstones.length} tombstones, ${localBookmarks.length} local bookmarks`
  );

  // Debug: Log first few tombstones
  if (tombstones.length > 0) {
    console.log(
      '[MarkSyncr] Sample tombstones:',
      tombstones.slice(0, 5).map((t) => ({
        url: t.url,
        deletedAt: t.deletedAt,
        deletedAtDate: new Date(t.deletedAt).toISOString(),
      }))
    );
  }

  // Debug: Log first few local bookmarks
  if (localBookmarks.length > 0) {
    console.log(
      '[MarkSyncr] Sample local bookmarks:',
      localBookmarks.slice(0, 5).map((b) => ({
        url: b.url,
        title: b.title,
      }))
    );
  }

  // Create a set of tombstoned URLs for quick lookup
  const tombstonedUrls = new Set(tombstones.map((t) => t.url));

  // Debug: Check for any matches
  let matchCount = 0;
  for (const bookmark of localBookmarks) {
    if (tombstonedUrls.has(bookmark.url)) {
      matchCount++;
    }
  }
  console.log(`[MarkSyncr] Found ${matchCount} local bookmarks that match tombstones`);

  for (const bookmark of localBookmarks) {
    if (tombstonedUrls.has(bookmark.url)) {
      // Skip if this bookmark was locally modified (e.g., user re-added it after deletion)
      // The user's intent to have this bookmark takes priority over the cloud tombstone
      if (locallyModifiedBookmarkIds.has(bookmark.id)) {
        console.log(
          `[MarkSyncr] 🏠 Skipping tombstone for locally modified bookmark: ${bookmark.url}`
        );
        continue;
      }

      console.log(`[MarkSyncr] Tombstone match found for: ${bookmark.url}`);

      try {
        await browser.bookmarks.remove(bookmark.id);
        deletedCount++;
        console.log(`[MarkSyncr] ✓ Deleted local bookmark (tombstoned): ${bookmark.url}`);
      } catch (err) {
        console.warn(`[MarkSyncr] ✗ Failed to delete tombstoned bookmark: ${bookmark.url}`, err);
      }
    }
  }

  console.log(`[MarkSyncr] applyTombstonesToLocal complete: deleted ${deletedCount} bookmarks`);
  return deletedCount;
}

/**
 * Merge local and cloud tombstones, keeping the newest deletion time for each URL
 * @param {Array<{url: string, deletedAt: number}>} localTombstones
 * @param {Array<{url: string, deletedAt: number}>} cloudTombstones
 * @returns {Array<{url: string, deletedAt: number}>}
 */
function mergeTombstonesLocal(localTombstones, cloudTombstones) {
  const tombstoneMap = new Map();

  // Add local tombstones
  for (const t of localTombstones) {
    tombstoneMap.set(t.url, t.deletedAt);
  }

  // Merge cloud tombstones (keep newest)
  for (const t of cloudTombstones) {
    const existing = tombstoneMap.get(t.url);
    if (!existing || t.deletedAt > existing) {
      tombstoneMap.set(t.url, t.deletedAt);
    }
  }

  // Convert back to array
  return Array.from(tombstoneMap.entries()).map(([url, deletedAt]) => ({ url, deletedAt }));
}

/**
 * Add bookmarks AND folders from cloud to local browser, respecting ordering
 *
 * IMPORTANT: This function handles BOTH bookmarks (items with URLs) and folders
 * (items with type='folder'). Both need to be created at their correct index
 * positions to preserve the interleaved order from the cloud.
 *
 * @param {Array} cloudItems - Bookmarks and folders from cloud to add locally (with index property)
 */
async function addCloudBookmarksToLocal(cloudItems) {
  // Get current browser bookmarks to find root folders
  const currentTree = await browser.bookmarks.getTree();
  const rootFolders = {};
  const browserType = detectBrowser();

  console.log(
    `[MarkSyncr] addCloudBookmarksToLocal: browser=${browserType}, items to add=${cloudItems.length}`
  );

  // Debug: Log the types of items we're adding
  const bookmarkCount = cloudItems.filter((i) => i.type !== 'folder' && i.url).length;
  const folderCount = cloudItems.filter((i) => i.type === 'folder').length;
  console.log(`[MarkSyncr] Items breakdown: ${bookmarkCount} bookmarks, ${folderCount} folders`);

  if (currentTree[0]?.children) {
    console.log(
      '[MarkSyncr] Root folder children:',
      currentTree[0].children.map((c) => ({ id: c.id, title: c.title }))
    );

    for (const root of currentTree[0].children) {
      const title = root.title?.toLowerCase() || '';
      const id = root.id;

      // Chrome/Opera/Edge/Brave use numeric IDs: '1' for bookmarks bar, '2' for other bookmarks
      // Firefox uses string IDs: 'toolbar_____', 'menu________', 'unfiled_____'
      if (title.includes('toolbar') || title.includes('bar') || id === '1') {
        rootFolders.toolbar = root;
        console.log(`[MarkSyncr] Found toolbar folder: id=${id}, title="${root.title}"`);
      } else if (title.includes('menu') || id === 'menu________') {
        rootFolders.menu = root;
        console.log(`[MarkSyncr] Found menu folder: id=${id}, title="${root.title}"`);
      } else if (
        title.includes('other') ||
        title.includes('unsorted') ||
        id === '2' ||
        id === 'unfiled_____'
      ) {
        rootFolders.other = root;
        console.log(`[MarkSyncr] Found other folder: id=${id}, title="${root.title}"`);
      }
    }
  }

  console.log('[MarkSyncr] Detected root folders:', Object.keys(rootFolders));

  // Create a folder cache for quick lookup (folder path -> folder ID)
  const folderCache = new Map();

  // Helper to determine root folder key and relative path from a folderPath
  function parseRootAndPath(folderPath) {
    let rootFolderKey = 'other';
    let relativePath = folderPath || '';

    const lowerPath = relativePath.toLowerCase();

    if (
      lowerPath.startsWith('bookmarks bar') ||
      lowerPath.startsWith('bookmarks toolbar') ||
      lowerPath.startsWith('speed dial')
    ) {
      rootFolderKey = 'toolbar';
      relativePath = relativePath.split('/').slice(1).join('/');
    } else if (lowerPath.startsWith('bookmarks menu')) {
      rootFolderKey = 'menu';
      relativePath = relativePath.split('/').slice(1).join('/');
    } else if (
      lowerPath.startsWith('other bookmarks') ||
      lowerPath.startsWith('unsorted bookmarks')
    ) {
      rootFolderKey = 'other';
      relativePath = relativePath.split('/').slice(1).join('/');
    }

    return { rootFolderKey, relativePath };
  }

  // Promise cache to prevent race conditions during concurrent folder creation
  // Maps cache key -> Promise<folderId> for in-flight folder lookups/creations
  const pendingFolderOps = new Map();

  // Helper to get or create a single folder segment (with race condition protection)
  async function getOrCreateSingleFolder(parentId, folderName, pathCacheKey) {
    // Check if result is already cached
    if (folderCache.has(pathCacheKey)) {
      return folderCache.get(pathCacheKey);
    }

    // Check if there's an in-flight operation for this path
    if (pendingFolderOps.has(pathCacheKey)) {
      return pendingFolderOps.get(pathCacheKey);
    }

    // Create a promise for this folder operation and store it
    const folderPromise = (async () => {
      // Search for existing folder
      const children = await browser.bookmarks.getChildren(parentId);
      let existingFolder = children.find((c) => !c.url && c.title === folderName);

      if (existingFolder) {
        return existingFolder.id;
      }

      // Create new folder (without index - this is for intermediate folders)
      const newFolder = await browser.bookmarks.create({
        parentId: parentId,
        title: folderName,
      });

      // Double-check for duplicates that might have been created by race condition
      // This handles the case where another operation created the folder just before us
      const updatedChildren = await browser.bookmarks.getChildren(parentId);
      const duplicates = updatedChildren.filter((c) => !c.url && c.title === folderName);

      if (duplicates.length > 1) {
        // Keep the first one (oldest), remove the rest
        console.log(
          `[MarkSyncr] Found ${duplicates.length} duplicate folders named "${folderName}", cleaning up...`
        );
        for (let i = 1; i < duplicates.length; i++) {
          try {
            // Only remove if empty (no children)
            const dupChildren = await browser.bookmarks.getChildren(duplicates[i].id);
            if (dupChildren.length === 0) {
              await browser.bookmarks.remove(duplicates[i].id);
              console.log(`[MarkSyncr] Removed duplicate empty folder: ${duplicates[i].id}`);
            }
          } catch (err) {
            console.warn(`[MarkSyncr] Failed to remove duplicate folder:`, err);
          }
        }
        return duplicates[0].id;
      }

      return newFolder.id;
    })();

    // Store the promise so concurrent calls wait for the same operation
    pendingFolderOps.set(pathCacheKey, folderPromise);

    try {
      const folderId = await folderPromise;
      // Cache the result
      folderCache.set(pathCacheKey, folderId);
      return folderId;
    } finally {
      // Clean up the pending operation
      pendingFolderOps.delete(pathCacheKey);
    }
  }

  // Helper to get or create folder by path (without index - for intermediate folders)
  async function getOrCreateFolderPath(folderPath, parentId) {
    if (!folderPath) return parentId;

    const cacheKey = `${parentId}:${folderPath}`;
    if (folderCache.has(cacheKey)) {
      return folderCache.get(cacheKey);
    }

    const parts = folderPath.split('/').filter((p) => p);
    let currentParentId = parentId;
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const pathCacheKey = `${parentId}:${currentPath}`;

      currentParentId = await getOrCreateSingleFolder(currentParentId, part, pathCacheKey);
    }

    folderCache.set(cacheKey, currentParentId);
    return currentParentId;
  }

  // Group items by their target folder path for proper ordering
  // This groups both bookmarks AND folders that live in the same parent folder
  const itemsByParentFolder = new Map();

  for (const item of cloudItems) {
    const { rootFolderKey, relativePath } = parseRootAndPath(item.folderPath || '');

    const fullPath = `${rootFolderKey}:${relativePath}`;
    if (!itemsByParentFolder.has(fullPath)) {
      itemsByParentFolder.set(fullPath, []);
    }
    itemsByParentFolder.get(fullPath).push({
      ...item,
      _rootFolderKey: rootFolderKey,
      _folderPath: relativePath,
    });
  }

  // Sort items within each folder by their index
  // This ensures folders and bookmarks are interleaved correctly
  for (const [path, items] of itemsByParentFolder) {
    items.sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity));
  }

  // Add items in order
  let addedBookmarks = 0;
  let addedFolders = 0;
  let skippedCount = 0;

  for (const [path, items] of itemsByParentFolder) {
    for (const item of items) {
      try {
        const rootFolder =
          rootFolders[item._rootFolderKey] || rootFolders.other || rootFolders.toolbar;

        if (!rootFolder) {
          console.warn(
            `[MarkSyncr] No root folder found for item: ${item.title}, folderPath: ${item.folderPath}`
          );
          skippedCount++;
          continue;
        }

        // Get or create the target parent folder
        const targetFolderId = await getOrCreateFolderPath(item._folderPath, rootFolder.id);

        if (item.type === 'folder') {
          // It's a folder entry - create the folder at the correct index
          // First check if folder already exists
          const children = await browser.bookmarks.getChildren(targetFolderId);
          const existingFolder = children.find((c) => !c.url && c.title === item.title);

          if (existingFolder) {
            // Folder exists - check if it's at the correct index
            if (typeof item.index === 'number' && existingFolder.index !== item.index) {
              // Move to correct position
              try {
                await browser.bookmarks.move(existingFolder.id, {
                  parentId: targetFolderId,
                  index: item.index,
                });
                console.log(
                  `[MarkSyncr] Moved existing folder "${item.title}" to index ${item.index}`
                );
              } catch (moveErr) {
                console.warn(`[MarkSyncr] Failed to move folder "${item.title}":`, moveErr);
              }
            }
            // Cache the folder ID
            const folderFullPath = item._folderPath
              ? `${item._folderPath}/${item.title}`
              : item.title;
            folderCache.set(`${rootFolder.id}:${folderFullPath}`, existingFolder.id);
          } else {
            // Create new folder at the correct index
            const createOptions = {
              parentId: targetFolderId,
              title: item.title || 'Untitled Folder',
            };

            // Set index if available
            if (typeof item.index === 'number' && item.index >= 0) {
              createOptions.index = item.index;
            }

            const newFolder = await browser.bookmarks.create(createOptions);
            addedFolders++;

            // Cache the new folder ID
            const folderFullPath = item._folderPath
              ? `${item._folderPath}/${item.title}`
              : item.title;
            folderCache.set(`${rootFolder.id}:${folderFullPath}`, newFolder.id);

            console.log(`[MarkSyncr] Created folder "${item.title}" at index ${item.index}`);
          }
        } else if (item.url) {
          // It's a bookmark - create at the correct index
          const createOptions = {
            parentId: targetFolderId,
            title: item.title ?? '',
            url: item.url,
          };

          // Set index if available
          if (typeof item.index === 'number' && item.index >= 0) {
            createOptions.index = item.index;
          }

          await browser.bookmarks.create(createOptions);
          addedBookmarks++;
        }
      } catch (err) {
        console.warn('[MarkSyncr] Failed to add item from cloud:', item.title || item.url, err);
        skippedCount++;
      }
    }
  }

  console.log(
    `[MarkSyncr] addCloudBookmarksToLocal complete: bookmarks=${addedBookmarks}, folders=${addedFolders}, skipped=${skippedCount}, total=${cloudItems.length}`
  );
}

/**
 * Update local bookmarks from cloud data
 * This handles bookmarks that exist both locally and in cloud but have different metadata
 * (title, folder, or position). The cloud version is applied to the local bookmark.
 *
 * @param {Array<{cloud: Object, local: Object}>} bookmarksToUpdate - Array of {cloud, local} pairs
 * @returns {Promise<number>} - Number of bookmarks updated
 */
async function updateLocalBookmarksFromCloud(bookmarksToUpdate) {
  if (!bookmarksToUpdate || bookmarksToUpdate.length === 0) {
    return 0;
  }

  // Get current browser bookmarks to find root folders
  const currentTree = await browser.bookmarks.getTree();
  const rootFolders = {};

  if (currentTree[0]?.children) {
    for (const root of currentTree[0].children) {
      const title = root.title?.toLowerCase() || '';
      const id = root.id;

      if (title.includes('toolbar') || title.includes('bar') || id === '1') {
        rootFolders.toolbar = root;
      } else if (title.includes('menu') || id === 'menu________') {
        rootFolders.menu = root;
      } else if (
        title.includes('other') ||
        title.includes('unsorted') ||
        id === '2' ||
        id === 'unfiled_____'
      ) {
        rootFolders.other = root;
      }
    }
  }

  // Helper to determine root folder key from a folderPath
  function parseRootKey(folderPath) {
    const lowerPath = (folderPath || '').toLowerCase();
    if (
      lowerPath.startsWith('bookmarks bar') ||
      lowerPath.startsWith('bookmarks toolbar') ||
      lowerPath.startsWith('speed dial')
    ) {
      return 'toolbar';
    } else if (lowerPath.startsWith('bookmarks menu')) {
      return 'menu';
    } else if (
      lowerPath.startsWith('other bookmarks') ||
      lowerPath.startsWith('unsorted bookmarks')
    ) {
      return 'other';
    }
    return 'other';
  }

  // Helper to get relative path (without root folder name)
  function getRelativePath(folderPath) {
    if (!folderPath) return '';
    const parts = folderPath.split('/');
    // Remove root folder name (first part)
    return parts.slice(1).join('/');
  }

  // Create folder cache for finding/creating folders
  const folderCache = new Map();

  // Helper to get or create a folder by path
  async function getOrCreateFolderPath(relativePath, parentId) {
    if (!relativePath) return parentId;

    const cacheKey = `${parentId}:${relativePath}`;
    if (folderCache.has(cacheKey)) {
      return folderCache.get(cacheKey);
    }

    const parts = relativePath.split('/').filter((p) => p);
    let currentParentId = parentId;

    for (const part of parts) {
      const children = await browser.bookmarks.getChildren(currentParentId);
      let folder = children.find((c) => !c.url && c.title === part);

      if (!folder) {
        folder = await browser.bookmarks.create({
          parentId: currentParentId,
          title: part,
        });
      }

      currentParentId = folder.id;
    }

    folderCache.set(cacheKey, currentParentId);
    return currentParentId;
  }

  let updatedCount = 0;
  let errorCount = 0;

  for (const { cloud, local } of bookmarksToUpdate) {
    try {
      const cloudRootKey = parseRootKey(cloud.folderPath);
      const cloudRelativePath = getRelativePath(cloud.folderPath);

      // Check if title needs updating
      const titleChanged = (cloud.title ?? '') !== (local.title ?? '');

      // Check if folder needs updating (normalize for comparison)
      const folderChanged =
        normalizeFolderPath(cloud.folderPath) !== normalizeFolderPath(local.folderPath);

      // Check if index needs updating
      const indexChanged =
        cloud.index !== undefined && local.index !== undefined && cloud.index !== local.index;

      // Update title if changed
      if (titleChanged) {
        await browser.bookmarks.update(local.id, { title: cloud.title ?? '' });
        console.log(
          `[MarkSyncr] Updated title for ${cloud.url}: "${local.title}" -> "${cloud.title}"`
        );
      }

      // Move to new folder or position if needed
      if (folderChanged || indexChanged) {
        const rootFolder = rootFolders[cloudRootKey] || rootFolders.other || rootFolders.toolbar;

        if (rootFolder) {
          const targetFolderId = await getOrCreateFolderPath(cloudRelativePath, rootFolder.id);

          const moveOptions = { parentId: targetFolderId };
          if (cloud.index !== undefined && cloud.index >= 0) {
            moveOptions.index = cloud.index;
          }

          await browser.bookmarks.move(local.id, moveOptions);

          if (folderChanged) {
            console.log(
              `[MarkSyncr] Moved ${cloud.url} from "${local.folderPath}" to "${cloud.folderPath}"`
            );
          } else {
            console.log(`[MarkSyncr] Repositioned ${cloud.url} to index ${cloud.index}`);
          }
        }
      }

      updatedCount++;
    } catch (err) {
      console.warn(`[MarkSyncr] Failed to update bookmark ${cloud.url}:`, err.message);
      errorCount++;
    }
  }

  if (errorCount > 0) {
    console.log(
      `[MarkSyncr] updateLocalBookmarksFromCloud: ${updatedCount} updated, ${errorCount} errors`
    );
  }

  return updatedCount;
}

/**
 * Convert browser bookmark tree to MarkSyncr format with ordering
 * @param {Array} tree - Browser bookmark tree
 * @returns {object} - MarkSyncr bookmark data with ordering information
 */
function convertBrowserBookmarks(tree) {
  const result = {
    version: '1.1.0', // Bumped version to indicate ordering support
    exportedAt: new Date().toISOString(),
    browser: detectBrowser(),
    roots: {
      toolbar: { children: [] },
      menu: { children: [] },
      other: { children: [] },
    },
  };

  // Browser bookmark tree structure varies between Chrome and Firefox
  // Chrome: [{ children: [Bookmarks Bar, Other Bookmarks, Mobile Bookmarks] }]
  // Firefox: [{ children: [Bookmarks Menu, Bookmarks Toolbar, Other Bookmarks, Mobile Bookmarks] }]

  if (tree[0]?.children) {
    for (let i = 0; i < tree[0].children.length; i++) {
      const root = tree[0].children[i];
      const title = root.title?.toLowerCase() || '';

      if (title.includes('toolbar') || title.includes('bar')) {
        result.roots.toolbar = convertNode(root, i);
      } else if (title.includes('menu')) {
        result.roots.menu = convertNode(root, i);
      } else if (title.includes('other') || title.includes('unsorted')) {
        result.roots.other = convertNode(root, i);
      }
      // Skip mobile bookmarks for now
    }
  }

  return result;
}

/**
 * Convert a bookmark node recursively, preserving order information
 * @param {object} node - Browser bookmark node
 * @param {number} index - Index of this node within its parent (for ordering)
 * @returns {object} - MarkSyncr bookmark node with ordering
 */
function convertNode(node, index = 0) {
  if (node.url) {
    // It's a bookmark
    return {
      type: 'bookmark',
      title: node.title || '',
      url: node.url,
      dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
      // Include index for ordering - use node.index if available, otherwise use passed index
      index: node.index ?? index,
    };
  }

  // It's a folder
  return {
    type: 'folder',
    title: node.title || '',
    // Pass index to children for proper ordering
    children: (node.children || []).map((child, i) => convertNode(child, i)),
    dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
    // Include index for folder ordering
    index: node.index ?? index,
  };
}

/**
 * Detect current browser
 * @returns {string}
 */
function detectBrowser() {
  const ua = navigator.userAgent;

  // Check Firefox first - Firefox has "Firefox/" in user agent
  if (ua.includes('Firefox/')) return 'firefox';

  // Check Brave - Brave exposes navigator.brave for detection
  // Note: Brave doesn't include "Brave" in user agent for privacy reasons
  if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
    return 'brave';
  }

  // Check other Chromium-based browsers by user agent
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'opera';
  if (ua.includes('Vivaldi/')) return 'vivaldi';

  // Default to Chrome for other Chromium browsers
  if (ua.includes('Chrome/')) return 'chrome';

  // Safari (though we don't have a Safari extension yet)
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'safari';

  return 'unknown';
}

/**
 * Count bookmarks in tree
 * @param {Array} tree
 * @param {number} [syncedCount=0] - Number of bookmarks synced to cloud (0 if not logged in)
 * @returns {{total: number, folders: number, synced: number}}
 */
function countBookmarks(tree, syncedCount = 0) {
  let total = 0;
  let folders = 0;

  function traverse(nodes) {
    for (const node of nodes) {
      if (node.url) {
        total++;
      } else if (node.children) {
        folders++;
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  // synced is 0 when not logged in, otherwise it's the actual synced count from the server
  return { total, folders, synced: syncedCount };
}

/**
 * Force Push - Overwrite cloud data with local bookmarks
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function forcePush() {
  // Prevent concurrent operations
  if (isSyncInProgress) {
    console.log('[MarkSyncr] Force Push blocked: sync already in progress');
    return {
      success: false,
      error: 'Another sync operation is in progress. Please wait or reset sync state.',
    };
  }

  isSyncInProgress = true;

  try {
    console.log('[MarkSyncr] Force Push: Overwriting cloud data with local bookmarks');

    // Ensure we have a valid token
    const hasValidToken = await ensureValidToken();
    if (!hasValidToken) {
      return {
        success: false,
        error: 'Please log in to force push bookmarks',
        requiresAuth: true,
      };
    }

    // Get current bookmarks from browser
    const bookmarkTree = await browser.bookmarks.getTree();
    const bookmarkData = convertBrowserBookmarks(bookmarkTree);
    const flatBookmarks = flattenBookmarkTree(bookmarkTree);
    // Pass the bookmark count as synced count since we're pushing all to cloud
    const stats = countBookmarks(bookmarkTree, flatBookmarks.filter((b) => b.url).length);

    // Force push to cloud (overwrite)
    console.log(`[MarkSyncr] Force pushing ${flatBookmarks.length} bookmarks to cloud...`);
    const syncResult = await syncBookmarksToCloud(flatBookmarks, detectBrowser());
    console.log('[MarkSyncr] Force push sync result:', syncResult);

    // Save version with force push marker (non-blocking)
    try {
      const versionResult = await saveVersionToCloud(
        bookmarkData,
        detectBrowser(),
        `${detectBrowser()}-extension`,
        { type: 'force_push', description: 'Force pushed from browser' }
      );
      console.log('[MarkSyncr] Force push version saved:', versionResult);
    } catch (versionErr) {
      // Don't fail force push because of version save failure
      console.warn('[MarkSyncr] Force push version save failed (continuing):', versionErr.message);
    }

    // Update last sync time
    await browser.storage.local.set({
      lastSync: new Date().toISOString(),
    });

    return { success: true, stats, message: 'Successfully force pushed bookmarks to cloud' };
  } catch (err) {
    console.error('[MarkSyncr] Force push failed:', err);
    return { success: false, error: err.message };
  } finally {
    isSyncInProgress = false;
    console.log('[MarkSyncr] Force push completed, setting isSyncInProgress=false');
  }
}

/**
 * Force Pull - Overwrite local bookmarks with cloud data
 *
 * IMPORTANT: This function now gets data from cloud_bookmarks (via /api/bookmarks)
 * instead of from version history (bookmark_versions). This ensures Force Pull
 * always gets the LATEST data, not potentially stale version history data.
 *
 * The version history is for rollback purposes, not for Force Pull.
 *
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function forcePull() {
  // Prevent concurrent operations
  if (isSyncInProgress) {
    console.log('[MarkSyncr] Force Pull blocked: sync already in progress');
    return {
      success: false,
      error: 'Another sync operation is in progress. Please wait or reset sync state.',
    };
  }

  isSyncInProgress = true;

  try {
    console.log('[MarkSyncr] Force Pull: Overwriting local bookmarks with cloud data');

    // Ensure we have a valid token
    const hasValidToken = await ensureValidToken();
    if (!hasValidToken) {
      return {
        success: false,
        error: 'Please log in to force pull bookmarks',
        requiresAuth: true,
      };
    }

    // Get bookmarks from cloud_bookmarks (the authoritative source)
    // NOT from version history, which might have older data
    console.log('[MarkSyncr] Force Pull: Fetching bookmarks from cloud_bookmarks...');
    const cloudData = await getBookmarksFromCloud();

    if (!cloudData || !cloudData.bookmarks || cloudData.bookmarks.length === 0) {
      return {
        success: false,
        error: 'No bookmark data found in cloud. Please sync first.',
      };
    }

    const cloudBookmarksFlat = cloudData.bookmarks;
    const browserType = detectBrowser();
    console.log(`[MarkSyncr] Force Pull: browser=${browserType}`);
    console.log(
      `[MarkSyncr] Force Pull: Retrieved ${cloudBookmarksFlat.length} bookmarks from cloud_bookmarks`
    );
    console.log(`[MarkSyncr] Force Pull: Cloud checksum: ${cloudData.checksum}`);

    // Get current browser bookmarks to find root folders
    const currentTree = await browser.bookmarks.getTree();
    const rootFolders = {};

    if (currentTree[0]?.children) {
      console.log(
        '[MarkSyncr] Force Pull: Local root folders:',
        currentTree[0].children.map((c) => ({ id: c.id, title: c.title }))
      );

      for (const root of currentTree[0].children) {
        const title = root.title?.toLowerCase() || '';
        const id = root.id;

        // Chrome/Opera/Edge/Brave use numeric IDs: '1' for bookmarks bar, '2' for other bookmarks
        // Firefox uses string IDs: 'toolbar_____', 'menu________', 'unfiled_____'
        if (title.includes('toolbar') || title.includes('bar') || id === '1') {
          rootFolders.toolbar = root;
          console.log(
            `[MarkSyncr] Force Pull: Found toolbar folder: id=${id}, title="${root.title}"`
          );
        } else if (title.includes('menu') || id === 'menu________') {
          rootFolders.menu = root;
          console.log(`[MarkSyncr] Force Pull: Found menu folder: id=${id}, title="${root.title}"`);
        } else if (
          title.includes('other') ||
          title.includes('unsorted') ||
          id === '2' ||
          id === 'unfiled_____'
        ) {
          rootFolders.other = root;
          console.log(
            `[MarkSyncr] Force Pull: Found other folder: id=${id}, title="${root.title}"`
          );
        }
      }
    }

    console.log('[MarkSyncr] Force Pull: Detected root folders:', Object.keys(rootFolders));

    // Set flag to prevent tombstone creation during Force Pull
    // This is important because we're about to delete all bookmarks and recreate them
    isForcePullInProgress = true;
    console.log('[MarkSyncr] Force Pull: Tombstone creation disabled');

    try {
      // Clear existing bookmarks in each root folder
      for (const [rootKey, rootFolder] of Object.entries(rootFolders)) {
        if (!rootFolder) continue;

        // Get fresh children list (in case it changed)
        try {
          const children = await browser.bookmarks.getChildren(rootFolder.id);
          console.log(
            `[MarkSyncr] Force Pull: Clearing ${children.length} items from ${rootKey} (${rootFolder.title})`
          );

          for (const child of children) {
            try {
              await browser.bookmarks.removeTree(child.id);
            } catch (err) {
              console.warn('[MarkSyncr] Failed to remove bookmark:', child.id, err);
            }
          }
        } catch (err) {
          console.warn(`[MarkSyncr] Failed to get children for ${rootKey}:`, err);
        }
      }

      // Recreate bookmarks from cloud data (flat format from cloud_bookmarks)
      // The flat format has items with folderPath like "Bookmarks Bar/Subfolder"
      // We need to recreate the folder structure and place bookmarks correctly
      let importedCount = 0;
      let foldersCreated = 0;

      console.log(
        `[MarkSyncr] Force Pull: Recreating ${cloudBookmarksFlat.length} items from flat format`
      );

      // Use the same addCloudBookmarksToLocal function that regular sync uses
      // This handles folder creation and bookmark placement correctly
      await addCloudBookmarksToLocal(cloudBookmarksFlat);

      // Count what was created
      const finalTree = await browser.bookmarks.getTree();
      const finalFlat = flattenBookmarkTree(finalTree);
      // Pass the bookmark count as synced count since we pulled all from cloud
      const finalStats = countBookmarks(finalTree, finalFlat.filter((b) => b.url).length);
      importedCount = finalStats.total;
      foldersCreated = finalStats.folders;

      console.log(
        `[MarkSyncr] Force Pull: Created ${importedCount} bookmarks, ${foldersCreated} folders`
      );

      // Update last sync time
      await browser.storage.local.set({
        lastSync: new Date().toISOString(),
      });

      const stats = { total: importedCount, folders: foldersCreated, synced: importedCount };

      console.log(
        `[MarkSyncr] Force Pull complete: ${importedCount} bookmarks, ${foldersCreated} folders`
      );

      // CRITICAL: After Force Pull, sync the pulled bookmarks back to cloud_bookmarks
      // This ensures the next regular sync sees matching data and doesn't revert changes.
      // Without this, the next sync would compare local bookmarks (from version history)
      // with cloud_bookmarks (which might have older data), see differences, and push
      // the "merged" result back to cloud - potentially reverting to an older version.
      try {
        console.log('[MarkSyncr] Force Pull: Syncing pulled bookmarks to cloud_bookmarks...');
        const finalTree = await browser.bookmarks.getTree();
        const finalFlat = flattenBookmarkTree(finalTree);

        // Clear tombstones since we just did a full replacement
        const emptyTombstones = [];

        const syncResult = await syncBookmarksToCloud(finalFlat, detectBrowser(), emptyTombstones);
        console.log('[MarkSyncr] Force Pull: cloud_bookmarks updated:', syncResult);

        // Store the new checksum so next sync knows we're in sync
        if (syncResult.checksum) {
          await storeLastCloudChecksum(syncResult.checksum);
          console.log('[MarkSyncr] Force Pull: Stored cloud checksum:', syncResult.checksum);
        }

        // Clear local tombstones since we just did a full replacement
        await storeTombstones([]);
        console.log('[MarkSyncr] Force Pull: Cleared local tombstones');
      } catch (syncErr) {
        console.error('[MarkSyncr] Force Pull: Failed to sync to cloud_bookmarks:', syncErr);
        // Don't fail the Force Pull - the local bookmarks were updated successfully
        // The next regular sync will eventually sync the data
      }

      return {
        success: true,
        stats,
        message: `Successfully imported ${importedCount} bookmarks and ${foldersCreated} folders from cloud`,
      };
    } finally {
      // Always reset the flag, even if an error occurred
      isForcePullInProgress = false;
      console.log('[MarkSyncr] Force Pull: Tombstone creation re-enabled');
    }
  } catch (err) {
    console.error('[MarkSyncr] Force pull failed:', err);
    return { success: false, error: err.message };
  } finally {
    isSyncInProgress = false;
    console.log('[MarkSyncr] Force pull completed, setting isSyncInProgress=false');
  }
}

/**
 * Recreate bookmarks from cloud data
 * @param {string} parentId - Parent folder ID
 * @param {Array} items - Cloud bookmark items
 * @param {number} startIndex - Starting index for bookmark positioning (default: 0)
 * @returns {Promise<{bookmarks: number, folders: number}>}
 */
async function recreateBookmarks(parentId, items, startIndex = 0) {
  let bookmarks = 0;
  let folders = 0;
  let currentIndex = startIndex;

  for (const item of items) {
    try {
      if (item.type === 'bookmark' && item.url) {
        await browser.bookmarks.create({
          parentId,
          // Use index to preserve bookmark order
          index: currentIndex,
          // Preserve empty titles - don't replace with URL
          title: item.title ?? '',
          url: item.url,
        });
        bookmarks++;
        currentIndex++;
      } else if (item.type === 'folder' || item.children) {
        const newFolder = await browser.bookmarks.create({
          parentId,
          // Use index to preserve folder order
          index: currentIndex,
          title: item.title || 'Untitled Folder',
        });
        folders++;
        currentIndex++;

        if (item.children && item.children.length > 0) {
          // Child items start at index 0 within the new folder
          const childResult = await recreateBookmarks(newFolder.id, item.children, 0);
          bookmarks += childResult.bookmarks;
          folders += childResult.folders;
        }
      }
    } catch (err) {
      console.warn('[MarkSyncr] Failed to create bookmark:', item.title, err);
      // Still increment index to maintain relative order of remaining items
      currentIndex++;
    }
  }

  return { bookmarks, folders };
}

/**
 * Handle OAuth connection for a source
 * For 3rd party services, directs users to the web app dashboard
 * @param {string} sourceId
 * @returns {Promise<{success: boolean, error?: string, redirectUrl?: string}>}
 */
async function connectSource(sourceId) {
  try {
    console.log(`[MarkSyncr] Connecting to source: ${sourceId}`);

    // 3rd party OAuth sources must be connected via the web app dashboard
    const oauthSources = ['github', 'dropbox', 'google-drive'];

    if (oauthSources.includes(sourceId)) {
      // Direct user to web app dashboard to connect
      const baseUrl = getApiBaseUrl();
      const dashboardUrl = `${baseUrl}/dashboard`;

      console.log(`[MarkSyncr] Redirecting to dashboard for ${sourceId} connection`);

      // Open the dashboard in a new tab
      await browser.tabs.create({ url: dashboardUrl });

      return {
        success: true,
        redirectUrl: dashboardUrl,
        message: `Please connect ${sourceId} from the MarkSyncr dashboard. After connecting, click "Refresh Sources" in the extension.`,
      };
    }

    // For non-OAuth sources (like browser-bookmarks), just mark as connected
    const { sources = [] } = await browser.storage.local.get('sources');
    const updatedSources = sources.map((s) => (s.id === sourceId ? { ...s, connected: true } : s));
    await browser.storage.local.set({ sources: updatedSources });
    return { success: true };
  } catch (err) {
    console.error(`[MarkSyncr] Failed to connect source ${sourceId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch connected sources from the server and update local state
 *
 * IMPORTANT: This function handles three types of sources:
 * 1. browser-bookmarks - Always connected (local source)
 * 2. supabase-cloud - Connected when user is authenticated (implicit)
 * 3. OAuth sources (github, dropbox, google-drive) - Connected based on sync_sources table
 *
 * @returns {Promise<{success: boolean, sources?: Array, error?: string}>}
 */
async function refreshConnectedSources() {
  try {
    console.log('[MarkSyncr] Refreshing connected sources from server...');

    const baseUrl = getApiBaseUrl();
    const token = await getAccessToken();

    if (!token) {
      console.log('[MarkSyncr] No access token, cannot fetch sources');
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${baseUrl}/api/sources`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[MarkSyncr] Failed to fetch sources:', response.status);
      return { success: false, error: 'Failed to fetch sources' };
    }

    const data = await response.json();
    const serverSources = data.sources || [];

    console.log('[MarkSyncr] Server sources (OAuth providers):', serverSources);

    // Get current local sources
    const { sources: localSources = [] } = await browser.storage.local.get('sources');

    // Merge server sources with local sources
    // Handle each source type appropriately:
    // - browser-bookmarks: Always connected (local)
    // - supabase-cloud: Connected when authenticated (we have a token, so connected)
    // - OAuth sources: Connected based on server response
    const updatedSources = localSources.map((localSource) => {
      // browser-bookmarks is always connected (it's a local source)
      if (localSource.id === 'browser-bookmarks') {
        return { ...localSource, connected: true };
      }

      // supabase-cloud is connected when user is authenticated
      // Since we have a valid token at this point, mark it as connected
      if (localSource.id === 'supabase-cloud') {
        console.log('[MarkSyncr] Marking supabase-cloud as connected (user is authenticated)');
        return { ...localSource, connected: true };
      }

      // For OAuth sources (github, dropbox, google-drive), check server response
      const serverSource = serverSources.find((s) => s.id === localSource.id);
      if (serverSource) {
        console.log(`[MarkSyncr] OAuth source ${localSource.id} is connected`);
        return {
          ...localSource,
          connected: true,
          providerUsername: serverSource.providerUsername,
          repository: serverSource.repository,
          branch: serverSource.branch,
          filePath: serverSource.filePath,
          connectedAt: serverSource.connectedAt,
        };
      }

      // OAuth source not found on server - mark as disconnected
      return { ...localSource, connected: false };
    });

    await browser.storage.local.set({ sources: updatedSources });

    console.log(
      '[MarkSyncr] Updated local sources:',
      updatedSources.map((s) => ({ id: s.id, connected: s.connected }))
    );

    return { success: true, sources: updatedSources };
  } catch (err) {
    console.error('[MarkSyncr] Failed to refresh sources:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Handle OAuth disconnection for a source
 * @param {string} sourceId
 * @returns {Promise<{success: boolean}>}
 */
async function disconnectSource(sourceId) {
  try {
    console.log(`[MarkSyncr] Disconnecting from source: ${sourceId}`);

    const { sources = [] } = await browser.storage.local.get('sources');

    const updatedSources = sources.map((s) => (s.id === sourceId ? { ...s, connected: false } : s));

    await browser.storage.local.set({ sources: updatedSources });

    // TODO: Revoke OAuth tokens

    return { success: true };
  } catch (err) {
    console.error(`[MarkSyncr] Failed to disconnect source ${sourceId}:`, err);
    return { success: false, error: err.message };
  }
}

// Message handler
browser.runtime.onMessage.addListener((message, sender) => {
  console.log('[MarkSyncr] Received message:', message.type);

  switch (message.type) {
    case 'SYNC_BOOKMARKS':
      return performSync(message.payload?.sourceId);

    case 'FORCE_PUSH':
      return forcePush();

    case 'FORCE_PULL':
      return forcePull();

    case 'CONNECT_SOURCE':
      return connectSource(message.payload?.sourceId);

    case 'DISCONNECT_SOURCE':
      return disconnectSource(message.payload?.sourceId);

    case 'REFRESH_SOURCES':
      return refreshConnectedSources();

    case 'GET_BOOKMARKS':
      return browser.bookmarks.getTree().then((tree) => ({
        success: true,
        bookmarks: convertBrowserBookmarks(tree),
      }));

    case 'UPDATE_SETTINGS':
      return browser.storage.local.set({ settings: message.payload }).then(() => {
        setupAutoSync(); // Reconfigure auto-sync
        return { success: true };
      });

    case 'RESET_SYNC_FAILURES':
      console.log('[MarkSyncr] Resetting sync failure count');
      consecutiveSyncFailures = 0;
      lastSyncError = null;
      return Promise.resolve({
        success: true,
        message: 'Sync failures reset. You can try syncing again.',
      });

    case 'GET_SYNC_STATUS':
      return Promise.resolve({
        success: true,
        syncInProgress: isSyncInProgress,
        consecutiveFailures: consecutiveSyncFailures,
        maxFailures: MAX_CONSECUTIVE_FAILURES,
        lastError: lastSyncError,
        retryLimitReached: consecutiveSyncFailures >= MAX_CONSECUTIVE_FAILURES,
      });

    case 'FORCE_RESET_SYNC_STATE':
      console.log(
        '[MarkSyncr] Force resetting sync state (was stuck: isSyncInProgress=' +
          isSyncInProgress +
          ')'
      );
      isSyncInProgress = false;
      consecutiveSyncFailures = 0;
      lastSyncError = null;
      return Promise.resolve({ success: true, message: 'Sync state force reset' });

    default:
      console.warn('[MarkSyncr] Unknown message type:', message.type);
      return Promise.resolve({ success: false, error: 'Unknown message type' });
  }
});

// ==========================================
// EVENT LISTENERS - Must be registered synchronously at top level
// This is critical for Firefox MV3 where background scripts are event-driven
// ==========================================

// Alarm handler - registered synchronously for Firefox MV3 compatibility
browser.alarms.onAlarm.addListener(async (alarm) => {
  const browserInfo = detectBrowser();
  const timestamp = new Date().toISOString();
  console.log(`[MarkSyncr] ⏰ Alarm fired: ${alarm.name} at ${timestamp} (${browserInfo})`);

  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('[MarkSyncr] ⏰ Auto-sync alarm triggered, starting periodic sync...');

    // Check if user is logged in before syncing
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log('[MarkSyncr] ⏰ Auto-sync skipped: user not logged in');
      return;
    }

    console.log('[MarkSyncr] ⏰ User is logged in, proceeding with periodic sync...');

    try {
      const result = await performSync();

      // Enhanced logging for periodic sync results
      if (result.success) {
        if (result.skipped) {
          console.log('[MarkSyncr] ⏰ Periodic sync: No changes detected (checksums match)');
        } else {
          console.log(`[MarkSyncr] ⏰ Periodic sync completed successfully:`);
          console.log(`  - Added from cloud: ${result.addedFromCloud || 0}`);
          console.log(`  - Deleted locally: ${result.deletedLocally || 0}`);
          console.log(`  - Pushed to cloud: ${result.pushedToCloud || 0}`);
          console.log(`  - Total bookmarks: ${result.stats?.total || 'unknown'}`);
        }
      } else {
        console.warn('[MarkSyncr] ⏰ Periodic sync failed:', result.error);

        // Show notification if retry limit reached
        if (result.retryLimitReached) {
          try {
            await browser.notifications.create('sync-retry-limit', {
              type: 'basic',
              iconUrl: browser.runtime.getURL('icons/icon-48.png'),
              title: 'MarkSyncr Sync Error',
              message: `Sync stopped after ${MAX_CONSECUTIVE_FAILURES} failures. Click the extension to retry manually.`,
            });
          } catch (notifErr) {
            // Notifications may not be available in all contexts
            console.warn('[MarkSyncr] Could not show notification:', notifErr);
          }
        }
      }
    } catch (err) {
      console.error('[MarkSyncr] ⏰ Periodic sync error:', err);
    }
  }

  if (alarm.name === TOKEN_REFRESH_ALARM_NAME) {
    console.log('[MarkSyncr] ⏰ Token refresh alarm triggered');

    const session = await getSession();
    if (!session?.extension_token) {
      console.log('[MarkSyncr] ⏰ Token refresh skipped: no extension token');
      return;
    }

    try {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        console.log('[MarkSyncr] ⏰ Proactive token refresh succeeded');
      } else {
        console.warn('[MarkSyncr] ⏰ Proactive token refresh failed, will retry next interval');
      }
    } catch (err) {
      console.error('[MarkSyncr] ⏰ Token refresh alarm error:', err);
    }
  }
});

// Extension install/update handler - registered synchronously
browser.runtime.onInstalled.addListener((details) => {
  console.log(`[MarkSyncr] Extension ${details.reason}:`, details);

  if (details.reason === 'install') {
    // First install - set up defaults
    browser.storage.local.set({
      settings: {
        autoSync: true,
        syncInterval: DEFAULT_SYNC_INTERVAL,
        syncOnStartup: true,
        notifications: true,
        conflictResolution: 'newest-wins',
      },
      sources: [
        {
          id: 'browser-bookmarks',
          name: 'Browser Bookmarks',
          type: 'browser-bookmarks',
          connected: true,
          description: 'Sync your browser bookmarks',
        },
        {
          id: 'supabase-cloud',
          name: 'MarkSyncr Cloud',
          type: 'supabase-cloud',
          connected: false,
          description: 'Sync to cloud (requires login)',
        },
        {
          id: 'github',
          name: 'GitHub',
          type: 'github',
          connected: false,
          description: 'Sync to GitHub repository',
        },
        {
          id: 'dropbox',
          name: 'Dropbox',
          type: 'dropbox',
          connected: false,
          description: 'Sync to Dropbox',
        },
        {
          id: 'google-drive',
          name: 'Google Drive',
          type: 'google-drive',
          connected: false,
          description: 'Sync to Google Drive',
        },
      ],
      // Auto-select browser bookmarks as default source
      selectedSource: 'browser-bookmarks',
    });
  }

  // Re-setup alarms on install/update to ensure they are created
  Promise.all([setupAutoSync(), setupTokenRefreshAlarm()]).then(() => {
    console.log('[MarkSyncr] Alarms setup completed after install/update');
  });
});

// Startup handler - registered synchronously
browser.runtime.onStartup.addListener(async () => {
  const browserInfo = detectBrowser();
  console.log(`[MarkSyncr] Browser started (${browserInfo})`);

  // Re-setup alarms on startup to ensure they exist
  // This is important for Firefox where alarms may not persist across restarts
  await setupAutoSync();
  await setupTokenRefreshAlarm();
  console.log('[MarkSyncr] Alarms verified on startup');

  const { settings } = await browser.storage.local.get('settings');

  if (settings?.syncOnStartup) {
    // Delay startup sync slightly to let browser settle
    setTimeout(() => {
      console.log('[MarkSyncr] Performing startup sync');
      performSync();
    }, 5000);
  }
});

// Log that event listeners are registered (this runs synchronously)
console.log('[MarkSyncr] Event listeners registered');

// Initialize (async operations)
initialize();
