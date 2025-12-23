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
 * Sync bookmarks to cloud
 */
async function syncBookmarksToCloud(bookmarks, source = 'browser') {
  try {
    const response = await apiRequest('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ bookmarks, source }),
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
 * Initialize the background service worker
 */
async function initialize() {
  console.log('[MarkSyncr] Background service worker initialized');

  // Set up alarm for automatic sync
  await setupAutoSync();

  // Listen for bookmark changes
  setupBookmarkListeners();
}

/**
 * Set up automatic sync alarm
 */
async function setupAutoSync() {
  try {
    const { settings } = await browser.storage.local.get('settings');
    const interval = settings?.syncInterval || DEFAULT_SYNC_INTERVAL;

    if (settings?.autoSync !== false) {
      // Clear existing alarm
      await browser.alarms.clear(SYNC_ALARM_NAME);

      // Create new alarm
      await browser.alarms.create(SYNC_ALARM_NAME, {
        periodInMinutes: interval,
      });

      console.log(`[MarkSyncr] Auto-sync alarm set for every ${interval} minutes`);
    }
  } catch (err) {
    console.error('[MarkSyncr] Failed to set up auto-sync:', err);
  }
}

/**
 * Set up bookmark change listeners
 */
function setupBookmarkListeners() {
  // Listen for bookmark creation
  browser.bookmarks.onCreated.addListener((id, bookmark) => {
    console.log('[MarkSyncr] Bookmark created:', bookmark.title);
    scheduleSync('bookmark-created');
  });

  // Listen for bookmark removal
  browser.bookmarks.onRemoved.addListener((id, removeInfo) => {
    console.log('[MarkSyncr] Bookmark removed:', id);
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
 * Perform bookmark sync (two-way: pull from cloud, merge, push back)
 * @param {string} [sourceId] - Optional specific source to sync with
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
async function performSync(sourceId) {
  try {
    const { selectedSource, sources } = await browser.storage.local.get([
      'selectedSource',
      'sources',
    ]);

    const targetSourceId = sourceId || selectedSource;

    if (!targetSourceId) {
      return { success: false, error: 'No sync source configured' };
    }

    console.log(`[MarkSyncr] Starting two-way sync with source: ${targetSourceId}`);

    // Get source configuration
    const source = sources?.find((s) => s.id === targetSourceId);
    
    // Browser bookmarks source is always available
    const isBrowserSource = targetSourceId === 'browser-bookmarks';
    
    if (!isBrowserSource && !source?.connected) {
      console.log('[MarkSyncr] Source not connected:', targetSourceId, source);
      return { success: false, error: 'Source not connected' };
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
        error: 'Please log in to sync bookmarks to the cloud',
        requiresAuth: true,
      };
    }
    
    // Two-way sync
    try {
      // Step 1: Get current local bookmarks
      const bookmarkTree = await browser.bookmarks.getTree();
      const localFlat = flattenBookmarkTree(bookmarkTree);
      console.log(`[MarkSyncr] Local bookmarks: ${localFlat.length}`);
      
      // Step 2: Get bookmarks from cloud
      console.log('[MarkSyncr] Fetching cloud bookmarks...');
      const cloudData = await getBookmarksFromCloud();
      const cloudBookmarks = cloudData.bookmarks || [];
      console.log(`[MarkSyncr] Cloud bookmarks: ${cloudBookmarks.length}`);
      
      // Step 3: Merge - find bookmarks in cloud that are not in local
      const localUrls = new Set(localFlat.map(b => b.url));
      const newFromCloud = cloudBookmarks.filter(cb => !localUrls.has(cb.url));
      console.log(`[MarkSyncr] New bookmarks from cloud: ${newFromCloud.length}`);
      
      // Step 4: Add new cloud bookmarks to local browser
      if (newFromCloud.length > 0) {
        await addCloudBookmarksToLocal(newFromCloud);
        console.log(`[MarkSyncr] Added ${newFromCloud.length} bookmarks from cloud to local`);
      }
      
      // Step 5: Get updated local bookmarks after merge
      const updatedTree = await browser.bookmarks.getTree();
      const mergedFlat = flattenBookmarkTree(updatedTree);
      const mergedData = convertBrowserBookmarks(updatedTree);
      const stats = countBookmarks(updatedTree);
      
      // Step 6: Push merged bookmarks back to cloud
      console.log(`[MarkSyncr] Pushing ${mergedFlat.length} merged bookmarks to cloud...`);
      const syncResult = await syncBookmarksToCloud(mergedFlat, detectBrowser());
      console.log('[MarkSyncr] Cloud sync result:', syncResult);

      // Step 7: Save version history
      console.log('[MarkSyncr] Saving version history...');
      const versionResult = await saveVersionToCloud(
        mergedData,
        detectBrowser(),
        `${detectBrowser()}-extension`,
        {
          type: 'two_way_sync',
          addedFromCloud: newFromCloud.length,
        }
      );
      console.log('[MarkSyncr] Version saved:', versionResult);
      
      console.log('[MarkSyncr] Two-way sync completed:', stats);

      // Update last sync time
      await browser.storage.local.set({
        lastSync: new Date().toISOString(),
      });

      return {
        success: true,
        stats,
        addedFromCloud: newFromCloud.length,
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
 * Add bookmarks from cloud to local browser
 * @param {Array} cloudBookmarks - Bookmarks from cloud to add locally
 */
async function addCloudBookmarksToLocal(cloudBookmarks) {
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
  for (const bookmark of cloudBookmarks) {
    try {
      // Determine which root folder to use based on folderPath
      let rootFolder = rootFolders.other || rootFolders.toolbar;
      let folderPath = bookmark.folderPath || '';
      
      // Check if folderPath starts with a known root
      const lowerPath = folderPath.toLowerCase();
      if (lowerPath.startsWith('bookmarks bar') || lowerPath.startsWith('bookmarks toolbar')) {
        rootFolder = rootFolders.toolbar || rootFolders.other;
        folderPath = folderPath.split('/').slice(1).join('/');
      } else if (lowerPath.startsWith('bookmarks menu')) {
        rootFolder = rootFolders.menu || rootFolders.other;
        folderPath = folderPath.split('/').slice(1).join('/');
      } else if (lowerPath.startsWith('other bookmarks')) {
        rootFolder = rootFolders.other || rootFolders.toolbar;
        folderPath = folderPath.split('/').slice(1).join('/');
      }
      
      if (!rootFolder) {
        console.warn('[MarkSyncr] No root folder found, skipping bookmark:', bookmark.url);
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
    } catch (err) {
      console.warn('[MarkSyncr] Failed to add bookmark from cloud:', bookmark.url, err);
    }
  }
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
 * @returns {Promise<{bookmarks: number, folders: number}>}
 */
async function recreateBookmarks(parentId, items) {
  let bookmarks = 0;
  let folders = 0;
  
  for (const item of items) {
    try {
      if (item.type === 'bookmark' && item.url) {
        await browser.bookmarks.create({
          parentId,
          // Preserve empty titles - don't replace with URL
          title: item.title ?? '',
          url: item.url,
        });
        bookmarks++;
      } else if (item.type === 'folder' || item.children) {
        const newFolder = await browser.bookmarks.create({
          parentId,
          title: item.title || 'Untitled Folder',
        });
        folders++;
        
        if (item.children && item.children.length > 0) {
          const childResult = await recreateBookmarks(newFolder.id, item.children);
          bookmarks += childResult.bookmarks;
          folders += childResult.folders;
        }
      }
    } catch (err) {
      console.warn('[MarkSyncr] Failed to create bookmark:', item.title, err);
    }
  }
  
  return { bookmarks, folders };
}

/**
 * Handle OAuth connection for a source
 * @param {string} sourceId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function connectSource(sourceId) {
  try {
    console.log(`[MarkSyncr] Connecting to source: ${sourceId}`);

    // TODO: Implement OAuth flows for each source type
    // For now, just mark as connected
    const { sources = [] } = await browser.storage.local.get('sources');

    const updatedSources = sources.map((s) =>
      s.id === sourceId ? { ...s, connected: true } : s
    );

    // If source doesn't exist, add it
    if (!sources.find((s) => s.id === sourceId)) {
      updatedSources.push({
        id: sourceId,
        name: sourceId,
        type: sourceId,
        connected: true,
      });
    }

    await browser.storage.local.set({ sources: updatedSources });

    return { success: true };
  } catch (err) {
    console.error(`[MarkSyncr] Failed to connect source ${sourceId}:`, err);
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

// Alarm handler
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    console.log('[MarkSyncr] Auto-sync alarm triggered');
    performSync();
  }
});

// Extension install/update handler
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
});

// Startup handler
browser.runtime.onStartup.addListener(async () => {
  console.log('[MarkSyncr] Browser started');

  const { settings } = await browser.storage.local.get('settings');

  if (settings?.syncOnStartup) {
    // Delay startup sync slightly to let browser settle
    setTimeout(() => {
      console.log('[MarkSyncr] Performing startup sync');
      performSync();
    }, 5000);
  }
});

// Initialize
initialize();
