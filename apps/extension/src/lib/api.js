/**
 * API client for MarkSyncr extension
 * All communication with the backend goes through web API calls
 *
 * Authentication: Session cookies only (credentials: 'include')
 * The server sets HttpOnly cookies on login, which are automatically
 * sent with all subsequent requests.
 */

const APP_URL = import.meta.env.VITE_APP_URL || 'https://marksyncr.com';

/**
 * Get browser API (Chrome or Firefox)
 */
const getBrowserAPI = () => {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome;
  }
  if (typeof browser !== 'undefined' && browser.storage) {
    return browser;
  }
  return null;
};

/**
 * Clear local user data (called on logout)
 */
async function clearUserData() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return;
  
  await browserAPI.storage.local.remove(['user', 'isLoggedIn']);
}

/**
 * Store user data locally (for quick access)
 */
async function storeUserData(user) {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return;
  
  await browserAPI.storage.local.set({
    user,
    isLoggedIn: true,
  });
}

/**
 * Make an authenticated API request
 * Uses credentials: 'include' to send session cookies
 */
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await fetch(`${APP_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies with request
  });
  
  // Handle 401 - session expired, clear local data
  if (response.status === 401) {
    await clearUserData();
  }
  
  return response;
}

/**
 * Sign in with email and password
 * The server sets session cookies on successful login
 */
export async function signInWithEmail(email, password) {
  const response = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Receive and store cookies
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }
  
  // Store user info locally for quick access
  if (data.user) {
    await storeUserData(data.user);
  }
  
  return data;
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email, password) {
  const response = await fetch(`${APP_URL}/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Signup failed');
  }
  
  return data;
}

/**
 * Sign out the current user
 * The server clears session cookies on logout
 */
export async function signOut() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout API call failed:', err);
  }
  
  // Always clear local user data
  await clearUserData();
}

/**
 * Get the current session
 */
export async function getSession() {
  try {
    const response = await apiRequest('/api/auth/session');
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.session;
  } catch (err) {
    console.error('Failed to get session:', err);
    return null;
  }
}

/**
 * Get the current user
 */
export async function getUser() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return null;
  
  // First check local storage for cached user
  const { user, isLoggedIn } = await browserAPI.storage.local.get(['user', 'isLoggedIn']);
  if (user && isLoggedIn) return user;
  
  // Fetch from API (will use session cookie)
  try {
    const response = await apiRequest('/api/auth/session');
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    // Cache user info
    if (data.user) {
      await storeUserData(data.user);
    }
    
    return data.user;
  } catch (err) {
    console.error('Failed to get user:', err);
    return null;
  }
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return false;
  
  const { isLoggedIn } = await browserAPI.storage.local.get('isLoggedIn');
  if (!isLoggedIn) return false;
  
  // Verify with server
  try {
    const response = await apiRequest('/api/auth/session');
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch user's subscription status
 */
export async function fetchSubscription() {
  try {
    const response = await apiRequest('/api/subscription');
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch subscription:', err);
    return null;
  }
}

/**
 * Fetch user's settings from the cloud
 */
export async function fetchCloudSettings() {
  try {
    const response = await apiRequest('/api/settings');
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch cloud settings:', err);
    return null;
  }
}

/**
 * Save settings to the cloud
 */
export async function saveCloudSettings(settings) {
  try {
    const response = await apiRequest('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    
    return response.ok;
  } catch (err) {
    console.error('Failed to save cloud settings:', err);
    return false;
  }
}

/**
 * Save bookmark version to cloud
 */
export async function saveBookmarkVersion(bookmarkData, sourceType, deviceName) {
  try {
    const response = await apiRequest('/api/versions', {
      method: 'POST',
      body: JSON.stringify({
        bookmarkData,
        sourceType,
        deviceName,
      }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save version');
    }
    
    return await response.json();
  } catch (err) {
    console.error('Failed to save bookmark version:', err);
    throw err;
  }
}

/**
 * Fetch version history
 */
export async function fetchVersionHistory(limit = 20, offset = 0) {
  try {
    const response = await apiRequest(`/api/versions?limit=${limit}&offset=${offset}`);
    
    if (!response.ok) {
      return { versions: [], retentionLimit: 5 };
    }
    
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch version history:', err);
    return { versions: [], retentionLimit: 5 };
  }
}

/**
 * Fetch tags
 */
export async function fetchTags() {
  try {
    const response = await apiRequest('/api/tags');
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.tags || [];
  } catch (err) {
    console.error('Failed to fetch tags:', err);
    return [];
  }
}

/**
 * Fetch bookmarks from cloud
 */
export async function fetchBookmarks() {
  try {
    const response = await apiRequest('/api/bookmarks');
    
    if (!response.ok) {
      return { bookmarks: [], count: 0 };
    }
    
    return await response.json();
  } catch (err) {
    console.error('Failed to fetch bookmarks:', err);
    return { bookmarks: [], count: 0 };
  }
}

/**
 * Sync bookmarks to cloud
 */
export async function syncBookmarks(bookmarks, source = 'browser') {
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
    console.error('Failed to sync bookmarks:', err);
    throw err;
  }
}

/**
 * Delete a bookmark from cloud
 */
export async function deleteBookmark(urlOrId) {
  try {
    const body = typeof urlOrId === 'string' && urlOrId.startsWith('http')
      ? { url: urlOrId }
      : { id: urlOrId };
    
    const response = await apiRequest('/api/bookmarks', {
      method: 'DELETE',
      body: JSON.stringify(body),
    });
    
    return response.ok;
  } catch (err) {
    console.error('Failed to delete bookmark:', err);
    return false;
  }
}

/**
 * Get browser bookmarks using the browser API
 */
export async function getBrowserBookmarks() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI?.bookmarks) {
    console.warn('Browser bookmarks API not available');
    return [];
  }
  
  try {
    const tree = await browserAPI.bookmarks.getTree();
    const bookmarks = [];
    
    function processNode(node, path = '') {
      if (node.url) {
        bookmarks.push({
          id: node.id,
          url: node.url,
          title: node.title || node.url,
          folderPath: path,
          dateAdded: node.dateAdded,
        });
      }
      
      if (node.children) {
        const newPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;
        for (const child of node.children) {
          processNode(child, newPath);
        }
      }
    }
    
    for (const root of tree) {
      processNode(root);
    }
    
    return bookmarks;
  } catch (err) {
    console.error('Failed to get browser bookmarks:', err);
    return [];
  }
}

export default {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  getUser,
  isLoggedIn,
  fetchSubscription,
  fetchCloudSettings,
  saveCloudSettings,
  saveBookmarkVersion,
  fetchVersionHistory,
  fetchTags,
  fetchBookmarks,
  syncBookmarks,
  deleteBookmark,
  getBrowserBookmarks,
};
