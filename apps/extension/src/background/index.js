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
const DEFAULT_SYNC_INTERVAL = 5; // minutes - sync every 5 minutes by default
const TOMBSTONES_STORAGE_KEY = 'marksyncr-tombstones';
const LAST_CLOUD_CHECKSUM_KEY = 'marksyncr-last-cloud-checksum';

// Flag to disable tombstone creation during Force Pull operations
let isForcePullInProgress = false;

// Flag to prevent sync loops - when true, bookmark changes won't trigger new syncs
let isSyncInProgress = false;

/**
 * Get API base URL - uses VITE_APP_URL from build config or falls back to production URL
 */
function getApiBaseUrl() {
  // In production builds, this will be replaced by Vite with the actual URL
  // eslint-disable-next-line no-undef
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
  const existingIndex = tombstones.findIndex(t => t.url === url);
  
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
  const filtered = tombstones.filter(t => t.url !== url);
  
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
  const filtered = tombstones.filter(t => t.deletedAt > cutoff);
  
  if (filtered.length !== tombstones.length) {
    await storeTombstones(filtered);
    console.log(`[MarkSyncr] Cleaned up ${tombstones.length - filtered.length} old tombstones`);
  }
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
  
  return items.map(item => {
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
  }).sort((a, b) => {
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
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
 * Try to refresh the access token using the refresh token
 * @returns {Promise<boolean>} - True if refresh was successful
 */
async function tryRefreshToken() {
  const session = await getSession();
  if (!session?.refresh_token) {
    console.log('[MarkSyncr] No refresh token available');
    return false;
  }
  
  try {
    const baseUrl = getApiBaseUrl();
    console.log('[MarkSyncr] Attempting to refresh token...');
    
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    
    if (!response.ok) {
      console.log('[MarkSyncr] Token refresh failed:', response.status);
      return false;
    }
    
    const data = await response.json();
    if (data.session) {
      console.log('[MarkSyncr] Token refreshed successfully');
      await storeSession(data.session);
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('[MarkSyncr] Token refresh error:', err);
    return false;
  }
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
        'Authorization': `Bearer ${token}`,
      },
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure we have a valid token, refreshing if necessary
 * @returns {Promise<boolean>} - True if we have a valid token
 */
async function ensureValidToken() {
  // First check if we have a token at all
  const token = await getAccessToken();
  if (!token) {
    console.log('[MarkSyncr] No access token found');
    return false;
  }
  
  // Validate the token
  const isValid = await validateToken();
  if (isValid) {
    return true;
  }
  
  // Token is invalid, try to refresh
  console.log('[MarkSyncr] Token appears invalid, attempting refresh...');
  const refreshed = await tryRefreshToken();
  
  if (!refreshed) {
    // Refresh failed, clear session
    console.log('[MarkSyncr] Token refresh failed, clearing session');
    await clearSession();
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
  console.log(`[MarkSyncr] Script type: ${isFirefox ? 'persistent background script' : 'service worker'}`);

  // Set up alarm for automatic sync
  await setupAutoSync();

  // Listen for bookmark changes
  setupBookmarkListeners();
  
  // For Firefox, set up a periodic check to ensure alarm is still active
  // Firefox background scripts are persistent, so we can use setInterval
  if (isFirefox) {
    console.log('[MarkSyncr] Firefox detected - setting up alarm health check');
    
    // Check alarm health every 2 minutes
    setInterval(async () => {
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
        
        // Check if alarm interval matches expected interval
        if (alarm.periodInMinutes !== expectedInterval) {
          console.warn(`[MarkSyncr] Firefox: Alarm interval mismatch (${alarm.periodInMinutes} vs ${expectedInterval}), recreating...`);
          await browser.alarms.clear(SYNC_ALARM_NAME);
          await setupAutoSync();
        } else {
          console.log(`[MarkSyncr] Firefox: Alarm health check OK - next fire in ${minutesUntilFire} minutes (interval: ${alarm.periodInMinutes})`);
        }
      }
    }, 2 * 60 * 1000); // Every 2 minutes
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
    
    console.log(`[MarkSyncr] Auto-sync setup (${browserInfo}): enabled=${autoSyncEnabled}, interval=${interval} minutes`);

    if (autoSyncEnabled) {
      // Check if alarm already exists
      const existingAlarm = await browser.alarms.get(SYNC_ALARM_NAME);
      
      if (existingAlarm) {
        console.log(`[MarkSyncr] Existing alarm found:`, existingAlarm);
        const nextFireTime = new Date(existingAlarm.scheduledTime);
        console.log(`[MarkSyncr] Next fire time: ${nextFireTime.toISOString()}`);
        
        // Check if the alarm interval matches the settings
        // If not, recreate the alarm
        if (existingAlarm.periodInMinutes !== interval) {
          console.log(`[MarkSyncr] Alarm interval mismatch (${existingAlarm.periodInMinutes} vs ${interval}), recreating...`);
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

      console.log(`[MarkSyncr] Auto-sync alarm created: first fire in ${interval} minutes, then every ${interval} minutes`);
      
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
 * Set up bookmark change listeners
 */
function setupBookmarkListeners() {
  // Listen for bookmark creation - remove tombstone if bookmark is re-added
  browser.bookmarks.onCreated.addListener(async (id, bookmark) => {
    console.log('[MarkSyncr] Bookmark created:', bookmark.title);
    
    // Skip processing during sync operations to prevent sync loops
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Skipping bookmark created handler (sync in progress)');
      return;
    }
    
    // If a bookmark is re-added, remove its tombstone
    if (bookmark.url) {
      await removeTombstone(bookmark.url);
    }
    
    scheduleSync('bookmark-created');
  });

  // Listen for bookmark removal - add tombstone for deletion sync
  browser.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
    console.log('[MarkSyncr] Bookmark removed:', id, removeInfo);
    
    // Skip tombstone creation during sync operations to prevent sync loops
    // Force Pull clears all bookmarks before recreating from cloud,
    // so we don't want to create tombstones for those deletions
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Skipping tombstone (sync in progress)');
      return; // Don't schedule sync either during sync operations
    }
    
    // Get the URL of the removed bookmark from removeInfo.node
    // Note: removeInfo.node contains the removed bookmark data
    if (removeInfo.node?.url) {
      await addTombstone(removeInfo.node.url);
      console.log('[MarkSyncr] Added tombstone for deleted bookmark:', removeInfo.node.url);
    } else if (removeInfo.node?.children) {
      // It's a folder - add tombstones for all bookmarks in the folder
      await addTombstonesForFolder(removeInfo.node);
    }
    
    scheduleSync('bookmark-removed');
  });

  // Listen for bookmark changes
  browser.bookmarks.onChanged.addListener((id, changeInfo) => {
    console.log('[MarkSyncr] Bookmark changed:', id);
    
    // Skip during sync operations to prevent sync loops
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Skipping bookmark changed handler (sync in progress)');
      return;
    }
    
    scheduleSync('bookmark-changed');
  });

  // Listen for bookmark moves
  browser.bookmarks.onMoved.addListener((id, moveInfo) => {
    console.log('[MarkSyncr] Bookmark moved:', id);
    
    // Skip during sync operations to prevent sync loops
    if (isSyncInProgress || isForcePullInProgress) {
      console.log('[MarkSyncr] Skipping bookmark moved handler (sync in progress)');
      return;
    }
    
    scheduleSync('bookmark-moved');
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

// Debounce sync scheduling
let syncTimeout = null;

/**
 * Schedule a sync after bookmark changes (debounced)
 * @param {string} reason - Reason for sync
 */
function scheduleSync(reason) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  // Wait 5 seconds after last change before syncing
  syncTimeout = setTimeout(async () => {
    console.log(`[MarkSyncr] Triggering sync due to: ${reason}`);
    await performSync();
  }, 5000);
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
        const folderPath = node.title ? (parentPath ? `${parentPath}/${node.title}` : node.title) : parentPath;
        
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
  
  isSyncInProgress = true;
  console.log('[MarkSyncr] Sync started, setting isSyncInProgress=true');
  
  try {
    const storageData = await browser.storage.local.get([
      'selectedSource',
      'sources',
      'session',
    ]);
    
    const { selectedSource, sources, session } = storageData;
    
    console.log('[MarkSyncr] Storage data:');
    console.log('  - selectedSource:', selectedSource);
    console.log('  - sources count:', sources?.length || 0);
    console.log('  - has session:', !!session);
    console.log('  - has access_token:', !!session?.access_token);

    const targetSourceId = sourceId || selectedSource;

    if (!targetSourceId) {
      console.log('[MarkSyncr] No sync source configured');
      return { success: false, error: 'No sync source configured. Please select a source in the extension popup.' };
    }

    console.log(`[MarkSyncr] Starting two-way sync with source: ${targetSourceId}`);

    // Get source configuration
    const source = sources?.find((s) => s.id === targetSourceId);
    console.log('[MarkSyncr] Source config:', source);
    
    // Browser bookmarks source is always available
    const isBrowserSource = targetSourceId === 'browser-bookmarks';
    
    if (!isBrowserSource && !source?.connected) {
      console.log('[MarkSyncr] Source not connected:', targetSourceId, source);
      return { success: false, error: `Source "${targetSourceId}" is not connected. Please connect it first.` };
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
        error: 'Please log in to sync bookmarks to the cloud. Go to the Account tab in the extension popup.',
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
        console.log('[MarkSyncr] Sample local tombstones:', JSON.stringify(localTombstones.slice(0, 3)));
      }
      
      // Step 2: Get bookmarks and tombstones from cloud
      console.log('[MarkSyncr] Fetching cloud bookmarks...');
      const cloudData = await getBookmarksFromCloud();
      const cloudBookmarks = cloudData.bookmarks || [];
      const cloudTombstones = cloudData.tombstones || [];
      console.log(`[MarkSyncr] Cloud bookmarks: ${cloudBookmarks.length}`);
      console.log(`[MarkSyncr] Cloud tombstones: ${cloudTombstones.length}`);
      
      // Step 3: Apply cloud tombstones to local bookmarks (delete locally if deleted elsewhere)
      let deletedLocally = 0;
      if (cloudTombstones.length > 0) {
        deletedLocally = await applyTombstonesToLocal(cloudTombstones, localFlat);
        console.log(`[MarkSyncr] Deleted ${deletedLocally} local bookmarks based on cloud tombstones`);
      }
      
      // Step 4: Merge tombstones (keep the newest deletion time for each URL)
      const mergedTombstones = mergeTombstonesLocal(localTombstones, cloudTombstones);
      await storeTombstones(mergedTombstones);
      console.log(`[MarkSyncr] Merged tombstones: ${mergedTombstones.length}`);
      
      // Step 5: Get updated local bookmarks after applying tombstones
      const updatedTree = await browser.bookmarks.getTree();
      const updatedLocalFlat = flattenBookmarkTree(updatedTree);
      
      // Step 6: Find bookmarks in cloud that are not in local (and not tombstoned)
      // Important: Only filter out bookmarks where the tombstone is NEWER than the bookmark
      // This allows re-added bookmarks (from other browsers) to sync correctly
      const localUrls = new Set(updatedLocalFlat.map(b => b.url));
      const newFromCloud = cloudBookmarks.filter(cb => {
        // Skip if bookmark already exists locally
        if (localUrls.has(cb.url)) {
          return false;
        }
        
        // Check if there's a tombstone for this URL
        const tombstone = mergedTombstones.find(t => t.url === cb.url);
        if (!tombstone) {
          return true; // No tombstone, add the bookmark
        }
        
        // Compare dates: add bookmark only if it's newer than the tombstone
        // This handles the case where Browser A adds a bookmark after Browser B deleted it
        const bookmarkDate = cb.dateAdded || 0;
        const tombstoneDate = tombstone.deletedAt || 0;
        
        return bookmarkDate > tombstoneDate;
      });
      console.log(`[MarkSyncr] New bookmarks from cloud (after tombstone date check): ${newFromCloud.length}`);
      
      // Step 7: Add new cloud bookmarks to local browser
      if (newFromCloud.length > 0) {
        await addCloudBookmarksToLocal(newFromCloud);
        console.log(`[MarkSyncr] Added ${newFromCloud.length} bookmarks from cloud to local`);
      }
      
      // Step 8: Get final local bookmarks after all merges
      const finalTree = await browser.bookmarks.getTree();
      const mergedFlat = flattenBookmarkTree(finalTree);
      const mergedData = convertBrowserBookmarks(finalTree);
      const stats = countBookmarks(finalTree);
      
      // Step 8.5: Check if there are any actual changes by comparing checksums
      // Generate checksum of merged bookmarks (same algorithm as server)
      const localChecksum = await generateChecksum(mergedFlat);
      const cloudChecksum = cloudData.checksum;
      
      console.log(`[MarkSyncr] Local checksum: ${localChecksum}`);
      console.log(`[MarkSyncr] Cloud checksum: ${cloudChecksum}`);
      
      // Check if there were any changes during this sync
      const hasChanges = newFromCloud.length > 0 ||
                         deletedLocally > 0 ||
                         localChecksum !== cloudChecksum;
      
      if (!hasChanges) {
        console.log('[MarkSyncr] No changes detected - checksums match and no new bookmarks');
        
        // Update last sync time even when skipping
        await browser.storage.local.set({
          lastSync: new Date().toISOString(),
        });
        
        // Store the cloud checksum for future reference
        await storeLastCloudChecksum(cloudChecksum);
        
        return {
          success: true,
          stats,
          addedFromCloud: 0,
          deletedLocally: 0,
          skipped: true,
          message: 'No new updates',
        };
      }
      
      // Step 9: Push merged bookmarks and tombstones back to cloud
      console.log(`[MarkSyncr] Pushing ${mergedFlat.length} merged bookmarks and ${mergedTombstones.length} tombstones to cloud...`);
      const syncResult = await syncBookmarksToCloud(mergedFlat, detectBrowser(), mergedTombstones);
      console.log('[MarkSyncr] Cloud sync result:', syncResult);
      
      // Store the new checksum
      if (syncResult.checksum) {
        await storeLastCloudChecksum(syncResult.checksum);
      }

      // Step 10: Save version history (only when there are actual changes)
      console.log('[MarkSyncr] Saving version history...');
      const versionResult = await saveVersionToCloud(
        mergedData,
        detectBrowser(),
        `${detectBrowser()}-extension`,
        {
          type: 'two_way_sync',
          addedFromCloud: newFromCloud.length,
          deletedLocally,
          tombstones: mergedTombstones.length,
        }
      );
      console.log('[MarkSyncr] Version saved:', versionResult);
      
      // Step 11: Cleanup old tombstones (older than 30 days)
      await cleanupOldTombstones();
      
      console.log('[MarkSyncr] Two-way sync with tombstones completed:', stats);

      // Update last sync time
      await browser.storage.local.set({
        lastSync: new Date().toISOString(),
      });

      return {
        success: true,
        stats,
        addedFromCloud: newFromCloud.length,
        deletedLocally,
      };
    } catch (cloudErr) {
      console.error('[MarkSyncr] Cloud sync failed:', cloudErr);
      return { success: false, error: `Cloud sync failed: ${cloudErr.message}` };
    }
  } catch (err) {
    console.error('[MarkSyncr] Sync failed:', err);
    return { success: false, error: err.message };
  } finally {
    // Always reset the sync flag, even if an error occurred
    isSyncInProgress = false;
    console.log('[MarkSyncr] Sync completed, setting isSyncInProgress=false');
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
  
  console.log(`[MarkSyncr] applyTombstonesToLocal: ${tombstones.length} tombstones, ${localBookmarks.length} local bookmarks`);
  
  // Debug: Log first few tombstones
  if (tombstones.length > 0) {
    console.log('[MarkSyncr] Sample tombstones:', tombstones.slice(0, 5).map(t => ({
      url: t.url,
      deletedAt: t.deletedAt,
      deletedAtDate: new Date(t.deletedAt).toISOString(),
    })));
  }
  
  // Debug: Log first few local bookmarks
  if (localBookmarks.length > 0) {
    console.log('[MarkSyncr] Sample local bookmarks:', localBookmarks.slice(0, 5).map(b => ({
      url: b.url,
      title: b.title,
    })));
  }
  
  // Create a set of tombstoned URLs for quick lookup
  const tombstonedUrls = new Set(tombstones.map(t => t.url));
  
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
  
  console.log(`[MarkSyncr] addCloudBookmarksToLocal: browser=${browserType}, items to add=${cloudItems.length}`);
  
  // Debug: Log the types of items we're adding
  const bookmarkCount = cloudItems.filter(i => i.type !== 'folder' && i.url).length;
  const folderCount = cloudItems.filter(i => i.type === 'folder').length;
  console.log(`[MarkSyncr] Items breakdown: ${bookmarkCount} bookmarks, ${folderCount} folders`);
  
  if (currentTree[0]?.children) {
    console.log('[MarkSyncr] Root folder children:', currentTree[0].children.map(c => ({ id: c.id, title: c.title })));
    
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
      } else if (title.includes('other') || title.includes('unsorted') || id === '2' || id === 'unfiled_____') {
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
    
    if (lowerPath.startsWith('bookmarks bar') ||
        lowerPath.startsWith('bookmarks toolbar') ||
        lowerPath.startsWith('speed dial')) {
      rootFolderKey = 'toolbar';
      relativePath = relativePath.split('/').slice(1).join('/');
    } else if (lowerPath.startsWith('bookmarks menu')) {
      rootFolderKey = 'menu';
      relativePath = relativePath.split('/').slice(1).join('/');
    } else if (lowerPath.startsWith('other bookmarks') ||
               lowerPath.startsWith('unsorted bookmarks')) {
      rootFolderKey = 'other';
      relativePath = relativePath.split('/').slice(1).join('/');
    }
    
    return { rootFolderKey, relativePath };
  }
  
  // Helper to get or create folder by path (without index - for intermediate folders)
  async function getOrCreateFolderPath(folderPath, parentId) {
    if (!folderPath) return parentId;
    
    const cacheKey = `${parentId}:${folderPath}`;
    if (folderCache.has(cacheKey)) {
      return folderCache.get(cacheKey);
    }
    
    const parts = folderPath.split('/').filter(p => p);
    let currentParentId = parentId;
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const pathCacheKey = `${parentId}:${currentPath}`;
      
      if (folderCache.has(pathCacheKey)) {
        currentParentId = folderCache.get(pathCacheKey);
        continue;
      }
      
      // Search for existing folder
      const children = await browser.bookmarks.getChildren(currentParentId);
      const existingFolder = children.find(c => !c.url && c.title === part);
      
      if (existingFolder) {
        currentParentId = existingFolder.id;
      } else {
        // Create new folder (without index - this is for intermediate folders)
        const newFolder = await browser.bookmarks.create({
          parentId: currentParentId,
          title: part,
        });
        currentParentId = newFolder.id;
      }
      
      folderCache.set(pathCacheKey, currentParentId);
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
        const rootFolder = rootFolders[item._rootFolderKey] || rootFolders.other || rootFolders.toolbar;
        
        if (!rootFolder) {
          console.warn(`[MarkSyncr] No root folder found for item: ${item.title}, folderPath: ${item.folderPath}`);
          skippedCount++;
          continue;
        }
        
        // Get or create the target parent folder
        const targetFolderId = await getOrCreateFolderPath(item._folderPath, rootFolder.id);
        
        if (item.type === 'folder') {
          // It's a folder entry - create the folder at the correct index
          // First check if folder already exists
          const children = await browser.bookmarks.getChildren(targetFolderId);
          const existingFolder = children.find(c => !c.url && c.title === item.title);
          
          if (existingFolder) {
            // Folder exists - check if it's at the correct index
            if (typeof item.index === 'number' && existingFolder.index !== item.index) {
              // Move to correct position
              try {
                await browser.bookmarks.move(existingFolder.id, {
                  parentId: targetFolderId,
                  index: item.index,
                });
                console.log(`[MarkSyncr] Moved existing folder "${item.title}" to index ${item.index}`);
              } catch (moveErr) {
                console.warn(`[MarkSyncr] Failed to move folder "${item.title}":`, moveErr);
              }
            }
            // Cache the folder ID
            const folderFullPath = item._folderPath ? `${item._folderPath}/${item.title}` : item.title;
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
            const folderFullPath = item._folderPath ? `${item._folderPath}/${item.title}` : item.title;
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
  
  console.log(`[MarkSyncr] addCloudBookmarksToLocal complete: bookmarks=${addedBookmarks}, folders=${addedFolders}, skipped=${skippedCount}, total=${cloudItems.length}`);
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
 * @returns {{total: number, folders: number, synced: number}}
 */
function countBookmarks(tree) {
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
  return { total, folders, synced: total };
}

/**
 * Force Push - Overwrite cloud data with local bookmarks
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function forcePush() {
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
    const stats = countBookmarks(bookmarkTree);
    const flatBookmarks = flattenBookmarkTree(bookmarkTree);
    
    // Force push to cloud (overwrite)
    console.log(`[MarkSyncr] Force pushing ${flatBookmarks.length} bookmarks to cloud...`);
    const syncResult = await syncBookmarksToCloud(flatBookmarks, detectBrowser());
    console.log('[MarkSyncr] Force push sync result:', syncResult);
    
    // Save version with force push marker
    const versionResult = await saveVersionToCloud(
      bookmarkData,
      detectBrowser(),
      `${detectBrowser()}-extension`,
      { type: 'force_push', description: 'Force pushed from browser' }
    );
    console.log('[MarkSyncr] Force push version saved:', versionResult);
    
    // Update last sync time
    await browser.storage.local.set({
      lastSync: new Date().toISOString(),
    });
    
    return { success: true, stats, message: 'Successfully force pushed bookmarks to cloud' };
  } catch (err) {
    console.error('[MarkSyncr] Force push failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Force Pull - Overwrite local bookmarks with cloud data
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function forcePull() {
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
    
    // Get latest version from cloud
    const versionData = await getLatestVersionFromCloud();
    if (!versionData || !versionData.version?.bookmarkData) {
      return {
        success: false,
        error: 'No bookmark data found in cloud. Please sync first.',
      };
    }
    
    const cloudBookmarks = versionData.version.bookmarkData;
    const browserType = detectBrowser();
    console.log(`[MarkSyncr] Force Pull: browser=${browserType}`);
    console.log('[MarkSyncr] Retrieved cloud bookmarks:', cloudBookmarks);
    
    // Get current browser bookmarks to find root folders
    const currentTree = await browser.bookmarks.getTree();
    const rootFolders = {};
    
    if (currentTree[0]?.children) {
      console.log('[MarkSyncr] Force Pull: Local root folders:', currentTree[0].children.map(c => ({ id: c.id, title: c.title })));
      
      for (const root of currentTree[0].children) {
        const title = root.title?.toLowerCase() || '';
        const id = root.id;
        
        // Chrome/Opera/Edge/Brave use numeric IDs: '1' for bookmarks bar, '2' for other bookmarks
        // Firefox uses string IDs: 'toolbar_____', 'menu________', 'unfiled_____'
        if (title.includes('toolbar') || title.includes('bar') || id === '1') {
          rootFolders.toolbar = root;
          console.log(`[MarkSyncr] Force Pull: Found toolbar folder: id=${id}, title="${root.title}"`);
        } else if (title.includes('menu') || id === 'menu________') {
          rootFolders.menu = root;
          console.log(`[MarkSyncr] Force Pull: Found menu folder: id=${id}, title="${root.title}"`);
        } else if (title.includes('other') || title.includes('unsorted') || id === '2' || id === 'unfiled_____') {
          rootFolders.other = root;
          console.log(`[MarkSyncr] Force Pull: Found other folder: id=${id}, title="${root.title}"`);
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
          console.log(`[MarkSyncr] Force Pull: Clearing ${children.length} items from ${rootKey} (${rootFolder.title})`);
          
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
      
      // Recreate bookmarks from cloud data
      // Handle the case where cloud has "menu" but browser doesn't (e.g., Opera importing from Firefox)
      let importedCount = 0;
      let foldersCreated = 0;
      
      // Define the mapping from cloud roots to local roots
      // If a cloud root doesn't have a matching local root, fall back to 'other'
      const cloudRoots = cloudBookmarks.roots || {};
      const rootMapping = {
        toolbar: rootFolders.toolbar || rootFolders.other,
        menu: rootFolders.menu || rootFolders.other, // Fall back to 'other' if no menu (Opera, Chrome)
        other: rootFolders.other || rootFolders.toolbar,
      };
      
      console.log('[MarkSyncr] Force Pull: Root mapping:', {
        toolbar: rootMapping.toolbar?.title || 'none',
        menu: rootMapping.menu?.title || 'none',
        other: rootMapping.other?.title || 'none',
      });
      
      // Track which cloud roots we've processed to avoid duplicates
      const processedCloudRoots = new Set();
      
      for (const [cloudRootKey, cloudRoot] of Object.entries(cloudRoots)) {
        if (!cloudRoot?.children || cloudRoot.children.length === 0) {
          console.log(`[MarkSyncr] Force Pull: Skipping empty cloud root: ${cloudRootKey}`);
          continue;
        }
        
        const targetFolder = rootMapping[cloudRootKey];
        if (!targetFolder) {
          console.warn(`[MarkSyncr] Force Pull: No target folder for cloud root: ${cloudRootKey}`);
          continue;
        }
        
        // If this target folder was already used for a different cloud root,
        // we need to append to it rather than replace
        const isSharedTarget = processedCloudRoots.has(targetFolder.id);
        
        console.log(`[MarkSyncr] Force Pull: Importing ${cloudRoot.children.length} items from cloud.${cloudRootKey} to ${targetFolder.title} (shared=${isSharedTarget})`);
        
        // Get current index to append after existing items if this is a shared target
        let startIndex = 0;
        if (isSharedTarget) {
          try {
            const existingChildren = await browser.bookmarks.getChildren(targetFolder.id);
            startIndex = existingChildren.length;
            console.log(`[MarkSyncr] Force Pull: Appending at index ${startIndex} (shared target)`);
          } catch (err) {
            console.warn('[MarkSyncr] Failed to get existing children count:', err);
          }
        }
        
        // Recreate from cloud data
        const result = await recreateBookmarks(targetFolder.id, cloudRoot.children, startIndex);
        importedCount += result.bookmarks;
        foldersCreated += result.folders;
        
        processedCloudRoots.add(targetFolder.id);
        
        console.log(`[MarkSyncr] Force Pull: Imported ${result.bookmarks} bookmarks, ${result.folders} folders from ${cloudRootKey}`);
      }
      
      // Update last sync time
      await browser.storage.local.set({
        lastSync: new Date().toISOString(),
      });
      
      const stats = { total: importedCount, folders: foldersCreated, synced: importedCount };
      
      console.log(`[MarkSyncr] Force Pull complete: ${importedCount} bookmarks, ${foldersCreated} folders`);
      
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
    const updatedSources = sources.map((s) =>
      s.id === sourceId ? { ...s, connected: true } : s
    );
    await browser.storage.local.set({ sources: updatedSources });
    return { success: true };
  } catch (err) {
    console.error(`[MarkSyncr] Failed to connect source ${sourceId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch connected sources from the server and update local state
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
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('[MarkSyncr] Failed to fetch sources:', response.status);
      return { success: false, error: 'Failed to fetch sources' };
    }
    
    const data = await response.json();
    const serverSources = data.sources || [];
    
    console.log('[MarkSyncr] Server sources:', serverSources);
    
    // Get current local sources
    const { sources: localSources = [] } = await browser.storage.local.get('sources');
    
    // Merge server sources with local sources
    // Server sources take precedence for connection status
    const updatedSources = localSources.map((localSource) => {
      const serverSource = serverSources.find(s => s.id === localSource.id);
      if (serverSource) {
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
      // Keep local source but mark as disconnected if not on server
      // (except for browser-bookmarks which is always local)
      if (localSource.id === 'browser-bookmarks') {
        return localSource;
      }
      return { ...localSource, connected: false };
    });
    
    await browser.storage.local.set({ sources: updatedSources });
    
    console.log('[MarkSyncr] Updated local sources:', updatedSources);
    
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

    const updatedSources = sources.map((s) =>
      s.id === sourceId ? { ...s, connected: false } : s
    );

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
      return browser.storage.local
        .set({ settings: message.payload })
        .then(() => {
          setupAutoSync(); // Reconfigure auto-sync
          return { success: true };
        });

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
  console.log(`[MarkSyncr] Alarm fired: ${alarm.name} at ${new Date().toISOString()} (${browserInfo})`);
  
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('[MarkSyncr] Auto-sync alarm triggered, starting sync...');
    
    // Check if user is logged in before syncing
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      console.log('[MarkSyncr] Auto-sync skipped: user not logged in');
      return;
    }
    
    try {
      const result = await performSync();
      console.log('[MarkSyncr] Auto-sync completed:', result);
    } catch (err) {
      console.error('[MarkSyncr] Auto-sync failed:', err);
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
        { id: 'browser-bookmarks', name: 'Browser Bookmarks', type: 'browser-bookmarks', connected: true, description: 'Sync your browser bookmarks' },
        { id: 'supabase-cloud', name: 'MarkSyncr Cloud', type: 'supabase-cloud', connected: false, description: 'Sync to cloud (requires login)' },
        { id: 'github', name: 'GitHub', type: 'github', connected: false, description: 'Sync to GitHub repository' },
        { id: 'dropbox', name: 'Dropbox', type: 'dropbox', connected: false, description: 'Sync to Dropbox' },
        { id: 'google-drive', name: 'Google Drive', type: 'google-drive', connected: false, description: 'Sync to Google Drive' },
      ],
      // Auto-select browser bookmarks as default source
      selectedSource: 'browser-bookmarks',
    });
  }
  
  // Re-setup auto-sync on install/update to ensure alarm is created
  setupAutoSync().then(() => {
    console.log('[MarkSyncr] Auto-sync setup completed after install/update');
  });
});

// Startup handler - registered synchronously
browser.runtime.onStartup.addListener(async () => {
  const browserInfo = detectBrowser();
  console.log(`[MarkSyncr] Browser started (${browserInfo})`);

  // Re-setup auto-sync on startup to ensure alarm exists
  // This is important for Firefox where alarms may not persist across restarts
  await setupAutoSync();
  console.log('[MarkSyncr] Auto-sync alarm verified on startup');

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










