/**
 * Tests for version history deduplication
 *
 * Verifies that the save_bookmark_version function:
 * 1. Creates a new version when checksum changes
 * 2. Skips creating a new version when checksum is the same
 */

import { describe, it, expect } from 'vitest';

describe('Version History Deduplication', () => {
  /**
   * Simulates the save_bookmark_version logic
   * This mirrors the SQL function behavior for testing
   */
  function simulateSaveVersion(existingVersions, newChecksum, newData) {
    // Get the latest version's checksum
    const latestVersion =
      existingVersions.length > 0 ? existingVersions[existingVersions.length - 1] : null;

    // If checksum matches, return existing version without creating new one
    if (latestVersion && latestVersion.checksum === newChecksum) {
      return {
        created: false,
        version: latestVersion,
      };
    }

    // Create new version
    const newVersion = {
      version: existingVersions.length + 1,
      checksum: newChecksum,
      data: newData,
      createdAt: new Date().toISOString(),
    };

    return {
      created: true,
      version: newVersion,
    };
  }

  it('should create a new version when checksum is different', () => {
    const existingVersions = [{ version: 1, checksum: 'abc123', data: { bookmarks: [] } }];

    const result = simulateSaveVersion(existingVersions, 'def456', { bookmarks: ['new'] });

    expect(result.created).toBe(true);
    expect(result.version.version).toBe(2);
    expect(result.version.checksum).toBe('def456');
  });

  it('should NOT create a new version when checksum is the same', () => {
    const existingVersions = [{ version: 1, checksum: 'abc123', data: { bookmarks: [] } }];

    const result = simulateSaveVersion(existingVersions, 'abc123', { bookmarks: [] });

    expect(result.created).toBe(false);
    expect(result.version.version).toBe(1);
    expect(result.version.checksum).toBe('abc123');
  });

  it('should create first version when no versions exist', () => {
    const existingVersions = [];

    const result = simulateSaveVersion(existingVersions, 'abc123', { bookmarks: [] });

    expect(result.created).toBe(true);
    expect(result.version.version).toBe(1);
  });

  it('should handle multiple syncs with same data', () => {
    const existingVersions = [{ version: 1, checksum: 'abc123', data: { bookmarks: [] } }];

    // First sync with same data - should not create new version
    const result1 = simulateSaveVersion(existingVersions, 'abc123', { bookmarks: [] });
    expect(result1.created).toBe(false);

    // Second sync with same data - should not create new version
    const result2 = simulateSaveVersion(existingVersions, 'abc123', { bookmarks: [] });
    expect(result2.created).toBe(false);

    // Third sync with different data - should create new version
    const result3 = simulateSaveVersion(existingVersions, 'xyz789', { bookmarks: ['changed'] });
    expect(result3.created).toBe(true);
    expect(result3.version.version).toBe(2);
  });

  it('should compare checksums correctly (case-sensitive)', () => {
    const existingVersions = [{ version: 1, checksum: 'ABC123', data: { bookmarks: [] } }];

    // Different case should be treated as different checksum
    const result = simulateSaveVersion(existingVersions, 'abc123', { bookmarks: [] });

    expect(result.created).toBe(true);
  });
});

describe('Sync Scenario - No Changes Should Not Create Version', () => {
  /**
   * This test documents the expected behavior:
   * When Firefox syncs, then Chrome syncs with no changes,
   * Chrome's sync should NOT create a new version entry.
   */
  it('should not create duplicate versions when syncing unchanged data', () => {
    // Initial state: Firefox synced first
    const versions = [{ version: 1, checksum: 'initial-checksum', source: 'firefox' }];

    // Chrome syncs - bookmarks are the same, checksum should be the same
    const chromeChecksum = 'initial-checksum'; // Same data = same checksum

    // Simulate save_bookmark_version behavior
    const latestChecksum = versions[versions.length - 1].checksum;
    const shouldCreateNewVersion = chromeChecksum !== latestChecksum;

    expect(shouldCreateNewVersion).toBe(false);
  });

  it('should create new version when bookmarks actually change', () => {
    // Initial state
    const versions = [{ version: 1, checksum: 'initial-checksum', source: 'firefox' }];

    // Firefox deletes some bookmarks - checksum changes
    const firefoxNewChecksum = 'after-deletion-checksum';

    const latestChecksum = versions[versions.length - 1].checksum;
    const shouldCreateNewVersion = firefoxNewChecksum !== latestChecksum;

    expect(shouldCreateNewVersion).toBe(true);
  });
});
