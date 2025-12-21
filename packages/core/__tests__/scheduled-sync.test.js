/**
 * @fileoverview Tests for scheduled sync module
 * Tests sync scheduling, interval management, and background sync logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
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
} from '../src/scheduled-sync.js';

describe('Scheduled Sync Module', () => {
  describe('SYNC_INTERVALS', () => {
    it('should define standard sync intervals', () => {
      expect(SYNC_INTERVALS).toHaveProperty('FIVE_MINUTES');
      expect(SYNC_INTERVALS).toHaveProperty('FIFTEEN_MINUTES');
      expect(SYNC_INTERVALS).toHaveProperty('THIRTY_MINUTES');
      expect(SYNC_INTERVALS).toHaveProperty('ONE_HOUR');
      expect(SYNC_INTERVALS).toHaveProperty('SIX_HOURS');
      expect(SYNC_INTERVALS).toHaveProperty('DAILY');
    });

    it('should have correct minute values', () => {
      expect(SYNC_INTERVALS.FIVE_MINUTES).toBe(5);
      expect(SYNC_INTERVALS.FIFTEEN_MINUTES).toBe(15);
      expect(SYNC_INTERVALS.THIRTY_MINUTES).toBe(30);
      expect(SYNC_INTERVALS.ONE_HOUR).toBe(60);
      expect(SYNC_INTERVALS.SIX_HOURS).toBe(360);
      expect(SYNC_INTERVALS.DAILY).toBe(1440);
    });
  });

  describe('createSyncSchedule', () => {
    it('should create a sync schedule with default values', () => {
      const schedule = createSyncSchedule();
      expect(schedule).toHaveProperty('enabled');
      expect(schedule).toHaveProperty('intervalMinutes');
      expect(schedule).toHaveProperty('lastSync');
      expect(schedule).toHaveProperty('nextSync');
    });

    it('should create a schedule with custom interval', () => {
      const schedule = createSyncSchedule({ intervalMinutes: 30 });
      expect(schedule.intervalMinutes).toBe(30);
    });

    it('should set enabled to false by default', () => {
      const schedule = createSyncSchedule();
      expect(schedule.enabled).toBe(false);
    });

    it('should allow enabling schedule', () => {
      const schedule = createSyncSchedule({ enabled: true, intervalMinutes: 15 });
      expect(schedule.enabled).toBe(true);
    });

    it('should calculate next sync time when enabled', () => {
      const schedule = createSyncSchedule({ enabled: true, intervalMinutes: 15 });
      expect(schedule.nextSync).toBeDefined();
      expect(schedule.nextSync).toBeGreaterThan(Date.now());
    });
  });

  describe('validateSyncInterval', () => {
    it('should accept valid intervals', () => {
      expect(validateSyncInterval(5)).toBe(true);
      expect(validateSyncInterval(15)).toBe(true);
      expect(validateSyncInterval(30)).toBe(true);
      expect(validateSyncInterval(60)).toBe(true);
      expect(validateSyncInterval(360)).toBe(true);
      expect(validateSyncInterval(1440)).toBe(true);
    });

    it('should reject invalid intervals', () => {
      expect(validateSyncInterval(0)).toBe(false);
      expect(validateSyncInterval(-1)).toBe(false);
      expect(validateSyncInterval(3)).toBe(false);
      expect(validateSyncInterval(100)).toBe(false);
    });

    it('should reject non-numeric values', () => {
      expect(validateSyncInterval('15')).toBe(false);
      expect(validateSyncInterval(null)).toBe(false);
      expect(validateSyncInterval(undefined)).toBe(false);
    });
  });

  describe('getNextSyncTime', () => {
    it('should calculate next sync time from now', () => {
      const now = Date.now();
      const nextSync = getNextSyncTime(15, now);
      expect(nextSync).toBe(now + 15 * 60 * 1000);
    });

    it('should calculate next sync time from last sync', () => {
      const lastSync = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const nextSync = getNextSyncTime(15, lastSync);
      expect(nextSync).toBe(lastSync + 15 * 60 * 1000);
    });

    it('should handle daily interval', () => {
      const now = Date.now();
      const nextSync = getNextSyncTime(1440, now);
      expect(nextSync).toBe(now + 24 * 60 * 60 * 1000);
    });
  });

  describe('shouldSync', () => {
    it('should return true when next sync time has passed', () => {
      const schedule = {
        enabled: true,
        nextSync: Date.now() - 1000, // 1 second ago
      };
      expect(shouldSync(schedule)).toBe(true);
    });

    it('should return false when next sync time is in future', () => {
      const schedule = {
        enabled: true,
        nextSync: Date.now() + 60000, // 1 minute from now
      };
      expect(shouldSync(schedule)).toBe(false);
    });

    it('should return false when schedule is disabled', () => {
      const schedule = {
        enabled: false,
        nextSync: Date.now() - 1000,
      };
      expect(shouldSync(schedule)).toBe(false);
    });

    it('should return false when nextSync is not set', () => {
      const schedule = {
        enabled: true,
        nextSync: null,
      };
      expect(shouldSync(schedule)).toBe(false);
    });
  });

  describe('formatSyncInterval', () => {
    it('should format minutes correctly', () => {
      expect(formatSyncInterval(5)).toBe('5 minutes');
      expect(formatSyncInterval(15)).toBe('15 minutes');
      expect(formatSyncInterval(30)).toBe('30 minutes');
    });

    it('should format hours correctly', () => {
      expect(formatSyncInterval(60)).toBe('1 hour');
      expect(formatSyncInterval(360)).toBe('6 hours');
    });

    it('should format daily correctly', () => {
      expect(formatSyncInterval(1440)).toBe('Daily');
    });

    it('should handle edge cases', () => {
      expect(formatSyncInterval(0)).toBe('Manual');
      expect(formatSyncInterval(null)).toBe('Manual');
    });
  });

  describe('parseSyncInterval', () => {
    it('should parse interval strings', () => {
      expect(parseSyncInterval('5 minutes')).toBe(5);
      expect(parseSyncInterval('15 minutes')).toBe(15);
      expect(parseSyncInterval('1 hour')).toBe(60);
      expect(parseSyncInterval('6 hours')).toBe(360);
      expect(parseSyncInterval('Daily')).toBe(1440);
    });

    it('should handle numeric input', () => {
      expect(parseSyncInterval(15)).toBe(15);
      expect(parseSyncInterval(60)).toBe(60);
    });

    it('should return 0 for invalid input', () => {
      expect(parseSyncInterval('invalid')).toBe(0);
      expect(parseSyncInterval(null)).toBe(0);
    });
  });

  describe('calculateSyncStats', () => {
    it('should calculate sync statistics', () => {
      const syncHistory = [
        { timestamp: Date.now() - 3600000, success: true, duration: 1500 },
        { timestamp: Date.now() - 7200000, success: true, duration: 2000 },
        { timestamp: Date.now() - 10800000, success: false, duration: 500 },
      ];

      const stats = calculateSyncStats(syncHistory);
      expect(stats.totalSyncs).toBe(3);
      expect(stats.successfulSyncs).toBe(2);
      expect(stats.failedSyncs).toBe(1);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
      expect(stats.avgDuration).toBeCloseTo(1333.33, 0);
    });

    it('should handle empty history', () => {
      const stats = calculateSyncStats([]);
      expect(stats.totalSyncs).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should calculate last sync time', () => {
      const recentSync = Date.now() - 1800000; // 30 minutes ago
      const syncHistory = [
        { timestamp: recentSync, success: true, duration: 1000 },
        { timestamp: Date.now() - 7200000, success: true, duration: 1000 },
      ];

      const stats = calculateSyncStats(syncHistory);
      expect(stats.lastSyncTime).toBe(recentSync);
    });
  });

  describe('createSyncJob', () => {
    it('should create a sync job object', () => {
      const job = createSyncJob('source-1');
      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('sourceId');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('createdAt');
      expect(job.sourceId).toBe('source-1');
      expect(job.status).toBe('pending');
    });

    it('should generate unique job IDs', () => {
      const job1 = createSyncJob('source-1');
      const job2 = createSyncJob('source-1');
      expect(job1.id).not.toBe(job2.id);
    });

    it('should allow custom options', () => {
      const job = createSyncJob('source-1', { priority: 'high' });
      expect(job.priority).toBe('high');
    });
  });

  describe('SyncScheduler', () => {
    let scheduler;

    beforeEach(() => {
      scheduler = new SyncScheduler();
    });

    it('should initialize with empty schedules', () => {
      expect(scheduler.getSchedules()).toEqual({});
    });

    it('should add a schedule', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      const schedules = scheduler.getSchedules();
      expect(schedules['source-1']).toBeDefined();
      expect(schedules['source-1'].intervalMinutes).toBe(15);
    });

    it('should update a schedule', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      scheduler.updateSchedule('source-1', { intervalMinutes: 30 });
      const schedules = scheduler.getSchedules();
      expect(schedules['source-1'].intervalMinutes).toBe(30);
    });

    it('should remove a schedule', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      scheduler.removeSchedule('source-1');
      const schedules = scheduler.getSchedules();
      expect(schedules['source-1']).toBeUndefined();
    });

    it('should enable a schedule', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: false });
      scheduler.enableSchedule('source-1');
      const schedules = scheduler.getSchedules();
      expect(schedules['source-1'].enabled).toBe(true);
    });

    it('should disable a schedule', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      scheduler.disableSchedule('source-1');
      const schedules = scheduler.getSchedules();
      expect(schedules['source-1'].enabled).toBe(false);
    });

    it('should get pending syncs', () => {
      scheduler.addSchedule('source-1', {
        intervalMinutes: 15,
        enabled: true,
      });
      scheduler.addSchedule('source-2', {
        intervalMinutes: 15,
        enabled: true,
      });

      // Manually set nextSync to simulate past due
      scheduler.schedules['source-1'].nextSync = Date.now() - 1000;
      scheduler.schedules['source-2'].nextSync = Date.now() + 60000;

      const pending = scheduler.getPendingSyncs();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toBe('source-1');
    });

    it('should mark sync as completed', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      // Set nextSync to past to simulate a sync that was due
      scheduler.schedules['source-1'].nextSync = Date.now() - 60000;
      const beforeSync = scheduler.getSchedules()['source-1'].nextSync;

      scheduler.markSyncCompleted('source-1');

      const afterSync = scheduler.getSchedules()['source-1'];
      expect(afterSync.lastSync).toBeDefined();
      expect(afterSync.nextSync).toBeGreaterThan(beforeSync);
    });

    it('should record sync history', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      scheduler.recordSync('source-1', { success: true, duration: 1500 });

      const history = scheduler.getSyncHistory('source-1');
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(true);
    });

    it('should limit sync history size', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });

      // Add more than the limit
      for (let i = 0; i < 150; i++) {
        scheduler.recordSync('source-1', { success: true, duration: 1000 });
      }

      const history = scheduler.getSyncHistory('source-1');
      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('should serialize and deserialize state', () => {
      scheduler.addSchedule('source-1', { intervalMinutes: 15, enabled: true });
      scheduler.addSchedule('source-2', { intervalMinutes: 30, enabled: false });

      const serialized = scheduler.serialize();
      const newScheduler = new SyncScheduler();
      newScheduler.deserialize(serialized);

      const schedules = newScheduler.getSchedules();
      expect(schedules['source-1'].intervalMinutes).toBe(15);
      expect(schedules['source-2'].intervalMinutes).toBe(30);
    });
  });
});
