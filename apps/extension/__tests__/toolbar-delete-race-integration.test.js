/**
 * Integration test: calls the REAL performSync from background/index.js
 * with fully mocked browser.* and fetch APIs to verify the tombstone
 * race-condition fix.
 *
 * Race condition under test:
 *   1. performSync starts, reads localTombstones = [] (none yet)
 *   2. During sync (between cloud GET and tombstone write), user deletes
 *      a toolbar bookmark → onRemoved fires → addTombstone() writes to storage
 *   3. BUG (before fix): performSync calls storeTombstones(mergedTombstones)
 *      which overwrites the tombstone from step 2 → deletion reverted on next sync
 *   4. FIX: performSync re-reads tombstones from storage before writing,
 *      preserving the concurrent tombstone.
 *
 * This test imports the REAL module code via __test__ exports (only available
 * under VITEST=true) and validates the fix end-to-end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Mock browser API (webextension-polyfill) – must be before module import
// ---------------------------------------------------------------------------

// In-memory storage backing (survives across async ticks within a test)
let storageData = {};

// Captured listener callbacks — set by addListener mocks
const capturedListeners = {
  onCreated: null,
  onRemoved: null,
  onChanged: null,
  onMoved: null,
  onAlarm: null,
  onMessage: null,
  onInstalled: null,
  onStartup: null,
};

// Track bookmarks.create calls so we can assert the deleted bookmark is NOT re-added
let bookmarksCreated = [];

// The mock bookmark tree returned by browser.bookmarks.getTree()
// This is mutable so we can update it mid-sync (e.g., after a deletion)
let mockBookmarkTree = [];

const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        if (typeof keys === 'string') {
          return { [keys]: storageData[keys] };
        }
        if (Array.isArray(keys)) {
          const result = {};
          for (const k of keys) result[k] = storageData[k];
          return result;
        }
        // Object with defaults
        if (typeof keys === 'object' && keys !== null) {
          const result = {};
          for (const k of Object.keys(keys)) {
            result[k] = storageData[k] !== undefined ? storageData[k] : keys[k];
          }
          return result;
        }
        return { ...storageData };
      }),
      set: vi.fn(async (obj) => {
        Object.assign(storageData, obj);
      }),
      remove: vi.fn(async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete storageData[k];
      }),
    },
  },
  bookmarks: {
    getTree: vi.fn(async () => mockBookmarkTree),
    create: vi.fn(async (props) => {
      const bm = { id: `created-${Date.now()}-${Math.random()}`, ...props };
      bookmarksCreated.push(bm);
      return bm;
    }),
    remove: vi.fn(async () => {}),
    update: vi.fn(async (id, changes) => ({ id, ...changes })),
    move: vi.fn(async (id, dest) => ({ id, ...dest })),
    getChildren: vi.fn(async () => []),
    onCreated: {
      addListener: vi.fn((cb) => {
        capturedListeners.onCreated = cb;
      }),
    },
    onRemoved: {
      addListener: vi.fn((cb) => {
        capturedListeners.onRemoved = cb;
      }),
    },
    onChanged: {
      addListener: vi.fn((cb) => {
        capturedListeners.onChanged = cb;
      }),
    },
    onMoved: {
      addListener: vi.fn((cb) => {
        capturedListeners.onMoved = cb;
      }),
    },
  },
  alarms: {
    clear: vi.fn(async () => true),
    create: vi.fn(),
    get: vi.fn(async () => null),
    onAlarm: {
      addListener: vi.fn((cb) => {
        capturedListeners.onAlarm = cb;
      }),
    },
  },
  runtime: {
    onMessage: {
      addListener: vi.fn((cb) => {
        capturedListeners.onMessage = cb;
      }),
    },
    onInstalled: {
      addListener: vi.fn((cb) => {
        capturedListeners.onInstalled = cb;
      }),
    },
    onStartup: {
      addListener: vi.fn((cb) => {
        capturedListeners.onStartup = cb;
      }),
    },
    id: 'test-extension-id',
  },
};

vi.mock('webextension-polyfill', () => ({
  default: mockBrowser,
}));

// ---------------------------------------------------------------------------
// 2. Mock global.fetch — routes requests to handlers
//    (the actual fetch mock is installed in beforeEach via installFetchRouter)
// ---------------------------------------------------------------------------
let fetchHandlers = {};

// Install initial router so initialize() on first import can use fetch
global.fetch = vi.fn(async (url, opts) => {
  for (const [pattern, handler] of Object.entries(fetchHandlers)) {
    if (url.includes(pattern)) {
      return handler(url, opts);
    }
  }
  return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
});

// ---------------------------------------------------------------------------
// 3. Mock navigator.userAgent for detectBrowser()
// ---------------------------------------------------------------------------
Object.defineProperty(global, 'navigator', {
  value: {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  },
  writable: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// 4. Mock crypto.subtle.digest for generateChecksum()
// ---------------------------------------------------------------------------
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.subtle) {
  global.crypto.subtle = {};
}
global.crypto.subtle.digest = vi.fn(async (_algo, data) => {
  // Return a deterministic hash based on data content
  // (doesn't need to be real SHA-256, just deterministic for the test)
  let hash = 0;
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash * 31 + bytes[i]) | 0;
  }
  const buf = new ArrayBuffer(32);
  const view = new DataView(buf);
  view.setInt32(0, hash);
  view.setInt32(4, hash ^ 0x12345678);
  view.setInt32(8, hash ^ 0x9abcdef0);
  view.setInt32(12, hash ^ 0xdeadbeef);
  return buf;
});

// ---------------------------------------------------------------------------
// 5. Mock TextEncoder (for generateChecksum in Node env)
// ---------------------------------------------------------------------------
if (!global.TextEncoder) {
  global.TextEncoder = class {
    encode(str) {
      return new Uint8Array([...str].map((c) => c.charCodeAt(0)));
    }
  };
}

// ---------------------------------------------------------------------------
// 6. Import the real module (initialize() runs on import, registering listeners)
// ---------------------------------------------------------------------------
let __test__;

// Helper to set up the fetch router (must be called after any mockReset)
function installFetchRouter() {
  global.fetch = vi.fn(async (url, opts) => {
    for (const [pattern, handler] of Object.entries(fetchHandlers)) {
      if (url.includes(pattern)) {
        return handler(url, opts);
      }
    }
    // Default: 404
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    };
  });
}

// Dynamic import so mocks are in place first
beforeEach(async () => {
  // Reset state
  storageData = {};
  bookmarksCreated = [];
  mockBookmarkTree = [];
  fetchHandlers = {};
  installFetchRouter();

  // Import module (cached after first call — initialize() only runs once)
  const mod = await import('../src/background/index.js');
  __test__ = mod.__test__;

  if (!__test__) {
    throw new Error(
      '__test__ exports not available — ensure VITEST env var is set (vitest does this automatically)'
    );
  }

  // Reset module-level state (isSyncInProgress, consecutiveSyncFailures, etc.)
  __test__.resetState();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Helper: build a typical Chrome bookmark tree
// ===========================================================================
function buildBookmarkTree(toolbarBookmarks = [], otherBookmarks = []) {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: 'Bookmarks Bar',
          children: toolbarBookmarks.map((bm, i) => ({
            id: bm.id || `tb-${i}`,
            title: bm.title,
            url: bm.url,
            index: i,
            dateAdded: bm.dateAdded || Date.now() - 86400000,
          })),
        },
        {
          id: '2',
          title: 'Other Bookmarks',
          children: otherBookmarks.map((bm, i) => ({
            id: bm.id || `ob-${i}`,
            title: bm.title,
            url: bm.url,
            index: i,
            dateAdded: bm.dateAdded || Date.now() - 86400000,
          })),
        },
      ],
    },
  ];
}

// ===========================================================================
// Helper: set up storage & fetch for a "normal" sync scenario
// ===========================================================================
function setupSyncScenario({
  localToolbarBookmarks = [],
  localOtherBookmarks = [],
  cloudBookmarks = [],
  cloudTombstones = [],
  cloudChecksum = 'cloud-checksum-abc',
  session = {
    access_token: 'test-token-valid',
    access_token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    extension_token: 'ext-token-valid',
  },
} = {}) {
  // Set up storage: session, sources, selectedSource
  storageData = {
    session,
    sources: [{ id: 'browser-bookmarks', connected: true }],
    selectedSource: 'browser-bookmarks',
    'marksyncr-tombstones': [],
    'marksyncr-last-sync-time': Date.now() - 300000, // 5 minutes ago
    'marksyncr-locally-modified-ids': '[]',
  };

  // Set up bookmark tree
  mockBookmarkTree = buildBookmarkTree(localToolbarBookmarks, localOtherBookmarks);

  // Set up fetch handlers
  fetchHandlers = {
    // Token validation (validateToken calls /api/auth/session)
    '/api/auth/session': async () => ({
      ok: true,
      json: async () => ({ user: { id: 'user-1' } }),
    }),
    // Token refresh via extension_token
    '/api/auth/extension/refresh': async () => ({
      ok: true,
      json: async () => ({
        session: {
          access_token: 'refreshed-token',
          access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      }),
    }),
    // Device registration
    '/api/devices': async () => ({
      ok: true,
      json: async () => ({ device: { id: 'dev-1' } }),
    }),
    // GET /api/bookmarks — cloud data
    '/api/bookmarks': async (_url, opts) => {
      if (opts?.method === 'GET' || !opts?.method) {
        return {
          ok: true,
          json: async () => ({
            bookmarks: cloudBookmarks,
            tombstones: cloudTombstones,
            checksum: cloudChecksum,
            version: 1,
          }),
        };
      }
      // POST /api/bookmarks — push to cloud
      return {
        ok: true,
        json: async () => ({
          synced: 10,
          total: 10,
          checksum: 'new-checksum',
          message: 'Synced',
        }),
      };
    },
    // POST /api/versions
    '/api/versions': async () => ({
      ok: true,
      json: async () => ({ version: { id: 'v1', version: 1 } }),
    }),
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Integration: real performSync with mocked browser APIs', () => {
  describe('basic sync flow', () => {
    it('should complete a sync cycle successfully with the real performSync', async () => {
      const toolbarBms = [
        { id: 'tb-1', title: 'Example', url: 'https://example.com' },
        { id: 'tb-2', title: 'Test', url: 'https://test.com' },
      ];

      setupSyncScenario({
        localToolbarBookmarks: toolbarBms,
        cloudBookmarks: [
          {
            url: 'https://example.com',
            title: 'Example',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
          {
            url: 'https://test.com',
            title: 'Test',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
        ],
      });

      const result = await __test__.performSync();
      expect(result.success).toBe(true);
    });

    it('should call browser.bookmarks.getTree at least once', async () => {
      setupSyncScenario({
        localToolbarBookmarks: [{ id: 'tb-1', title: 'A', url: 'https://a.com' }],
        cloudBookmarks: [
          {
            url: 'https://a.com',
            title: 'A',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
        ],
      });

      await __test__.performSync();
      expect(mockBrowser.bookmarks.getTree).toHaveBeenCalled();
    });

    it('should return error when no source is configured', async () => {
      storageData = { session: { access_token: 'tok' } };
      mockBookmarkTree = buildBookmarkTree();

      const result = await __test__.performSync();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No sync source');
    });
  });

  describe('tombstone race condition (the actual bug)', () => {
    it('should preserve tombstones created by onRemoved during sync', async () => {
      // Setup: one bookmark in toolbar, same bookmark in cloud
      const deletedUrl = 'https://deleted-during-sync.com';
      const keptUrl = 'https://kept.com';

      const toolbarBms = [
        { id: 'tb-del', title: 'Will Delete', url: deletedUrl },
        { id: 'tb-keep', title: 'Keeper', url: keptUrl },
      ];

      setupSyncScenario({
        localToolbarBookmarks: toolbarBms,
        cloudBookmarks: [
          {
            url: deletedUrl,
            title: 'Will Delete',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
          {
            url: keptUrl,
            title: 'Keeper',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
        ],
      });

      // Listeners were registered by initialize() on first import
      const onRemovedCb = capturedListeners.onRemoved;
      expect(onRemovedCb).toBeTruthy();

      // Intercept the cloud GET to simulate a delay.
      // During this delay, we fire onRemoved (user deletes a bookmark).
      let cloudGetResolve;
      const cloudGetPromise = new Promise((resolve) => {
        cloudGetResolve = resolve;
      });

      fetchHandlers['/api/bookmarks'] = async (_url, opts) => {
        if (opts?.method === 'GET' || !opts?.method) {
          // Wait for the test to release us
          await cloudGetPromise;
          return {
            ok: true,
            json: async () => ({
              bookmarks: [
                {
                  url: deletedUrl,
                  title: 'Will Delete',
                  folderPath: 'Bookmarks Bar',
                  dateAdded: Date.now() - 86400000,
                },
                {
                  url: keptUrl,
                  title: 'Keeper',
                  folderPath: 'Bookmarks Bar',
                  dateAdded: Date.now() - 86400000,
                },
              ],
              tombstones: [],
              checksum: 'cloud-check-1',
              version: 1,
            }),
          };
        }
        // POST: push to cloud
        return {
          ok: true,
          json: async () => ({
            synced: 1,
            total: 1,
            checksum: 'cloud-check-2',
            message: 'Synced',
          }),
        };
      };

      // Start performSync (it will block on the cloud GET)
      const syncPromise = __test__.performSync();

      // Wait a tick to let performSync reach the cloud GET
      await new Promise((r) => setTimeout(r, 50));

      // Simulate user deleting the bookmark while sync is blocked
      // This fires the REAL onRemoved handler which calls addTombstone()
      await onRemovedCb('tb-del', {
        node: {
          id: 'tb-del',
          title: 'Will Delete',
          url: deletedUrl,
        },
      });

      // Verify tombstone was written to storage
      const tombstonesAfterDelete = storageData['marksyncr-tombstones'] || [];
      expect(tombstonesAfterDelete.some((t) => t.url === deletedUrl)).toBe(true);

      // Update the bookmark tree to reflect the deletion
      // (the user already deleted the bookmark from the toolbar)
      mockBookmarkTree = buildBookmarkTree([{ id: 'tb-keep', title: 'Keeper', url: keptUrl }], []);

      // Release the cloud GET so performSync continues
      cloudGetResolve();

      // Wait for sync to complete
      const result = await syncPromise;
      expect(result.success).toBe(true);

      // THE CRITICAL ASSERTION: the tombstone for the deleted URL must
      // still be in storage after performSync completes.
      // Before the fix, storeTombstones(mergedTombstones) would overwrite it.
      const tombstonesAfterSync = storageData['marksyncr-tombstones'] || [];
      const preservedTombstone = tombstonesAfterSync.find((t) => t.url === deletedUrl);

      expect(preservedTombstone).toBeTruthy();
      expect(preservedTombstone.url).toBe(deletedUrl);
      expect(preservedTombstone.deletedAt).toBeGreaterThan(0);
    });

    it('should NOT re-add a deleted bookmark from cloud when tombstone is preserved', async () => {
      const deletedUrl = 'https://deleted-bookmark.com';

      setupSyncScenario({
        localToolbarBookmarks: [{ id: 'tb-del', title: 'Deleted One', url: deletedUrl }],
        cloudBookmarks: [
          {
            url: deletedUrl,
            title: 'Deleted One',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
        ],
      });

      // Listeners were registered by initialize() on first import
      const onRemovedCb = capturedListeners.onRemoved;

      // Intercept cloud GET with delay
      let releaseCloudGet;
      const cloudGetBlocked = new Promise((r) => {
        releaseCloudGet = r;
      });

      fetchHandlers['/api/bookmarks'] = async (_url, opts) => {
        if (opts?.method === 'GET' || !opts?.method) {
          await cloudGetBlocked;
          return {
            ok: true,
            json: async () => ({
              bookmarks: [
                {
                  url: deletedUrl,
                  title: 'Deleted One',
                  folderPath: 'Bookmarks Bar',
                  dateAdded: Date.now() - 86400000,
                },
              ],
              tombstones: [],
              checksum: 'c1',
              version: 1,
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ synced: 0, total: 0, checksum: 'c2', message: 'OK' }),
        };
      };

      const syncPromise = __test__.performSync();
      await new Promise((r) => setTimeout(r, 50));

      // User deletes the bookmark mid-sync
      await onRemovedCb('tb-del', {
        node: { id: 'tb-del', title: 'Deleted One', url: deletedUrl },
      });

      // Bookmark tree now has no bookmarks
      mockBookmarkTree = buildBookmarkTree([], []);

      releaseCloudGet();
      const result = await syncPromise;
      expect(result.success).toBe(true);

      // The deleted bookmark should NOT have been re-added by addCloudBookmarksToLocal
      // because categorizeCloudBookmarks should filter it out via the preserved tombstone
      const reAddedDeleted = bookmarksCreated.filter((bm) => bm.url === deletedUrl);
      expect(reAddedDeleted.length).toBe(0);
    });
  });

  describe('tombstone merge correctness', () => {
    it('should merge local and cloud tombstones using the real mergeTombstonesLocal', async () => {
      const url1 = 'https://local-deleted.com';
      const url2 = 'https://cloud-deleted.com';
      const urlBoth = 'https://both-deleted.com';

      // Use recent timestamps so tombstones pass the safeguard filter
      // and don't get cleaned up by cleanupOldTombstones (30 day TTL)
      const now = Date.now();
      const localTs1 = now - 60000; // 1 minute ago
      const localTsBoth = now - 30000; // 30 seconds ago
      const cloudTs2 = now - 45000; // 45 seconds ago
      const cloudTsBoth = now - 10000; // 10 seconds ago (newer than local)

      setupSyncScenario({
        localToolbarBookmarks: [],
        cloudBookmarks: [],
        cloudTombstones: [
          { url: url2, deletedAt: cloudTs2 },
          { url: urlBoth, deletedAt: cloudTsBoth },
        ],
      });

      // Set local tombstones AFTER setupSyncScenario (which clears them)
      storageData['marksyncr-tombstones'] = [
        { url: url1, deletedAt: localTs1 },
        { url: urlBoth, deletedAt: localTsBoth },
      ];

      const result = await __test__.performSync();
      expect(result.success).toBe(true);

      const finalTombstones = storageData['marksyncr-tombstones'] || [];

      // Should have all three URLs
      expect(finalTombstones.find((t) => t.url === url1)).toBeTruthy();
      expect(finalTombstones.find((t) => t.url === url2)).toBeTruthy();

      // For the shared URL, cloud's newer timestamp should win
      const bothEntry = finalTombstones.find((t) => t.url === urlBoth);
      expect(bothEntry).toBeTruthy();
      expect(bothEntry.deletedAt).toBe(cloudTsBoth);
    });
  });

  describe('categorizeCloudBookmarks filters tombstoned URLs', () => {
    it('should not add a cloud bookmark that has a tombstone', async () => {
      const deletedUrl = 'https://already-tombstoned.com';

      // Local has tombstone, no bookmark for this URL
      storageData['marksyncr-tombstones'] = [{ url: deletedUrl, deletedAt: Date.now() }];

      setupSyncScenario({
        localToolbarBookmarks: [],
        cloudBookmarks: [
          {
            url: deletedUrl,
            title: 'Should Not Re-Add',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000, // older than tombstone
          },
        ],
      });

      // Restore tombstones (setupSyncScenario clears them)
      storageData['marksyncr-tombstones'] = [{ url: deletedUrl, deletedAt: Date.now() }];

      const result = await __test__.performSync();
      expect(result.success).toBe(true);

      // The tombstoned URL should not be created locally
      const reAdded = bookmarksCreated.filter((bm) => bm.url === deletedUrl);
      expect(reAdded.length).toBe(0);
    });
  });

  describe('concurrent sync guard', () => {
    it('should reject a second sync while one is in progress', async () => {
      setupSyncScenario({
        localToolbarBookmarks: [{ id: 'tb-1', title: 'A', url: 'https://a.com' }],
        cloudBookmarks: [
          {
            url: 'https://a.com',
            title: 'A',
            folderPath: 'Bookmarks Bar',
            dateAdded: Date.now() - 86400000,
          },
        ],
      });

      // Block cloud GET to keep first sync running
      let releaseFn;
      const blocked = new Promise((r) => {
        releaseFn = r;
      });
      fetchHandlers['/api/bookmarks'] = async (_url, opts) => {
        if (opts?.method === 'GET' || !opts?.method) {
          await blocked;
          return {
            ok: true,
            json: async () => ({
              bookmarks: [
                {
                  url: 'https://a.com',
                  title: 'A',
                  folderPath: 'Bookmarks Bar',
                  dateAdded: Date.now() - 86400000,
                },
              ],
              tombstones: [],
              checksum: 'c1',
              version: 1,
            }),
          };
        }
        return { ok: true, json: async () => ({ synced: 1, checksum: 'c2', message: 'OK' }) };
      };

      const sync1 = __test__.performSync();
      await new Promise((r) => setTimeout(r, 10));

      // Second sync should be rejected
      const sync2Result = await __test__.performSync();
      expect(sync2Result.success).toBe(false);
      expect(sync2Result.error).toContain('already in progress');

      releaseFn();
      const sync1Result = await sync1;
      expect(sync1Result.success).toBe(true);
    });
  });

  describe('state management', () => {
    it('should reset isSyncInProgress after sync completes (even on success)', async () => {
      setupSyncScenario({
        localToolbarBookmarks: [],
        cloudBookmarks: [],
      });

      await __test__.performSync();

      const state = __test__.getState();
      expect(state.isSyncInProgress).toBe(false);
    });

    it('should reset isSyncInProgress after sync fails', async () => {
      setupSyncScenario({});

      // Force a failure by making token validation fail
      fetchHandlers['/api/auth/validate'] = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ valid: false }),
      });
      // Also remove token refresh endpoint to prevent recovery
      fetchHandlers['/api/auth/refresh'] = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: 'refresh failed' }),
      });
      // Remove session to trigger auth failure
      storageData.session = null;

      const result = await __test__.performSync();
      // Sync should fail gracefully (no source / no auth)
      expect(result.success).toBe(false);

      const state = __test__.getState();
      expect(state.isSyncInProgress).toBe(false);
    });
  });

  describe('external sync re-creation defense (Chrome Sync / Firefox Sync)', () => {
    it('should re-delete a bookmark re-created within 30s of tombstone creation', async () => {
      const deletedUrl = 'https://externally-restored.com';

      setupSyncScenario({
        localToolbarBookmarks: [],
        cloudBookmarks: [],
      });

      // Simulate: user deletes a bookmark (tombstone created just now)
      storageData['marksyncr-tombstones'] = [
        { url: deletedUrl, deletedAt: Date.now() - 2000 }, // 2 seconds ago
      ];

      // Listeners were registered by initialize() on first import
      const onCreatedCb = capturedListeners.onCreated;
      expect(onCreatedCb).toBeTruthy();

      // Simulate: Chrome Sync re-creates the bookmark within seconds
      await onCreatedCb('ext-restored-1', {
        id: 'ext-restored-1',
        title: 'Externally Restored',
        url: deletedUrl,
      });

      // The bookmark should have been re-deleted
      expect(mockBrowser.bookmarks.remove).toHaveBeenCalledWith('ext-restored-1');

      // The tombstone should still exist (NOT removed)
      const tombstones = storageData['marksyncr-tombstones'] || [];
      expect(tombstones.find((t) => t.url === deletedUrl)).toBeTruthy();
    });

    it('should allow re-creation of a bookmark if tombstone is old (>30s)', async () => {
      const oldUrl = 'https://intentionally-re-added.com';

      setupSyncScenario({
        localToolbarBookmarks: [],
        cloudBookmarks: [],
      });

      // Tombstone is old (60 seconds ago) — user genuinely re-added the bookmark
      storageData['marksyncr-tombstones'] = [
        { url: oldUrl, deletedAt: Date.now() - 60000 }, // 60 seconds ago
      ];

      const onCreatedCb = capturedListeners.onCreated;

      // Simulate: user manually re-creates the bookmark
      await onCreatedCb('user-readd-1', {
        id: 'user-readd-1',
        title: 'Intentionally Re-Added',
        url: oldUrl,
      });

      // The bookmark should NOT have been re-deleted
      expect(mockBrowser.bookmarks.remove).not.toHaveBeenCalledWith('user-readd-1');

      // The tombstone should have been removed (user intended to re-add)
      const tombstones = storageData['marksyncr-tombstones'] || [];
      expect(tombstones.find((t) => t.url === oldUrl)).toBeFalsy();
    });
  });
});
