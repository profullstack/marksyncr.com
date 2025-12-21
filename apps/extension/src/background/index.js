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
const DEFAULT_SYNC_INTERVAL = 15; // minutes

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
 * Perform bookmark sync
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

    console.log(`[MarkSyncr] Starting sync with source: ${targetSourceId}`);

    // Get current bookmarks from browser
    const bookmarkTree = await browser.bookmarks.getTree();
    const bookmarks = convertBrowserBookmarks(bookmarkTree);

    // Get source configuration
    const source = sources?.find((s) => s.id === targetSourceId);
    if (!source?.connected) {
      return { success: false, error: 'Source not connected' };
    }

    // TODO: Implement actual sync logic using @marksyncr/core and @marksyncr/sources
    // For now, just count bookmarks
    const stats = countBookmarks(bookmarkTree);

    console.log('[MarkSyncr] Sync completed:', stats);

    // Update last sync time
    await browser.storage.local.set({
      lastSync: new Date().toISOString(),
    });

    return { success: true, stats };
  } catch (err) {
    console.error('[MarkSyncr] Sync failed:', err);
    return { success: false, error: err.message };
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
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    // Could be Chrome, Edge, or other Chromium browsers
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'edge';
    if (ua.includes('OPR/')) return 'opera';
    if (ua.includes('Brave')) return 'brave';
    return 'chrome';
  }
  return 'firefox';
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
