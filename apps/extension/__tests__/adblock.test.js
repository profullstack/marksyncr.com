/**
 * Tests for the MarkSyncr adblocker (declarativeNetRequest ruleset management)
 * @module __tests__/adblock.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// A stateful mock of the WebExtension APIs the adblock module touches.
const { mockBrowser, storeRef } = vi.hoisted(() => {
  const storeRef = { data: {} };
  const mockBrowser = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (typeof key === 'string') {
            return key in storeRef.data ? { [key]: storeRef.data[key] } : {};
          }
          return { ...storeRef.data };
        }),
        set: vi.fn(async (obj) => {
          Object.assign(storeRef.data, obj);
        }),
      },
    },
    declarativeNetRequest: {
      updateEnabledRulesets: vi.fn(async () => {}),
      setExtensionActionOptions: vi.fn(async () => {}),
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
    },
  };
  return { mockBrowser, storeRef };
});

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

import {
  getAdblockPrefs,
  applyAdblock,
  getAdblockStatus,
  setAdblockEnabled,
  setAdblockList,
  initAdblock,
  RULE_COUNTS,
} from '../src/background/adblock.js';

const TOTAL = RULE_COUNTS.ads + RULE_COUNTS.privacy;

/** Extract the {enableRulesetIds, disableRulesetIds} of the most recent apply call. */
function lastRulesetCall() {
  const calls = mockBrowser.declarativeNetRequest.updateEnabledRulesets.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  storeRef.data = {};
  vi.clearAllMocks();
});

describe('adblock preferences', () => {
  it('defaults to fully enabled when storage is empty', async () => {
    const prefs = await getAdblockPrefs();
    expect(prefs).toEqual({ enabled: true, lists: { ads: true, privacy: true } });
  });

  it('merges stored partial preferences over the defaults', async () => {
    storeRef.data.adblock = { enabled: false, lists: { ads: false } };
    const prefs = await getAdblockPrefs();
    expect(prefs).toEqual({ enabled: false, lists: { ads: false, privacy: true } });
  });
});

describe('applyAdblock', () => {
  it('enables both rulesets when master + both lists are on', async () => {
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: true } });
    const call = lastRulesetCall();
    expect(call.enableRulesetIds.sort()).toEqual(['ads', 'privacy']);
    expect(call.disableRulesetIds).toEqual([]);
  });

  it('disables every ruleset when the master switch is off, regardless of lists', async () => {
    await applyAdblock({ enabled: false, lists: { ads: true, privacy: true } });
    const call = lastRulesetCall();
    expect(call.enableRulesetIds).toEqual([]);
    expect(call.disableRulesetIds.sort()).toEqual(['ads', 'privacy']);
  });

  it('disables only the list that is turned off', async () => {
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: false } });
    const call = lastRulesetCall();
    expect(call.enableRulesetIds).toEqual(['ads']);
    expect(call.disableRulesetIds).toEqual(['privacy']);
  });

  it('shows the badge count when enabled and hides + clears it when disabled', async () => {
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: true } });
    expect(mockBrowser.declarativeNetRequest.setExtensionActionOptions).toHaveBeenCalledWith({
      displayActionCountAsBadge: true,
    });
    expect(mockBrowser.action.setBadgeText).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await applyAdblock({ enabled: false, lists: { ads: true, privacy: true } });
    expect(mockBrowser.declarativeNetRequest.setExtensionActionOptions).toHaveBeenCalledWith({
      displayActionCountAsBadge: false,
    });
    expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('does not throw when the badge API is unavailable', async () => {
    const saved = mockBrowser.declarativeNetRequest.setExtensionActionOptions;
    delete mockBrowser.declarativeNetRequest.setExtensionActionOptions;
    await expect(
      applyAdblock({ enabled: true, lists: { ads: true, privacy: true } })
    ).resolves.toBeUndefined();
    mockBrowser.declarativeNetRequest.setExtensionActionOptions = saved;
  });
});

describe('getAdblockStatus', () => {
  it('reports the combined active rule count when everything is on', async () => {
    const status = await getAdblockStatus();
    expect(status.success).toBe(true);
    expect(status.enabled).toBe(true);
    expect(status.activeRules).toBe(TOTAL);
    expect(status.counts).toEqual(RULE_COUNTS);
  });

  it('reports zero active rules when the blocker is off', async () => {
    storeRef.data.adblock = { enabled: false, lists: { ads: true, privacy: true } };
    const status = await getAdblockStatus();
    expect(status.activeRules).toBe(0);
  });

  it('counts only enabled lists', async () => {
    storeRef.data.adblock = { enabled: true, lists: { ads: true, privacy: false } };
    const status = await getAdblockStatus();
    expect(status.activeRules).toBe(RULE_COUNTS.ads);
  });
});

describe('setAdblockEnabled', () => {
  it('persists the master switch, applies it, and returns fresh status', async () => {
    const status = await setAdblockEnabled(false);

    expect(storeRef.data.adblock.enabled).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.activeRules).toBe(0);

    const call = lastRulesetCall();
    expect(call.disableRulesetIds.sort()).toEqual(['ads', 'privacy']);
  });

  it('re-enables after being turned off', async () => {
    await setAdblockEnabled(false);
    const status = await setAdblockEnabled(true);
    expect(status.enabled).toBe(true);
    expect(status.activeRules).toBe(TOTAL);
  });
});

describe('setAdblockList', () => {
  it('toggles a single list off and keeps the other on', async () => {
    const status = await setAdblockList('privacy', false);
    expect(storeRef.data.adblock.lists).toEqual({ ads: true, privacy: false });
    expect(status.lists.privacy).toBe(false);
    expect(status.activeRules).toBe(RULE_COUNTS.ads);
  });

  it('rejects an unknown list without touching storage', async () => {
    const result = await setAdblockList('bogus', false);
    expect(result.success).toBe(false);
    expect(storeRef.data.adblock).toBeUndefined();
    expect(mockBrowser.declarativeNetRequest.updateEnabledRulesets).not.toHaveBeenCalled();
  });
});

describe('initAdblock', () => {
  it('applies the stored preference so live rulesets match it', async () => {
    storeRef.data.adblock = { enabled: true, lists: { ads: false, privacy: true } };
    await initAdblock();
    const call = lastRulesetCall();
    expect(call.enableRulesetIds).toEqual(['privacy']);
    expect(call.disableRulesetIds).toEqual(['ads']);
  });
});
