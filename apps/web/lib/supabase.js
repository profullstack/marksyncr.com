import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables not set. Authentication will not work.'
  );
}

/**
 * Supabase client for browser-side operations
 * Uses the anon key for public operations
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Get the current authenticated user
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('Error getting current user:', error.message);
    return null;
  }

  return user;
}

/**
 * Sign in with OAuth provider
 * @param {'github' | 'google'} provider - OAuth provider
 * @param {string} [redirectTo] - URL to redirect after auth
 */
export async function signInWithOAuth(provider, redirectTo) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo || `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw new Error(`OAuth sign in failed: ${error.message}`);
  }

  return data;
}

/**
 * Sign in with email and password
 * @param {string} email
 * @param {string} password
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Email sign in failed: ${error.message}`);
  }

  return data;
}

/**
 * Sign up with email and password
 * @param {string} email
 * @param {string} password
 * @param {object} [metadata] - Additional user metadata
 */
export async function signUpWithEmail(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });

  if (error) {
    throw new Error(`Sign up failed: ${error.message}`);
  }

  return data;
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(`Sign out failed: ${error.message}`);
  }
}

/**
 * Get user subscription details
 * @param {string} userId
 */
export async function getUserSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    throw new Error(`Failed to get subscription: ${error.message}`);
  }

  return data;
}

/**
 * Get user's OAuth tokens for a provider
 * @param {string} userId
 * @param {'github' | 'dropbox' | 'google-drive'} provider
 */
export async function getOAuthToken(userId, provider) {
  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get OAuth token: ${error.message}`);
  }

  return data;
}

/**
 * Save OAuth token for a provider
 * @param {string} userId
 * @param {'github' | 'dropbox' | 'google-drive'} provider
 * @param {string} accessToken
 * @param {string} [refreshToken]
 * @param {Date} [expiresAt]
 */
export async function saveOAuthToken(
  userId,
  provider,
  accessToken,
  refreshToken,
  expiresAt
) {
  const { data, error } = await supabase
    .from('oauth_tokens')
    .upsert(
      {
        user_id: userId,
        provider,
        access_token_encrypted: accessToken, // Note: Should be encrypted server-side
        refresh_token_encrypted: refreshToken,
        expires_at: expiresAt?.toISOString(),
      },
      {
        onConflict: 'user_id,provider',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save OAuth token: ${error.message}`);
  }

  return data;
}

/**
 * Delete OAuth token for a provider
 * @param {string} userId
 * @param {'github' | 'dropbox' | 'google-drive'} provider
 */
export async function deleteOAuthToken(userId, provider) {
  const { error } = await supabase
    .from('oauth_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    throw new Error(`Failed to delete OAuth token: ${error.message}`);
  }
}

/**
 * Get user's cloud bookmarks (for paid tier)
 * @param {string} userId
 */
export async function getCloudBookmarks(userId) {
  const { data, error } = await supabase
    .from('cloud_bookmarks')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get cloud bookmarks: ${error.message}`);
  }

  return data;
}

/**
 * Save cloud bookmarks (for paid tier)
 * @param {string} userId
 * @param {object} bookmarkData
 * @param {string} checksum
 */
export async function saveCloudBookmarks(userId, bookmarkData, checksum) {
  const { data, error } = await supabase
    .from('cloud_bookmarks')
    .upsert(
      {
        user_id: userId,
        bookmark_data: bookmarkData,
        checksum,
        last_modified: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save cloud bookmarks: ${error.message}`);
  }

  return data;
}

/**
 * Get user's sync state for a device
 * @param {string} userId
 * @param {string} deviceId
 */
export async function getSyncState(userId, deviceId) {
  const { data, error } = await supabase
    .from('sync_state')
    .select('*')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get sync state: ${error.message}`);
  }

  return data;
}

/**
 * Update sync state for a device
 * @param {string} userId
 * @param {string} deviceId
 * @param {object} state
 */
export async function updateSyncState(userId, deviceId, state) {
  const { data, error } = await supabase
    .from('sync_state')
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        ...state,
        last_sync_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,device_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update sync state: ${error.message}`);
  }

  return data;
}

/**
 * Get all devices for a user
 * @param {string} userId
 */
export async function getUserDevices(userId) {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get devices: ${error.message}`);
  }

  return data || [];
}

/**
 * Register or update a device
 * @param {string} userId
 * @param {string} deviceId
 * @param {object} deviceInfo
 */
export async function registerDevice(userId, deviceId, deviceInfo) {
  const { data, error } = await supabase
    .from('devices')
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        name: deviceInfo.name,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,device_id',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to register device: ${error.message}`);
  }

  return data;
}

/**
 * Subscribe to real-time changes on cloud bookmarks
 * @param {string} userId
 * @param {function} callback
 * @returns {function} Unsubscribe function
 */
export function subscribeToBookmarkChanges(userId, callback) {
  const subscription = supabase
    .channel(`bookmarks:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cloud_bookmarks',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}
