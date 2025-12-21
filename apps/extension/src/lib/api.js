/**
 * API client for MarkSyncr extension
 * All communication with the backend goes through web API calls
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
 * Get stored auth token
 */
async function getAuthToken() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return null;
  
  const { authToken } = await browserAPI.storage.local.get('authToken');
  return authToken;
}

/**
 * Store auth tokens
 */
async function storeTokens(accessToken, refreshToken) {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return;
  
  await browserAPI.storage.local.set({
    authToken: accessToken,
    refreshToken: refreshToken,
  });
}

/**
 * Clear auth tokens
 */
async function clearTokens() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return;
  
  await browserAPI.storage.local.remove(['authToken', 'refreshToken', 'user']);
}

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${APP_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  // Handle 401 - try to refresh token
  if (response.status === 401 && token) {
    const refreshed = await refreshSession();
    if (refreshed) {
      // Retry the request with new token
      const newToken = await getAuthToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(`${APP_URL}${endpoint}`, {
        ...options,
        headers,
      });
    }
  }
  
  return response;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email, password) {
  const response = await fetch(`${APP_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }
  
  // Store tokens
  if (data.session) {
    await storeTokens(data.session.access_token, data.session.refresh_token);
    
    // Store user info
    const browserAPI = getBrowserAPI();
    if (browserAPI && data.user) {
      await browserAPI.storage.local.set({ user: data.user });
    }
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
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Signup failed');
  }
  
  return data;
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.warn('Logout API call failed:', err);
  }
  
  // Always clear local tokens
  await clearTokens();
}

/**
 * Get the current session
 */
export async function getSession() {
  const token = await getAuthToken();
  if (!token) return null;
  
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
  
  // First check local storage
  const { user } = await browserAPI.storage.local.get('user');
  if (user) return user;
  
  // Fetch from API
  try {
    const response = await apiRequest('/api/auth/user');
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    // Cache user info
    if (data.user) {
      await browserAPI.storage.local.set({ user: data.user });
    }
    
    return data.user;
  } catch (err) {
    console.error('Failed to get user:', err);
    return null;
  }
}

/**
 * Refresh the session
 */
export async function refreshSession() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return null;
  
  const { refreshToken } = await browserAPI.storage.local.get('refreshToken');
  if (!refreshToken) return null;
  
  try {
    const response = await fetch(`${APP_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    
    if (!response.ok) {
      await clearTokens();
      return null;
    }
    
    const data = await response.json();
    
    if (data.session) {
      await storeTokens(data.session.access_token, data.session.refresh_token);
    }
    
    return data.session;
  } catch (err) {
    console.error('Failed to refresh session:', err);
    await clearTokens();
    return null;
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
  refreshSession,
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
