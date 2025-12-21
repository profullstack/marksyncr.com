import { describe, it, expect } from 'vitest';
import {
  SYNC_STATUS,
  CHANGE_TYPE,
  CONFLICT_RESOLUTION,
  createSyncState,
  createSyncResult,
  createErrorSyncResult,
} from '../src/sync.js';

describe('sync types', () => {
  describe('constants', () => {
    it('should have correct SYNC_STATUS values', () => {
      expect(SYNC_STATUS.PENDING).toBe('pending');
      expect(SYNC_STATUS.SYNCING).toBe('syncing');
      expect(SYNC_STATUS.SUCCESS).toBe('success');
      expect(SYNC_STATUS.ERROR).toBe('error');
      expect(SYNC_STATUS.CONFLICT).toBe('conflict');
    });

    it('should have correct CHANGE_TYPE values', () => {
      expect(CHANGE_TYPE.ADDED).toBe('added');
      expect(CHANGE_TYPE.MODIFIED).toBe('modified');
      expect(CHANGE_TYPE.DELETED).toBe('deleted');
      expect(CHANGE_TYPE.MOVED).toBe('moved');
    });

    it('should have correct CONFLICT_RESOLUTION values', () => {
      expect(CONFLICT_RESOLUTION.LOCAL).toBe('local');
      expect(CONFLICT_RESOLUTION.REMOTE).toBe('remote');
      expect(CONFLICT_RESOLUTION.MERGED).toBe('merged');
    });
  });

  describe('createSyncState', () => {
    it('should create a sync state with required fields', () => {
      const state = createSyncState({
        deviceId: 'device-123',
        sourceType: 'github',
        sourcePath: 'user/repo/bookmarks.json',
      });

      expect(state.deviceId).toBe('device-123');
      expect(state.sourceType).toBe('github');
      expect(state.sourcePath).toBe('user/repo/bookmarks.json');
    });

    it('should initialize with empty checksum', () => {
      const state = createSyncState({
        deviceId: 'device-123',
        sourceType: 'local',
        sourcePath: '/path/to/file',
      });

      expect(state.lastChecksum).toBe('');
    });

    it('should set lastSyncAt to current timestamp', () => {
      const before = new Date().toISOString();
      const state = createSyncState({
        deviceId: 'device-123',
        sourceType: 'local',
        sourcePath: '/path/to/file',
      });
      const after = new Date().toISOString();

      expect(state.lastSyncAt >= before).toBe(true);
      expect(state.lastSyncAt <= after).toBe(true);
    });

    it('should initialize with empty metadata object', () => {
      const state = createSyncState({
        deviceId: 'device-123',
        sourceType: 'local',
        sourcePath: '/path/to/file',
      });

      expect(state.metadata).toEqual({});
    });
  });

  describe('createSyncResult', () => {
    it('should create a default success result', () => {
      const result = createSyncResult();

      expect(result.status).toBe(SYNC_STATUS.SUCCESS);
      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
      expect(result.conflicts).toEqual([]);
      expect(result.newChecksum).toBe('');
    });

    it('should allow overriding default values', () => {
      const result = createSyncResult({
        pushed: 5,
        pulled: 3,
        newChecksum: 'abc123',
      });

      expect(result.pushed).toBe(5);
      expect(result.pulled).toBe(3);
      expect(result.newChecksum).toBe('abc123');
    });

    it('should set timestamp to current time', () => {
      const before = new Date().toISOString();
      const result = createSyncResult();
      const after = new Date().toISOString();

      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });

    it('should allow setting conflicts', () => {
      const conflicts = [
        {
          id: 'bookmark-1',
          localChange: { id: 'bookmark-1', type: 'modified' },
          remoteChange: { id: 'bookmark-1', type: 'modified' },
        },
      ];
      const result = createSyncResult({ conflicts });

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].id).toBe('bookmark-1');
    });
  });

  describe('createErrorSyncResult', () => {
    it('should create an error result with message', () => {
      const result = createErrorSyncResult('Network connection failed');

      expect(result.status).toBe(SYNC_STATUS.ERROR);
      expect(result.error).toBe('Network connection failed');
    });

    it('should have zero pushed and pulled counts', () => {
      const result = createErrorSyncResult('Error');

      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
    });

    it('should have empty conflicts array', () => {
      const result = createErrorSyncResult('Error');

      expect(result.conflicts).toEqual([]);
    });

    it('should have empty checksum', () => {
      const result = createErrorSyncResult('Error');

      expect(result.newChecksum).toBe('');
    });

    it('should set timestamp to current time', () => {
      const before = new Date().toISOString();
      const result = createErrorSyncResult('Error');
      const after = new Date().toISOString();

      expect(result.timestamp >= before).toBe(true);
      expect(result.timestamp <= after).toBe(true);
    });
  });
});
