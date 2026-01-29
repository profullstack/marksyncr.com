/**
 * @fileoverview Tests for token refresh alarm and session preservation behavior
 *
 * Verifies that:
 * 1. A dedicated token refresh alarm is created (every 50 minutes)
 * 2. The alarm proactively refreshes the access token via extension_token
 * 3. Temporary failures (503, network errors) do NOT destroy the extension_token
 * 4. Only definitive 401 (session revoked/expired) clears the session
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser API
const mockBrowser = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  bookmarks: {
    getTree: vi.fn(),
    onCreated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    onChanged: { addListener: vi.fn() },
    onMoved: { addListener: vi.fn() },
  },
  alarms: {
    clear: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    onAlarm: { addListener: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    id: 'test-extension-id',
  },
  notifications: {
    create: vi.fn(),
  },
};

vi.mock('webextension-polyfill', () => ({
  default: mockBrowser,
}));

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock navigator for browser detection
Object.defineProperty(global, 'navigator', {
  value: {
    get userAgent() {
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
    },
  },
  writable: true,
  configurable: true,
});

/**
 * Helper: get the alarm handler registered by the background script.
 * After importing the module, the onAlarm.addListener mock captures the handler.
 */
function getAlarmHandler() {
  const calls = mockBrowser.alarms.onAlarm.addListener.mock.calls;
  if (calls.length === 0) return null;
  return calls[calls.length - 1][0]; // last registered handler
}

describe('Token Refresh Alarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();

    // Default: no existing alarms
    mockBrowser.alarms.get.mockResolvedValue(null);
    mockBrowser.alarms.getAll.mockResolvedValue([]);
    // Default: storage returns empty
    mockBrowser.storage.local.get.mockResolvedValue({});
    mockBrowser.storage.local.set.mockResolvedValue(undefined);
    mockBrowser.storage.local.remove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Alarm Registration', () => {
    it('should register a token refresh alarm named marksyncr-token-refresh', async () => {
      vi.resetModules();
      await import('../src/background/index.js');

      // The alarm.create should have been called for the token refresh alarm
      const createCalls = mockBrowser.alarms.create.mock.calls;
      const tokenRefreshCall = createCalls.find(
        (call) => call[0] === 'marksyncr-token-refresh'
      );

      expect(tokenRefreshCall).toBeDefined();
      expect(tokenRefreshCall[1]).toEqual(
        expect.objectContaining({
          periodInMinutes: 50,
          delayInMinutes: 50,
        })
      );
    });

    it('should not recreate alarm if it already exists', async () => {
      mockBrowser.alarms.get.mockImplementation(async (name) => {
        if (name === 'marksyncr-token-refresh') {
          return { name: 'marksyncr-token-refresh', periodInMinutes: 50 };
        }
        return null;
      });

      vi.resetModules();
      await import('../src/background/index.js');

      const createCalls = mockBrowser.alarms.create.mock.calls;
      const tokenRefreshCreated = createCalls.some(
        (call) => call[0] === 'marksyncr-token-refresh'
      );

      expect(tokenRefreshCreated).toBe(false);
    });
  });

  describe('Alarm Handler', () => {
    it('should call extension refresh endpoint when token refresh alarm fires', async () => {
      const session = {
        extension_token: 'ext-token-123',
        access_token: 'old-access-token',
        access_token_expires_at: new Date(Date.now() - 60000).toISOString(),
      };

      mockBrowser.storage.local.get.mockResolvedValue({ session, settings: {} });

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {
            access_token: 'new-access-token',
            access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        }),
      });

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      expect(alarmHandler).toBeTypeOf('function');

      await alarmHandler({ name: 'marksyncr-token-refresh' });

      const refreshCalls = global.fetch.mock.calls.filter((call) =>
        call[0]?.includes('/api/auth/extension/refresh')
      );
      expect(refreshCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should skip refresh when no extension token is stored', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({ settings: {} });

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      expect(alarmHandler).toBeTypeOf('function');

      await alarmHandler({ name: 'marksyncr-token-refresh' });

      const refreshCalls = global.fetch.mock.calls.filter((call) =>
        call[0]?.includes('/api/auth/extension/refresh')
      );
      expect(refreshCalls).toHaveLength(0);
    });

    it('should NOT clear session when refresh fails with 503', async () => {
      const session = {
        extension_token: 'ext-token-123',
        access_token: 'old-access-token',
      };

      mockBrowser.storage.local.get.mockResolvedValue({ session, settings: {} });

      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      });

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      await alarmHandler({ name: 'marksyncr-token-refresh' });

      expect(mockBrowser.storage.local.remove).not.toHaveBeenCalled();
    });

    it('should NOT clear session when refresh fails with network error', async () => {
      const session = {
        extension_token: 'ext-token-123',
        access_token: 'old-access-token',
      };

      mockBrowser.storage.local.get.mockResolvedValue({ session, settings: {} });

      global.fetch.mockRejectedValue(new Error('Failed to fetch'));

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      await alarmHandler({ name: 'marksyncr-token-refresh' });

      expect(mockBrowser.storage.local.remove).not.toHaveBeenCalled();
    });

    it('should clear session when refresh returns 401 (session revoked)', async () => {
      const session = {
        extension_token: 'ext-token-123',
        access_token: 'old-access-token',
      };

      mockBrowser.storage.local.get.mockResolvedValue({ session, settings: {} });

      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Extension session revoked' }),
      });

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      await alarmHandler({ name: 'marksyncr-token-refresh' });

      expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith([
        'session',
        'user',
        'isLoggedIn',
      ]);
    });

    it('should update stored session with new access token on successful refresh', async () => {
      const session = {
        extension_token: 'ext-token-123',
        access_token: 'old-access-token',
      };

      mockBrowser.storage.local.get.mockResolvedValue({ session, settings: {} });

      const newExpiresAt = new Date(Date.now() + 3600000).toISOString();
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {
            access_token: 'new-access-token',
            access_token_expires_at: newExpiresAt,
          },
        }),
      });

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      await alarmHandler({ name: 'marksyncr-token-refresh' });

      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        session: expect.objectContaining({
          extension_token: 'ext-token-123',
          access_token: 'new-access-token',
          access_token_expires_at: newExpiresAt,
        }),
      });
    });
  });

  describe('Session Preservation in ensureValidToken', () => {
    it('should not destroy extension_token when token validation and refresh both fail temporarily', async () => {
      const session = {
        extension_token: 'ext-token-123',
        access_token: 'maybe-valid-token',
        access_token_expires_at: new Date(Date.now() - 60000).toISOString(),
      };

      mockBrowser.storage.local.get.mockResolvedValue({
        session,
        settings: { autoSync: true, syncInterval: 5 },
        selectedSource: 'supabase-cloud',
        sources: [{ id: 'supabase-cloud', type: 'supabase-cloud', connected: true }],
      });

      // All API calls fail with 503
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      });

      vi.resetModules();
      await import('../src/background/index.js');

      const alarmHandler = getAlarmHandler();
      await alarmHandler({ name: 'marksyncr-auto-sync' });

      const removeCalls = mockBrowser.storage.local.remove.mock.calls;
      const sessionCleared = removeCalls.some(
        (call) => Array.isArray(call[0]) && call[0].includes('session')
      );
      expect(sessionCleared).toBe(false);
    });
  });
});
