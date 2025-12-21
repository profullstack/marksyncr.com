import { createClient } from '@supabase/supabase-js';

// Supabase configuration from Vite environment variables
// Set these in apps/extension/.env.local (copy from .env.example)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';
const APP_URL = import.meta.env.VITE_APP_URL || 'https://marksyncr.com';

// Config endpoint for dynamic configuration (fallback)
const CONFIG_URL = `${APP_URL}/api/config`;

let supabaseClient = null;
let config = null;

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
 * Fetch Supabase configuration from the server
 */
async function fetchConfig() {
  if (config) return config;

  try {
    const response = await fetch(CONFIG_URL);
    if (response.ok) {
      config = await response.json();
      return config;
    }
  } catch (err) {
    console.warn('Failed to fetch config, using defaults:', err);
  }

  // Fallback to hardcoded values (for development)
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  };
}

/**
 * Create or get the Supabase client
 */
export async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const browserAPI = getBrowserAPI();
  const { supabaseUrl, supabaseAnonKey } = await fetchConfig();

  // Custom storage adapter for browser extension
  const customStorage = {
    getItem: async (key) => {
      if (!browserAPI) return null;
      const result = await browserAPI.storage.local.get(key);
      return result[key] || null;
    },
    setItem: async (key, value) => {
      if (!browserAPI) return;
      await browserAPI.storage.local.set({ [key]: value });
    },
    removeItem: async (key) => {
      if (!browserAPI) return;
      await browserAPI.storage.local.remove(key);
    },
  };

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: customStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseClient;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email, password) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Store the session token for API calls
  const browserAPI = getBrowserAPI();
  if (browserAPI && data.session) {
    await browserAPI.storage.local.set({
      authToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  }

  return data;
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email, password) {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://marksyncr.com/auth/callback',
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  // Check if user already exists
  if (data?.user?.identities?.length === 0) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  return data;
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase = await getSupabaseClient();
  const browserAPI = getBrowserAPI();

  const { error } = await supabase.auth.signOut();

  // Clear stored tokens
  if (browserAPI) {
    await browserAPI.storage.local.remove(['authToken', 'refreshToken']);
  }

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Get the current session
 */
export async function getSession() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Failed to get session:', error);
    return null;
  }

  return data.session;
}

/**
 * Get the current user
 */
export async function getUser() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('Failed to get user:', error);
    return null;
  }

  return data.user;
}

/**
 * Refresh the session
 */
export async function refreshSession() {
  const supabase = await getSupabaseClient();
  const browserAPI = getBrowserAPI();

  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    console.error('Failed to refresh session:', error);
    return null;
  }

  // Update stored tokens
  if (browserAPI && data.session) {
    await browserAPI.storage.local.set({
      authToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  }

  return data.session;
}

/**
 * Listen for auth state changes
 */
export async function onAuthStateChange(callback) {
  const supabase = await getSupabaseClient();

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return data.subscription;
}

/**
 * Fetch user's subscription status
 */
export async function fetchSubscription() {
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return null;

  const { authToken } = await browserAPI.storage.local.get('authToken');
  if (!authToken) return null;

  try {
    const response = await fetch('https://marksyncr.com/api/subscription', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try to refresh
        const session = await refreshSession();
        if (session) {
          return fetchSubscription();
        }
      }
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
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return null;

  const { authToken } = await browserAPI.storage.local.get('authToken');
  if (!authToken) return null;

  try {
    const response = await fetch('https://marksyncr.com/api/settings', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

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
  const browserAPI = getBrowserAPI();
  if (!browserAPI) return false;

  const { authToken } = await browserAPI.storage.local.get('authToken');
  if (!authToken) return false;

  try {
    const response = await fetch('https://marksyncr.com/api/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(settings),
    });

    return response.ok;
  } catch (err) {
    console.error('Failed to save cloud settings:', err);
    return false;
  }
}

export default {
  getSupabaseClient,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getSession,
  getUser,
  refreshSession,
  onAuthStateChange,
  fetchSubscription,
  fetchCloudSettings,
  saveCloudSettings,
};
