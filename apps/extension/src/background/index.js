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
    
    // If a bookmark is re-added, remove its tombstone
    if (bookmark.url) {
      await removeTombstone(bookmark.url);
    }
    
    scheduleSync('bookmark-created');
  });

  // Listen for bookmark removal - add tombstone for deletion sync
  browser.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
    console.log('[MarkSyncr] Bookmark removed:', id, removeInfo);
    
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
    scheduleSync('bookmark-changed');
  });

  // Listen for bookmark moves
  browser.bookmarks.onMoved.addListener((id, moveInfo) => {
    console.log('[MarkSyncr] Bookmark moved:', id);
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
 * @param {Array} tree - Browser bookmark tree
 * @returns {Array} - Flat array of bookmarks
 */
function flattenBookmarkTree(tree) {
  const bookmarks = [];

  function traverse(nodes, path = '') {
    for (const node of nodes) {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          url: node.url,
          // Preserve empty titles - don't replace with URL
          title: node.title ?? '',
          folderPath: path,
          dateAdded: node.dateAdded,
        });
      } else if (node.children) {
        const newPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;
        traverse(node.children, newPath);
      }
    }
  }

  traverse(tree);
  return bookmarks;
}

/**
 * Perform bookmark sync (two-way: pull from cloud, merge, push back, with tombstone support)
 * @param {string} [sourceId] - Optional specific source to sync with
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function performSync(sourceId) {
  console.log('[MarkSyncr] performSync called with sourceId:', sourceId);
  
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
      
      // Step 9: Push merged bookmarks and tombstones back to cloud
      console.log(`[MarkSyncr] Pushing ${mergedFlat.length} merged bookmarks and ${mergedTombstones.length} tombstones to cloud...`);
      const syncResult = await syncBookmarksToCloud(mergedFlat, detectBrowser(), mergedTombstones);
      console.log('[MarkSyncr] Cloud sync result:', syncResult);

      // Step 10: Save version history
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
  }
}

/**
 * Apply tombstones from cloud to local bookmarks (delete bookmarks that were deleted elsewhere)
 * @param {Array<{url: string, deletedAt: number}>} tombstones - Tombstones from cloud
 * @param {Array} localBookmarks - Current local bookmarks
 * @returns {Promise<number>} - Number of bookmarks deleted
 */
async function applyTombstonesToLocal(tombstones, localBookmarks) {
  let deletedCount = 0;
  
  // Create a map of tombstones by URL for quick lookup
  const tombstoneMap = new Map(tombstones.map(t => [t.url, t.deletedAt]));
  
  for (const bookmark of localBookmarks) {
    const tombstoneTime = tombstoneMap.get(bookmark.url);
    if (tombstoneTime) {
      // Check if tombstone is newer than the bookmark's dateAdded
      // If tombstone is newer, delete the bookmark
      const bookmarkTime = bookmark.dateAdded || 0;
      if (tombstoneTime > bookmarkTime) {
        try {
          await browser.bookmarks.remove(bookmark.id);
          deletedCount++;
          console.log(`[MarkSyncr] Deleted local bookmark (tombstoned): ${bookmark.url}`);
        } catch (err) {
          console.warn(`[MarkSyncr] Failed to delete tombstoned bookmark: ${bookmark.url}`, err);
        }
      }
    }
  }
  
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
 * Add bookmarks from cloud to local browser
 * @param {Array} cloudBookmarks - Bookmarks from cloud to add locally
 */
async function addCloudBookmarksToLocal(cloudBookmarks) {
  // Get current browser bookmarks to find root folders
  const currentTree = await browser.bookmarks.getTree();
  const rootFolders = {};
  const browserType = detectBrowser();
  
  console.log(`[MarkSyncr] addCloudBookmarksToLocal: browser=${browserType}, bookmarks to add=${cloudBookmarks.length}`);
  
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
  
  // Create a folder cache for quick lookup
  const folderCache = new Map();
  
  // Helper to get or create folder by path
  async function getOrCreateFolder(folderPath, parentId) {
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
        // Create new folder
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
  
  // Add each bookmark
  let addedCount = 0;
  let skippedCount = 0;
  
  for (const bookmark of cloudBookmarks) {
    try {
      // Determine which root folder to use based on folderPath
      let rootFolder = rootFolders.other || rootFolders.toolbar;
      let folderPath = bookmark.folderPath || '';
      
      // Check if folderPath starts with a known root
      // Handle various browser naming conventions:
      // - Chrome: "Bookmarks Bar", "Other Bookmarks"
      // - Firefox: "Bookmarks Toolbar", "Bookmarks Menu", "Other Bookmarks"
      // - Opera: "Bookmarks bar", "Other bookmarks", "Speed Dial" (Opera-specific)
      const lowerPath = folderPath.toLowerCase();
      
      if (lowerPath.startsWith('bookmarks bar') ||
          lowerPath.startsWith('bookmarks toolbar') ||
          lowerPath.startsWith('speed dial')) {
        rootFolder = rootFolders.toolbar || rootFolders.other;
        folderPath = folderPath.split('/').slice(1).join('/');
      } else if (lowerPath.startsWith('bookmarks menu')) {
        rootFolder = rootFolders.menu || rootFolders.other;
        folderPath = folderPath.split('/').slice(1).join('/');
      } else if (lowerPath.startsWith('other bookmarks') ||
                 lowerPath.startsWith('unsorted bookmarks')) {
        rootFolder = rootFolders.other || rootFolders.toolbar;
        folderPath = folderPath.split('/').slice(1).join('/');
      }
      
      if (!rootFolder) {
        console.warn(`[MarkSyncr] No root folder found for bookmark: ${bookmark.url}, folderPath: ${bookmark.folderPath}`);
        skippedCount++;
        continue;
      }
      
      // Get or create the target folder
      const targetFolderId = await getOrCreateFolder(folderPath, rootFolder.id);
      
      // Create the bookmark
      await browser.bookmarks.create({
        parentId: targetFolderId,
        title: bookmark.title ?? '',
        url: bookmark.url,
      });
      addedCount++;
    } catch (err) {
      console.warn('[MarkSyncr] Failed to add bookmark from cloud:', bookmark.url, err);
      skippedCount++;
    }
  }
  
  console.log(`[MarkSyncr] addCloudBookmarksToLocal complete: added=${addedCount}, skipped=${skippedCount}, total=${cloudBookmarks.length}`);
}

/**
 * Convert browser bookmark tree to MarkSyncr format
 * @param {Array} tree - Browser bookmark tree
 * @returns {object} - MarkSyncr bookmark data
 */
function convertBrowserBookmarks(tree) {
  const result = {
    version: '1.0.0',
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
    for (const root of tree[0].children) {
      const title = root.title?.toLowerCase() || '';

      if (title.includes('toolbar') || title.includes('bar')) {
        result.roots.toolbar = convertNode(root);
      } else if (title.includes('menu')) {
        result.roots.menu = convertNode(root);
      } else if (title.includes('other') || title.includes('unsorted')) {
        result.roots.other = convertNode(root);
      }
      // Skip mobile bookmarks for now
    }
  }

  return result;
}

/**
 * Convert a bookmark node recursively
 * @param {object} node - Browser bookmark node
 * @returns {object} - MarkSyncr bookmark node
 */
function convertNode(node) {
  if (node.url) {
    // It's a bookmark
    return {
      type: 'bookmark',
      title: node.title || '',
      url: node.url,
      dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
    };
  }

  // It's a folder
  return {
    type: 'folder',
    title: node.title || '',
    children: (node.children || []).map(convertNode),
    dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
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
  
  // Check other Chromium-based browsers
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'opera';
  if (ua.includes('Brave')) return 'brave';
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
    console.log('[MarkSyncr] Retrieved cloud bookmarks:', cloudBookmarks);
    
    // Get current browser bookmarks to find root folders
    const currentTree = await browser.bookmarks.getTree();
    const rootFolders = {};
    
    if (currentTree[0]?.children) {
      for (const root of currentTree[0].children) {
        const title = root.title?.toLowerCase() || '';
        if (title.includes('toolbar') || title.includes('bar')) {
          rootFolders.toolbar = root;
        } else if (title.includes('menu')) {
          rootFolders.menu = root;
        } else if (title.includes('other') || title.includes('unsorted')) {
          rootFolders.other = root;
        }
      }
    }
    
    // Clear existing bookmarks in each root folder and recreate from cloud
    let importedCount = 0;
    let foldersCreated = 0;
    
    for (const [rootKey, rootFolder] of Object.entries(rootFolders)) {
      if (!rootFolder) continue;
      
      const cloudRoot = cloudBookmarks.roots?.[rootKey];
      if (!cloudRoot?.children) continue;
      
      // Remove existing children
      if (rootFolder.children) {
        for (const child of rootFolder.children) {
          try {
            await browser.bookmarks.removeTree(child.id);
          } catch (err) {
            console.warn('[MarkSyncr] Failed to remove bookmark:', child.id, err);
          }
        }
      }
      
      // Recreate from cloud data
      const result = await recreateBookmarks(rootFolder.id, cloudRoot.children);
      importedCount += result.bookmarks;
      foldersCreated += result.folders;
    }
    
    // Update last sync time
    await browser.storage.local.set({
      lastSync: new Date().toISOString(),
    });
    
    const stats = { total: importedCount, folders: foldersCreated, synced: importedCount };
    
    return {
      success: true,
      stats,
      message: `Successfully imported ${importedCount} bookmarks and ${foldersCreated} folders from cloud`,
    };
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
