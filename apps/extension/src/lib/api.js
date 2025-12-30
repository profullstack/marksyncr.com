/**
 * API client for MarkSyncr extension
 * All communication with the backend goes through web API calls
 *
 * Authentication: Bearer token in Authorization header
 * The extension stores tokens in browser.storage.local after login
 * and sends them with each request.
 */

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:3000';

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
 * Get stored access token
 */
async function getAccessToken() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return null;
  
  const { session } = await browserAPI.storage.local.get('session');
  return session?.access_token || null;
}

/**
 * Store session data locally
 */
async function storeSession(session) {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return;
  
  await browserAPI.storage.local.set({ session });
}

/**
 * Clear local user data (called on logout)
 */
async function clearUserData() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return;
  
  await browserAPI.storage.local.remove(['user', 'isLoggedIn', 'session']);
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
 * Uses Bearer token in Authorization header
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getAccessToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add Authorization header if we have a token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${APP_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  // Handle 401 - session expired, try to refresh or clear local data
  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the request with new token
      const newToken = await getAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(`${APP_URL}${endpoint}`, {
        ...options,
        headers,
      });
    }
    await clearUserData();
  }
  
  return response;
}

/**
 * Try to refresh the access token
 */
async function tryRefreshToken() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return false;
  
  const { session } = await browserAPI.storage.local.get('session');
  if (!session?.refresh_token) return false;
  
  try {
    const response = await fetch(`${APP_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    if (data.session) {
      await storeSession(data.session);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sign in with email and password
 * Stores session tokens in browser.storage.local for authenticated requests
 */
export async function signInWithEmail(email, password) {
  const response = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  
  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Login API returned non-JSON response:', text.substring(0, 200));
    throw new Error(`Server error: Expected JSON response but got ${contentType || 'unknown content type'}. The API may be unavailable.`);
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }
  
  // Store session tokens for authenticated requests
  if (data.session) {
    await storeSession(data.session);
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
    body: JSON.stringify({ email, password }),
  });
  
  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('Signup API returned non-JSON response:', text.substring(0, 200));
    throw new Error(`Server error: Expected JSON response but got ${contentType || 'unknown content type'}. The API may be unavailable.`);
  }
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Signup failed');
  }
  
  // Store session tokens if returned
  if (data.session) {
    await storeSession(data.session);
  }
  
  // Store user info locally
  if (data.user) {
    await storeUserData(data.user);
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
 * Note: The /api/auth/session endpoint returns { user: {...} } if authenticated
 * We return a truthy value (the user object) to indicate a valid session exists
 */
export async function getSession() {
  try {
    const response = await apiRequest('/api/auth/session');
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    // The session endpoint returns { user: {...} } if authenticated
    // Return the user object as a truthy session indicator
    return data.user || data.session || null;
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
 * Fetch connected sync sources from the server
 */
export async function fetchSyncSources() {
  try {
    const response = await apiRequest('/api/sources');
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.sources || [];
  } catch (err) {
    console.error('Failed to fetch sync sources:', err);
    return [];
  }
}

/**
 * Get the OAuth connect URL for a provider
 * @param {string} provider - Provider name (github, dropbox, google-drive)
 * @returns {string} OAuth URL to open in a new tab
 */
export function getOAuthConnectUrl(provider) {
  const providerMap = {
    'github': '/api/connect/github',
    'dropbox': '/api/connect/dropbox',
    'google-drive': '/api/connect/google',
  };
  
  const endpoint = providerMap[provider];
  if (!endpoint) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  return `${APP_URL}${endpoint}`;
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
  fetchSyncSources,
  getOAuthConnectUrl,
  fetchTags,
  fetchBookmarks,
  syncBookmarks,
  deleteBookmark,
  getBrowserBookmarks,
};
