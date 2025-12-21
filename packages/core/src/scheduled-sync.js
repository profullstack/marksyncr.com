/**
 * @fileoverview Scheduled sync module for Pro users
 * Provides sync scheduling, interval management, and background sync logic
 */

/**
 * Standard sync intervals in minutes
 * @type {Object}
 */
export const SYNC_INTERVALS = {
  FIVE_MINUTES: 5,
  FIFTEEN_MINUTES: 15,
  THIRTY_MINUTES: 30,
  ONE_HOUR: 60,
  SIX_HOURS: 360,
  DAILY: 1440,
};

/**
 * Valid sync interval values
 * @type {number[]}
 */
const VALID_INTERVALS = Object.values(SYNC_INTERVALS);

/**
 * Maximum sync history entries to keep per source
 * @type {number}
 */
const MAX_HISTORY_SIZE = 100;

/**
 * Generates a unique ID for sync jobs
 * @returns {string}
 */
const generateJobId = () => {
  return `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Creates a new sync schedule configuration
 * @param {Object} options - Schedule options
 * @param {boolean} [options.enabled=false] - Whether schedule is enabled
 * @param {number} [options.intervalMinutes=15] - Sync interval in minutes
 * @param {number} [options.lastSync=null] - Last sync timestamp
 * @returns {Object} - Sync schedule object
 */
export const createSyncSchedule = (options = {}) => {
  const { enabled = false, intervalMinutes = 15, lastSync = null } = options;

  const now = Date.now();
  const nextSync = enabled ? now + intervalMinutes * 60 * 1000 : null;

  return {
    enabled,
    intervalMinutes,
    lastSync,
    nextSync,
    createdAt: now,
    updatedAt: now,
  };
};

/**
 * Validates if an interval is a valid sync interval
 * @param {*} interval - Interval to validate
 * @returns {boolean}
 */
export const validateSyncInterval = (interval) => {
  if (typeof interval !== 'number') {
    return false;
  }
  return VALID_INTERVALS.includes(interval);
};

/**
 * Calculates the next sync time based on interval
 * @param {number} intervalMinutes - Interval in minutes
 * @param {number} [fromTime=Date.now()] - Base time for calculation
 * @returns {number} - Next sync timestamp
 */
export const getNextSyncTime = (intervalMinutes, fromTime = Date.now()) => {
  return fromTime + intervalMinutes * 60 * 1000;
};

/**
 * Determines if a sync should be executed based on schedule
 * @param {Object} schedule - Sync schedule object
 * @returns {boolean}
 */
export const shouldSync = (schedule) => {
  if (!schedule || !schedule.enabled) {
    return false;
  }

  if (!schedule.nextSync) {
    return false;
  }

  return Date.now() >= schedule.nextSync;
};

/**
 * Formats a sync interval for display
 * @param {number} intervalMinutes - Interval in minutes
 * @returns {string}
 */
export const formatSyncInterval = (intervalMinutes) => {
  if (!intervalMinutes || intervalMinutes === 0) {
    return 'Manual';
  }

  if (intervalMinutes === 1440) {
    return 'Daily';
  }

  if (intervalMinutes >= 60) {
    const hours = intervalMinutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  return `${intervalMinutes} minutes`;
};

/**
 * Parses a sync interval string to minutes
 * @param {string|number} interval - Interval string or number
 * @returns {number}
 */
export const parseSyncInterval = (interval) => {
  if (typeof interval === 'number') {
    return VALID_INTERVALS.includes(interval) ? interval : 0;
  }

  if (typeof interval !== 'string') {
    return 0;
  }

  const lower = interval.toLowerCase();

  if (lower === 'daily') {
    return 1440;
  }

  if (lower.includes('hour')) {
    const match = lower.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10) * 60;
    }
  }

  if (lower.includes('minute')) {
    const match = lower.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return 0;
};

/**
 * Calculates sync statistics from history
 * @param {Array} syncHistory - Array of sync history entries
 * @returns {Object} - Sync statistics
 */
export const calculateSyncStats = (syncHistory) => {
  if (!syncHistory || syncHistory.length === 0) {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      successRate: 0,
      avgDuration: 0,
      lastSyncTime: null,
    };
  }

  const totalSyncs = syncHistory.length;
  const successfulSyncs = syncHistory.filter((s) => s.success).length;
  const failedSyncs = totalSyncs - successfulSyncs;
  const successRate = (successfulSyncs / totalSyncs) * 100;

  const totalDuration = syncHistory.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgDuration = totalDuration / totalSyncs;

  // Find most recent sync
  const sortedHistory = [...syncHistory].sort((a, b) => b.timestamp - a.timestamp);
  const lastSyncTime = sortedHistory[0]?.timestamp || null;

  return {
    totalSyncs,
    successfulSyncs,
    failedSyncs,
    successRate,
    avgDuration,
    lastSyncTime,
  };
};

/**
 * Creates a sync job object
 * @param {string} sourceId - Source ID for the sync
 * @param {Object} [options={}] - Additional job options
 * @returns {Object} - Sync job object
 */
export const createSyncJob = (sourceId, options = {}) => {
  return {
    id: generateJobId(),
    sourceId,
    status: 'pending',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    error: null,
    ...options,
  };
};

/**
 * Sync scheduler class for managing multiple sync schedules
 */
export class SyncScheduler {
  constructor() {
    this.schedules = {};
    this.history = {};
  }

  /**
   * Gets all schedules
   * @returns {Object}
   */
  getSchedules() {
    return { ...this.schedules };
  }

  /**
   * Gets a specific schedule
   * @param {string} sourceId - Source ID
   * @returns {Object|undefined}
   */
  getSchedule(sourceId) {
    return this.schedules[sourceId];
  }

  /**
   * Adds a new schedule
   * @param {string} sourceId - Source ID
   * @param {Object} options - Schedule options
   */
  addSchedule(sourceId, options) {
    this.schedules[sourceId] = createSyncSchedule(options);
    this.history[sourceId] = [];
  }

  /**
   * Updates an existing schedule
   * @param {string} sourceId - Source ID
   * @param {Object} updates - Schedule updates
   */
  updateSchedule(sourceId, updates) {
    if (!this.schedules[sourceId]) {
      return;
    }

    const current = this.schedules[sourceId];
    this.schedules[sourceId] = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };

    // Recalculate next sync if interval changed
    if (updates.intervalMinutes && this.schedules[sourceId].enabled) {
      this.schedules[sourceId].nextSync = getNextSyncTime(
        updates.intervalMinutes,
        this.schedules[sourceId].lastSync || Date.now()
      );
    }
  }

  /**
   * Removes a schedule
   * @param {string} sourceId - Source ID
   */
  removeSchedule(sourceId) {
    delete this.schedules[sourceId];
    delete this.history[sourceId];
  }

  /**
   * Enables a schedule
   * @param {string} sourceId - Source ID
   */
  enableSchedule(sourceId) {
    if (!this.schedules[sourceId]) {
      return;
    }

    const schedule = this.schedules[sourceId];
    schedule.enabled = true;
    schedule.nextSync = getNextSyncTime(schedule.intervalMinutes, schedule.lastSync || Date.now());
    schedule.updatedAt = Date.now();
  }

  /**
   * Disables a schedule
   * @param {string} sourceId - Source ID
   */
  disableSchedule(sourceId) {
    if (!this.schedules[sourceId]) {
      return;
    }

    this.schedules[sourceId].enabled = false;
    this.schedules[sourceId].nextSync = null;
    this.schedules[sourceId].updatedAt = Date.now();
  }

  /**
   * Gets all source IDs with pending syncs
   * @returns {string[]}
   */
  getPendingSyncs() {
    return Object.entries(this.schedules)
      .filter(([, schedule]) => shouldSync(schedule))
      .map(([sourceId]) => sourceId);
  }

  /**
   * Marks a sync as completed and updates schedule
   * @param {string} sourceId - Source ID
   */
  markSyncCompleted(sourceId) {
    if (!this.schedules[sourceId]) {
      return;
    }

    const now = Date.now();
    const schedule = this.schedules[sourceId];

    schedule.lastSync = now;
    schedule.nextSync = schedule.enabled ? getNextSyncTime(schedule.intervalMinutes, now) : null;
    schedule.updatedAt = now;
  }

  /**
   * Records a sync in history
   * @param {string} sourceId - Source ID
   * @param {Object} result - Sync result
   */
  recordSync(sourceId, result) {
    if (!this.history[sourceId]) {
      this.history[sourceId] = [];
    }

    this.history[sourceId].unshift({
      timestamp: Date.now(),
      ...result,
    });

    // Limit history size
    if (this.history[sourceId].length > MAX_HISTORY_SIZE) {
      this.history[sourceId] = this.history[sourceId].slice(0, MAX_HISTORY_SIZE);
    }
  }

  /**
   * Gets sync history for a source
   * @param {string} sourceId - Source ID
   * @returns {Array}
   */
  getSyncHistory(sourceId) {
    return this.history[sourceId] || [];
  }

  /**
   * Serializes scheduler state for storage
   * @returns {string}
   */
  serialize() {
    return JSON.stringify({
      schedules: this.schedules,
      history: this.history,
    });
  }

  /**
   * Deserializes scheduler state from storage
   * @param {string} data - Serialized state
   */
  deserialize(data) {
    try {
      const parsed = JSON.parse(data);
      this.schedules = parsed.schedules || {};
      this.history = parsed.history || {};
    } catch {
      this.schedules = {};
      this.history = {};
    }
  }
}

export default {
  SYNC_INTERVALS,
  createSyncSchedule,
  validateSyncInterval,
  getNextSyncTime,
  shouldSync,
  formatSyncInterval,
  parseSyncInterval,
  calculateSyncStats,
  createSyncJob,
  SyncScheduler,
};
