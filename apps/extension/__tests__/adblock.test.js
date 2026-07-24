/**
 * Tests for the MarkSyncr adblocker (declarativeNetRequest ruleset management,
 * per-site allowlist, and cloud sync)
 * @module __tests__/adblock.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stateful mock of the WebExtension APIs the adblock module touches.
const { mockBrowser, storeRef, dynRef } = vi.hoisted(() => {
  const storeRef = { data: {} };
  const dynRef = { rules: [] };
  const mockBrowser = {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (typeof key === 'string') return key in storeRef.data ? { [key]: storeRef.data[key] } : {};
          return { ...storeRef.data };
        }),
        set: vi.fn(async (obj) => { Object.assign(storeRef.data, obj); }),
      },
    },
    declarativeNetRequest: {
      updateEnabledRulesets: vi.fn(async () => {}),
      setExtensionActionOptions: vi.fn(async () => {}),
      getDynamicRules: vi.fn(async () => dynRef.rules),
      updateDynamicRules: vi.fn(async ({ removeRuleIds = [], addRules = [] }) => {
        dynRef.rules = dynRef.rules.filter((r) => !removeRuleIds.includes(r.id)).concat(addRules);
      }),
    },
    action: { setBadgeText: vi.fn(async () => {}) },
  };
  return { mockBrowser, storeRef, dynRef };
});

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

// Mock the cloud API — default: signed out (fetch returns null).
const { cloudRef } = vi.hoisted(() => ({ cloudRef: { settings: null } }));
vi.mock('../src/lib/api.js', () => ({
  fetchCloudSettings: vi.fn(async () => cloudRef.settings),
  saveCloudSettings: vi.fn(async () => true),
}));
import { fetchCloudSettings, saveCloudSettings } from '../src/lib/api.js';

import {
  getAdblockPrefs, applyAdblock, getAdblockStatus, setAdblockEnabled, setAdblockList,
  addAllowlistDomain, removeAllowlistDomain, normalizeDomain, initAdblock,
  pullAdblockFromCloud, pushAdblockToCloud, RULE_COUNTS,
} from '../src/background/adblock.js';

const TOTAL = RULE_COUNTS.ads + RULE_COUNTS.privacy;
const lastEnabledCall = () => {
  const c = mockBrowser.declarativeNetRequest.updateEnabledRulesets.mock.calls;
  return c[c.length - 1][0];
};

beforeEach(() => {
  storeRef.data = {};
  dynRef.rules = [];
  cloudRef.settings = null;
  vi.clearAllMocks();
});

describe('normalizeDomain', () => {
  it.each([
    ['https://www.Example.com/path?q=1', 'example.com'],
    ['http://sub.example.co.uk:8080/', 'sub.example.co.uk'],
    ['WWW.Foo.COM', 'foo.com'],
    ['example.org', 'example.org'],
  ])('%s -> %s', (input, out) => {
    expect(normalizeDomain(input)).toBe(out);
  });
});

describe('preferences', () => {
  it('defaults to fully enabled with an empty allowlist', async () => {
    expect(await getAdblockPrefs()).toEqual({
      enabled: true, lists: { ads: true, privacy: true }, allowlist: [],
    });
  });

  it('merges stored partial preferences over defaults', async () => {
    storeRef.data.adblock = { enabled: false, lists: { ads: false }, allowlist: ['a.com'] };
    expect(await getAdblockPrefs()).toEqual({
      enabled: false, lists: { ads: false, privacy: true }, allowlist: ['a.com'],
    });
  });
});

describe('applyAdblock — static rulesets', () => {
  it('enables both when master + both lists on', async () => {
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: true }, allowlist: [] });
    const c = lastEnabledCall();
    expect(c.enableRulesetIds.sort()).toEqual(['ads', 'privacy']);
    expect(c.disableRulesetIds).toEqual([]);
  });

  it('disables all when master off', async () => {
    await applyAdblock({ enabled: false, lists: { ads: true, privacy: true }, allowlist: [] });
    const c = lastEnabledCall();
    expect(c.enableRulesetIds).toEqual([]);
    expect(c.disableRulesetIds.sort()).toEqual(['ads', 'privacy']);
  });
});

describe('applyAdblock — allowlist dynamic rules', () => {
  it('installs a priority-2 allow rule per allowlisted domain when enabled', async () => {
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: true }, allowlist: ['a.com', 'b.org'] });
    expect(dynRef.rules).toHaveLength(2);
    for (const r of dynRef.rules) {
      expect(r.priority).toBe(2);
      expect(r.action).toEqual({ type: 'allow' });
    }
    expect(dynRef.rules.map((r) => r.condition.initiatorDomains[0]).sort()).toEqual(['a.com', 'b.org']);
  });

  it('installs no allow rules when the blocker is off', async () => {
    await applyAdblock({ enabled: false, lists: { ads: true, privacy: true }, allowlist: ['a.com'] });
    expect(dynRef.rules).toHaveLength(0);
  });

  it('replaces prior dynamic rules rather than accumulating', async () => {
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: true }, allowlist: ['a.com'] });
    await applyAdblock({ enabled: true, lists: { ads: true, privacy: true }, allowlist: ['b.com'] });
    expect(dynRef.rules.map((r) => r.condition.initiatorDomains[0])).toEqual(['b.com']);
  });
});

describe('addAllowlistDomain / removeAllowlistDomain', () => {
  it('normalizes and persists an added site, installing its allow rule', async () => {
    const status = await addAllowlistDomain('https://www.Trusted.com/page');
    expect(status.allowlist).toEqual(['trusted.com']);
    expect(storeRef.data.adblock.allowlist).toEqual(['trusted.com']);
    expect(dynRef.rules[0].condition.initiatorDomains).toEqual(['trusted.com']);
  });

  it('does not add duplicates', async () => {
    await addAllowlistDomain('trusted.com');
    const status = await addAllowlistDomain('www.trusted.com');
    expect(status.allowlist).toEqual(['trusted.com']);
  });

  it('removes a site and clears its allow rule', async () => {
    await addAllowlistDomain('trusted.com');
    const status = await removeAllowlistDomain('www.trusted.com');
    expect(status.allowlist).toEqual([]);
    expect(dynRef.rules).toHaveLength(0);
  });

  it('rejects an empty/invalid domain', async () => {
    expect((await addAllowlistDomain('')).success).toBe(false);
  });
});

describe('getAdblockStatus', () => {
  it('reports combined active rules + allowlist', async () => {
    storeRef.data.adblock = { enabled: true, lists: { ads: true, privacy: true }, allowlist: ['x.com'] };
    const s = await getAdblockStatus();
    expect(s.activeRules).toBe(TOTAL);
    expect(s.allowlist).toEqual(['x.com']);
  });

  it('reports zero active rules when off', async () => {
    storeRef.data.adblock = { enabled: false, lists: { ads: true, privacy: true }, allowlist: [] };
    expect((await getAdblockStatus()).activeRules).toBe(0);
  });
});

describe('toggles', () => {
  it('setAdblockEnabled(false) persists + disables', async () => {
    const s = await setAdblockEnabled(false);
    expect(storeRef.data.adblock.enabled).toBe(false);
    expect(s.activeRules).toBe(0);
  });

  it('setAdblockList counts only enabled lists', async () => {
    const s = await setAdblockList('privacy', false);
    expect(s.activeRules).toBe(RULE_COUNTS.ads);
  });

  it('setAdblockList rejects unknown list', async () => {
    expect((await setAdblockList('bogus', false)).success).toBe(false);
  });
});

describe('cloud sync', () => {
  it('pull returns null when signed out', async () => {
    cloudRef.settings = null; // fetch -> null
    expect(await pullAdblockFromCloud()).toBeNull();
  });

  it('pull returns stored adblock prefs from the settings blob', async () => {
    cloudRef.settings = { settings: { theme: 'dark', adblock: { enabled: false, lists: { ads: false }, allowlist: ['z.com'] } } };
    expect(await pullAdblockFromCloud()).toEqual({
      enabled: false, lists: { ads: false, privacy: true }, allowlist: ['z.com'],
    });
  });

  it('push merges adblock into the existing blob without clobbering other keys', async () => {
    cloudRef.settings = { settings: { theme: 'dark', syncEnabled: true } };
    const prefs = { enabled: true, lists: { ads: true, privacy: false }, allowlist: [] };
    await pushAdblockToCloud(prefs);
    expect(saveCloudSettings).toHaveBeenCalledWith({
      settings: { theme: 'dark', syncEnabled: true, adblock: prefs },
    });
  });

  it('push is a no-op when signed out', async () => {
    cloudRef.settings = null;
    expect(await pushAdblockToCloud({ enabled: true, lists: { ads: true, privacy: true }, allowlist: [] })).toBe(false);
    expect(saveCloudSettings).not.toHaveBeenCalled();
  });

  it('a local toggle pushes to the cloud', async () => {
    cloudRef.settings = { settings: {} };
    await setAdblockEnabled(false);
    // commit() fires pushAdblockToCloud (fire-and-forget) — allow the microtask to flush
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchCloudSettings).toHaveBeenCalled();
  });

  it('initAdblock adopts cloud prefs when present', async () => {
    cloudRef.settings = { settings: { adblock: { enabled: true, lists: { ads: false, privacy: true }, allowlist: [] } } };
    await initAdblock();
    await Promise.resolve();
    await Promise.resolve();
    // eventually stored locally from the cloud
    expect(storeRef.data.adblock?.lists?.ads).toBe(false);
  });
});
