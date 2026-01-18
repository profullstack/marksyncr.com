/**
 * @fileoverview Supabase Cloud source for paid tier bookmark sync
 * Stores bookmarks directly in Supabase database with cross-device sync support
 */

import { BaseSource } from './base-source.js';
import { SOURCE_TYPE } from '@marksyncr/types';
import { generateChecksum } from '@marksyncr/core';

/**
 * @typedef {import('@marksyncr/types').BookmarkFile} BookmarkFile
 * @typedef {import('@marksyncr/types').SourceConfig} SourceConfig
 * @typedef {import('@marksyncr/types').SourceCredentials} SourceCredentials
 */

/**
 * @typedef {Object} SyncState
 * @property {string} deviceId - Unique device identifier
 * @property {string} deviceName - Human-readable device name
 * @property {string} lastSyncAt - ISO timestamp of last sync
 * @property {string} checksum - Checksum at last sync
 * @property {number} version - Version at last sync
 */

/**
 * @typedef {Object} Device
 * @property {string} id - Device ID
 * @property {string} name - Device name
 * @property {string} browser - Browser type
 * @property {string} lastSeenAt - Last activity timestamp
 */

/**
 * Supabase Cloud source for paid tier users
 * Stores bookmarks directly in Supabase database for simplest sync experience
 * Includes cross-device sync state management
 */
export class SupabaseCloudSource extends BaseSource {
  /**
   * @param {SourceConfig} config
   * @param {SourceCredentials} credentials
   */
  constructor(config, credentials) {
    super({ ...config, type: SOURCE_TYPE.SUPABASE_CLOUD }, credentials);

    this.supabaseUrl = config.supabaseUrl;
    this.userId = null;
    this.deviceId = null;
    this.deviceName = null;
  }

  /**
   * Sets the Supabase client (injected from app)
   * @param {Object} client - Supabase client instance
   */
  setClient(client) {
    this.client = client;
  }

  /**
   * Sets the user ID
   * @param {string} userId
   */
  setUserId(userId) {
    this.userId = userId;
  }

  /**
   * Sets the device information
   * @param {string} deviceId - Unique device identifier
   * @param {string} deviceName - Human-readable device name
   */
  setDevice(deviceId, deviceName) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
  }

  /**
   * Checks if user has an active paid subscription
   * @returns {Promise<boolean>}
   */
  async hasActiveSubscription() {
    if (!this.client || !this.userId) return false;

    try {
      const { data, error } = await this.client
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', this.userId)
        .in('status', ['active', 'trialing'])
        .single();

      if (error || !data) return false;

      // Check if subscription is still valid
      const periodEnd = new Date(data.current_period_end);
      return periodEnd > new Date();
    } catch {
      return false;
    }
  }

  /**
   * Gets subscription details
   * @returns {Promise<Object|null>}
   */
  async getSubscription() {
    if (!this.client || !this.userId) return null;

    const { data, error } = await this.client
      .from('subscriptions')
      .select('*')
      .eq('user_id', this.userId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Reads bookmark data from Supabase
   * @returns {Promise<BookmarkFile>}
   */
  async read() {
    if (!this.client) {
      throw new Error('Supabase client not configured');
    }

    if (!this.userId) {
      throw this.createUnauthorizedError('User not authenticated');
    }

    const { data, error } = await this.client
      .from('cloud_bookmarks')
      .select('bookmark_data, checksum, last_modified, version')
      .eq('user_id', this.userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        throw this.createNotFoundError('No bookmarks found for user');
      }
      throw new Error(`Supabase error: ${error.message}`);
    }

    // Reconstruct BookmarkFile from stored data
    return {
      version: '1.0',
      schemaVersion: 1,
      metadata: {
        lastModified: data.last_modified,
        lastSyncedBy: 'supabase-cloud',
        checksum: data.checksum,
      },
      bookmarks: data.bookmark_data,
    };
  }

  /**
   * Writes bookmark data to Supabase
   * @param {BookmarkFile} data
   * @returns {Promise<void>}
   */
  async write(data) {
    if (!this.client) {
      throw new Error('Supabase client not configured');
    }

    if (!this.userId) {
      throw this.createUnauthorizedError('User not authenticated');
    }

    // Update checksum
    const checksum = await generateChecksum(data);
    const lastModified = new Date().toISOString();

    const { error } = await this.client.from('cloud_bookmarks').upsert(
      {
        user_id: this.userId,
        bookmark_data: data.bookmarks,
        checksum,
        last_modified: lastModified,
        version: (await this.getCurrentVersion()) + 1,
      },
      {
        onConflict: 'user_id',
      }
    );

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    // Update the data object with new metadata
    data.metadata.checksum = checksum;
    data.metadata.lastModified = lastModified;
  }

  /**
   * Gets the current version number
   * @returns {Promise<number>}
   */
  async getCurrentVersion() {
    if (!this.client || !this.userId) return 0;

    const { data } = await this.client
      .from('cloud_bookmarks')
      .select('version')
      .eq('user_id', this.userId)
      .single();

    return data?.version ?? 0;
  }

  /**
   * Gets the checksum without reading full data
   * @returns {Promise<string>}
   */
  async getChecksum() {
    if (!this.client || !this.userId) return '';

    const { data } = await this.client
      .from('cloud_bookmarks')
      .select('checksum')
      .eq('user_id', this.userId)
      .single();

    return data?.checksum ?? '';
  }

  /**
   * Validates credentials by checking Supabase session
   * @returns {Promise<boolean>}
   */
  async validateCredentials() {
    if (!this.client) return false;

    try {
      const {
        data: { user },
      } = await this.client.auth.getUser();
      return Boolean(user);
    } catch {
      return false;
    }
  }

  /**
   * Checks if the source is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return this.validateCredentials();
  }

  /**
   * Gets metadata about the cloud storage
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    const base = await super.getMetadata();

    if (!this.client || !this.userId) {
      return base;
    }

    try {
      const { data } = await this.client
        .from('cloud_bookmarks')
        .select('last_modified, version')
        .eq('user_id', this.userId)
        .single();

      if (data) {
        return {
          ...base,
          lastModified: data.last_modified,
          version: data.version,
        };
      }
    } catch {
      // Return base metadata if no data exists
    }

    return base;
  }

  /**
   * Deletes all bookmark data for the user
   * @returns {Promise<void>}
   */
  async deleteAll() {
    if (!this.client || !this.userId) {
      throw new Error('Not authenticated');
    }

    const { error } = await this.client.from('cloud_bookmarks').delete().eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to delete bookmarks: ${error.message}`);
    }
  }

  // ==========================================
  // Device Management
  // ==========================================

  /**
   * Registers or updates the current device
   * @param {string} browser - Browser type (chrome, firefox, etc.)
   * @returns {Promise<Device>}
   */
  async registerDevice(browser) {
    if (!this.client || !this.userId || !this.deviceId) {
      throw new Error('Not authenticated or device not configured');
    }

    const { data, error } = await this.client
      .from('devices')
      .upsert(
        {
          id: this.deviceId,
          user_id: this.userId,
          name: this.deviceName || `${browser} Device`,
          browser,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to register device: ${error.message}`);
    }

    return data;
  }

  /**
   * Gets all devices for the user
   * @returns {Promise<Device[]>}
   */
  async getDevices() {
    if (!this.client || !this.userId) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await this.client
      .from('devices')
      .select('*')
      .eq('user_id', this.userId)
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get devices: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Removes a device
   * @param {string} deviceId - Device ID to remove
   * @returns {Promise<void>}
   */
  async removeDevice(deviceId) {
    if (!this.client || !this.userId) {
      throw new Error('Not authenticated');
    }

    const { error } = await this.client
      .from('devices')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(`Failed to remove device: ${error.message}`);
    }

    // Also remove sync state for this device
    await this.client
      .from('sync_state')
      .delete()
      .eq('device_id', deviceId)
      .eq('user_id', this.userId);
  }

  /**
   * Updates device last seen timestamp
   * @returns {Promise<void>}
   */
  async updateDeviceActivity() {
    if (!this.client || !this.userId || !this.deviceId) return;

    await this.client
      .from('devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', this.deviceId)
      .eq('user_id', this.userId);
  }

  // ==========================================
  // Sync State Management
  // ==========================================

  /**
   * Gets the sync state for the current device
   * @returns {Promise<SyncState|null>}
   */
  async getSyncState() {
    if (!this.client || !this.userId || !this.deviceId) {
      return null;
    }

    const { data, error } = await this.client
      .from('sync_state')
      .select('*')
      .eq('user_id', this.userId)
      .eq('device_id', this.deviceId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Updates the sync state for the current device
   * @param {string} checksum - Current checksum
   * @param {number} version - Current version
   * @returns {Promise<void>}
   */
  async updateSyncState(checksum, version) {
    if (!this.client || !this.userId || !this.deviceId) {
      throw new Error('Not authenticated or device not configured');
    }

    const { error } = await this.client.from('sync_state').upsert(
      {
        user_id: this.userId,
        device_id: this.deviceId,
        last_sync_at: new Date().toISOString(),
        checksum,
        version,
      },
      { onConflict: 'user_id,device_id' }
    );

    if (error) {
      throw new Error(`Failed to update sync state: ${error.message}`);
    }
  }

  /**
   * Gets sync states for all devices
   * @returns {Promise<SyncState[]>}
   */
  async getAllSyncStates() {
    if (!this.client || !this.userId) {
      return [];
    }

    const { data, error } = await this.client
      .from('sync_state')
      .select(
        `
        *,
        devices (name, browser)
      `
      )
      .eq('user_id', this.userId);

    if (error) return [];
    return data || [];
  }

  /**
   * Checks if any other device has newer changes
   * @returns {Promise<{hasNewerChanges: boolean, latestVersion: number, latestChecksum: string}>}
   */
  async checkForNewerChanges() {
    if (!this.client || !this.userId || !this.deviceId) {
      return { hasNewerChanges: false, latestVersion: 0, latestChecksum: '' };
    }

    // Get current cloud version
    const { data: cloudData } = await this.client
      .from('cloud_bookmarks')
      .select('version, checksum')
      .eq('user_id', this.userId)
      .single();

    if (!cloudData) {
      return { hasNewerChanges: false, latestVersion: 0, latestChecksum: '' };
    }

    // Get this device's last sync state
    const syncState = await this.getSyncState();
    const lastSyncedVersion = syncState?.version ?? 0;

    return {
      hasNewerChanges: cloudData.version > lastSyncedVersion,
      latestVersion: cloudData.version,
      latestChecksum: cloudData.checksum,
    };
  }

  /**
   * Performs a sync operation with conflict detection
   * @param {BookmarkFile} localData - Local bookmark data
   * @returns {Promise<{action: string, data: BookmarkFile|null, conflict: boolean}>}
   */
  async syncWithConflictDetection(localData) {
    // Check subscription first
    const hasSubscription = await this.hasActiveSubscription();
    if (!hasSubscription) {
      throw new Error('Active subscription required for cloud sync');
    }

    const { hasNewerChanges, latestVersion, latestChecksum } = await this.checkForNewerChanges();
    const localChecksum = await generateChecksum(localData);

    // No remote data exists - push local
    if (latestVersion === 0) {
      await this.write(localData);
      await this.updateSyncState(localChecksum, 1);
      return { action: 'pushed', data: localData, conflict: false };
    }

    // Local and remote are the same
    if (localChecksum === latestChecksum) {
      await this.updateSyncState(localChecksum, latestVersion);
      return { action: 'none', data: null, conflict: false };
    }

    // Remote has newer changes and local hasn't changed since last sync
    const syncState = await this.getSyncState();
    if (hasNewerChanges && syncState?.checksum === localChecksum) {
      const remoteData = await this.read();
      await this.updateSyncState(latestChecksum, latestVersion);
      return { action: 'pulled', data: remoteData, conflict: false };
    }

    // Both have changes - conflict
    if (hasNewerChanges) {
      const remoteData = await this.read();
      return {
        action: 'conflict',
        data: remoteData,
        conflict: true,
      };
    }

    // Only local has changes - push
    await this.write(localData);
    const newVersion = latestVersion + 1;
    await this.updateSyncState(localChecksum, newVersion);
    return { action: 'pushed', data: localData, conflict: false };
  }

  /**
   * Resolves a conflict by choosing a winner
   * @param {'local'|'remote'|'merge'} resolution - Resolution strategy
   * @param {BookmarkFile} localData - Local data
   * @param {BookmarkFile} remoteData - Remote data
   * @param {BookmarkFile} [mergedData] - Merged data (if resolution is 'merge')
   * @returns {Promise<BookmarkFile>}
   */
  async resolveConflict(resolution, localData, remoteData, mergedData) {
    let finalData;

    switch (resolution) {
      case 'local':
        finalData = localData;
        break;
      case 'remote':
        finalData = remoteData;
        break;
      case 'merge':
        if (!mergedData) {
          throw new Error('Merged data required for merge resolution');
        }
        finalData = mergedData;
        break;
      default:
        throw new Error(`Unknown resolution strategy: ${resolution}`);
    }

    await this.write(finalData);
    const checksum = await generateChecksum(finalData);
    const version = await this.getCurrentVersion();
    await this.updateSyncState(checksum, version);

    return finalData;
  }
}

/**
 * Creates a Supabase Cloud source with the provided client
 * @param {Object} supabaseClient - Initialized Supabase client
 * @param {string} userId - User ID
 * @param {string} [deviceId] - Device ID
 * @param {string} [deviceName] - Device name
 * @returns {SupabaseCloudSource}
 */
export const createSupabaseCloudSource = (supabaseClient, userId, deviceId, deviceName) => {
  const source = new SupabaseCloudSource({
    type: SOURCE_TYPE.SUPABASE_CLOUD,
    name: 'MarkSyncr Cloud',
  });

  source.setClient(supabaseClient);
  source.setUserId(userId);

  if (deviceId) {
    source.setDevice(deviceId, deviceName || 'Unknown Device');
  }

  return source;
};

/**
 * Generates a unique device ID
 * @returns {string}
 */
export const generateDeviceId = () => {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Gets or creates a device ID from storage
 * @param {Object} storage - Browser storage API (chrome.storage.local or similar)
 * @returns {Promise<string>}
 */
export const getOrCreateDeviceId = async (storage) => {
  const result = await storage.get('deviceId');

  if (result.deviceId) {
    return result.deviceId;
  }

  const deviceId = generateDeviceId();
  await storage.set({ deviceId });
  return deviceId;
};
