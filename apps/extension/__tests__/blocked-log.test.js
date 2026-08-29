/**
 * Tests for the Shield blocked-request log — resolving declarativeNetRequest
 * rule ids back to the domains they blocked, and reporting them per tab.
 * @module __tests__/blocked-log.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBrowser, dnrRef, listenersRef } = vi.hoisted(() => {
  const dnrRef = { matched: [], throws: null, hasGetMatchedRules: true, hasDebugEvent: false };
  const listenersRef = { ruleMatched: [], tabRemoved: [], tabUpdated: [] };

  const mockBrowser = {
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    tabs: {
      onRemoved: { addListener: vi.fn((fn) => listenersRef.tabRemoved.push(fn)) },
      onUpdated: { addListener: vi.fn((fn) => listenersRef.tabUpdated.push(fn)) },
    },
    declarativeNetRequest: {
      getMatchedRules: vi.fn(async () => {
        if (dnrRef.throws) throw new Error(dnrRef.throws);
        return { rulesMatchedInfo: dnrRef.matched };
      }),
    },
  };
  return { mockBrowser, dnrRef, listenersRef };
});

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

// The generated ruleset index + label files, served through fetch().
const RULES_INDEX = {
  lists: {
    ads: { startId: 1, count: 3, labels: 'rules/ads.labels.txt' },
    privacy: { startId: 1_000_000, count: 2, labels: 'rules/privacy.labels.txt' },
  },
};
const ADS_LABELS = ['doubleclick.net', 'taboola.com', 'criteo.com'].join('\n');
const PRIVACY_LABELS = ['google-analytics.com', 'hotjar.com'].join('\n');

globalThis.fetch = vi.fn(async (url) => {
  if (url.endsWith('rules/index.json')) {
    return { ok: true, status: 200, json: async () => RULES_INDEX };
  }
  if (url.endsWith('rules/ads.labels.txt')) {
    return { ok: true, status: 200, text: async () => ADS_LABELS };
  }
  if (url.endsWith('rules/privacy.labels.txt')) {
    return { ok: true, status: 200, text: async () => PRIVACY_LABELS };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
});

/** Fresh module instance per test — the module caches labels and tab state. */
async function loadModule() {
  vi.resetModules();
  return import('../src/background/blocked-log.js');
}

/** Shorthand for a getMatchedRules entry. */
const match = (rulesetId, ruleId, timeStamp = 1000) => ({
  rule: { rulesetId, ruleId },
  tabId: 7,
  timeStamp,
});

beforeEach(() => {
  globalThis.fetch.mockClear();
  dnrRef.matched = [];
  dnrRef.throws = null;
  listenersRef.ruleMatched = [];
  listenersRef.tabRemoved = [];
  listenersRef.tabUpdated = [];
  mockBrowser.declarativeNetRequest.getMatchedRules = vi.fn(async () => {
    if (dnrRef.throws) throw new Error(dnrRef.throws);
    return { rulesMatchedInfo: dnrRef.matched };
  });
  delete mockBrowser.declarativeNetRequest.onRuleMatchedDebug;
});

describe('labelForRule — rule id to blocked domain', () => {
  it('maps the first rule of a ruleset to its first label', async () => {
    const { labelForRule } = await loadModule();
    expect(await labelForRule('ads', 1)).toBe('doubleclick.net');
  });

  it('maps by offset from the ruleset start id', async () => {
    const { labelForRule } = await loadModule();
    expect(await labelForRule('ads', 3)).toBe('criteo.com');
    expect(await labelForRule('privacy', 1_000_001)).toBe('hotjar.com');
  });

  it('returns empty for an unknown ruleset or an out-of-range id', async () => {
    const { labelForRule } = await loadModule();
    expect(await labelForRule('nope', 1)).toBe('');
    expect(await labelForRule('ads', 999)).toBe('');
  });

  it('fetches each label file only once', async () => {
    const { labelForRule } = await loadModule();
    await labelForRule('ads', 1);
    await labelForRule('ads', 2);
    await labelForRule('ads', 3);
    const adsFetches = globalThis.fetch.mock.calls.filter((c) =>
      String(c[0]).endsWith('ads.labels.txt')
    );
    expect(adsFetches).toHaveLength(1);
  });
});

describe('getBlockedRequests — per-tab report', () => {
  it('aggregates repeated hits on one domain into a single counted row', async () => {
    const { getBlockedRequests } = await loadModule();
    dnrRef.matched = [match('ads', 1), match('ads', 1, 2000), match('ads', 2)];

    const res = await getBlockedRequests(7);

    expect(res.success).toBe(true);
    expect(res.supported).toBe(true);
    expect(res.source).toBe('matched-rules');
    expect(res.total).toBe(3);
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0]).toMatchObject({
      label: 'doubleclick.net',
      list: 'ads',
      count: 2,
      lastAt: 2000,
    });
    expect(res.entries[1]).toMatchObject({ label: 'taboola.com', count: 1 });
  });

  it('labels rows with the list they came from', async () => {
    const { getBlockedRequests } = await loadModule();
    dnrRef.matched = [match('privacy', 1_000_000), match('ads', 1)];

    const res = await getBlockedRequests(7);
    const byLabel = Object.fromEntries(res.entries.map((e) => [e.label, e.list]));
    expect(byLabel['google-analytics.com']).toBe('privacy');
    expect(byLabel['doubleclick.net']).toBe('ads');
  });

  it('ignores dynamic allowlist matches, which are allows and not blocks', async () => {
    const { getBlockedRequests } = await loadModule();
    dnrRef.matched = [match('_dynamic', 1), match('ads', 1)];

    const res = await getBlockedRequests(7);
    expect(res.total).toBe(1);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].label).toBe('doubleclick.net');
  });

  it('falls back to the rule id when a label cannot be resolved', async () => {
    const { getBlockedRequests } = await loadModule();
    dnrRef.matched = [match('ads', 4242)];

    const res = await getBlockedRequests(7);
    expect(res.entries[0].label).toBe('rule #4242');
  });

  it('reports an empty page cleanly', async () => {
    const { getBlockedRequests } = await loadModule();
    const res = await getBlockedRequests(7);
    expect(res).toMatchObject({ success: true, supported: true, total: 0 });
    expect(res.entries).toEqual([]);
  });

  it('requires a tab id', async () => {
    const { getBlockedRequests } = await loadModule();
    expect(await getBlockedRequests(undefined)).toMatchObject({ success: false });
  });

  it('degrades to unsupported when the permission is missing', async () => {
    const { getBlockedRequests } = await loadModule();
    dnrRef.throws = 'No permission for tab';

    const res = await getBlockedRequests(7);
    expect(res.success).toBe(true);
    expect(res.supported).toBe(false);
    expect(res.entries).toEqual([]);
    expect(res.error).toMatch(/No permission/);
  });

  it('degrades to unsupported when the browser has no getMatchedRules', async () => {
    delete mockBrowser.declarativeNetRequest.getMatchedRules;
    const { getBlockedRequests } = await loadModule();

    const res = await getBlockedRequests(7);
    expect(res.supported).toBe(false);
    expect(res.entries).toEqual([]);
  });
});

describe('debug log — real URLs when onRuleMatchedDebug is available', () => {
  const debugMatch = (url, tabId = 7, rulesetId = 'ads') => ({
    rule: { rulesetId, ruleId: 1 },
    request: { url, tabId },
  });

  it('prefers recorded URLs over the rule-id report', async () => {
    const { recordDebugMatch, getBlockedRequests } = await loadModule();
    await recordDebugMatch(debugMatch('https://ads.doubleclick.net/a.js'));
    await recordDebugMatch(debugMatch('https://ads.doubleclick.net/b.js'));

    const res = await getBlockedRequests(7);
    expect(res.source).toBe('debug');
    expect(res.total).toBe(2);
    expect(res.entries[0].label).toBe('ads.doubleclick.net');
    expect(res.entries[0].urls).toEqual([
      'https://ads.doubleclick.net/a.js',
      'https://ads.doubleclick.net/b.js',
    ]);
  });

  it('keeps tabs separate', async () => {
    const { recordDebugMatch, getBlockedRequests } = await loadModule();
    await recordDebugMatch(debugMatch('https://ads.doubleclick.net/a.js', 7));
    await recordDebugMatch(debugMatch('https://taboola.com/b.js', 9));

    expect((await getBlockedRequests(7)).entries[0].label).toBe('ads.doubleclick.net');
    expect((await getBlockedRequests(9)).entries[0].label).toBe('taboola.com');
  });

  it('ignores matches with no tab (background requests)', async () => {
    const { recordDebugMatch, getBlockedRequests } = await loadModule();
    await recordDebugMatch(debugMatch('https://ads.doubleclick.net/a.js', -1));
    expect((await getBlockedRequests(7)).total).toBe(0);
  });

  it('clears a tab on navigation so the report matches the page on screen', async () => {
    const { recordDebugMatch, getBlockedRequests, initBlockedLog } = await loadModule();
    mockBrowser.declarativeNetRequest.onRuleMatchedDebug = {
      addListener: vi.fn((fn) => listenersRef.ruleMatched.push(fn)),
    };
    initBlockedLog();

    await recordDebugMatch(debugMatch('https://ads.doubleclick.net/a.js', 7));
    expect((await getBlockedRequests(7)).total).toBe(1);

    for (const fn of listenersRef.tabUpdated) fn(7, { status: 'loading' });
    expect((await getBlockedRequests(7)).total).toBe(0);
  });

  it('clearBlockedRequests drops a tab', async () => {
    const { recordDebugMatch, getBlockedRequests, clearBlockedRequests } = await loadModule();
    await recordDebugMatch(debugMatch('https://ads.doubleclick.net/a.js', 7));
    clearBlockedRequests(7);
    expect((await getBlockedRequests(7)).total).toBe(0);
  });

  it('caps the per-tab history so a long-lived tab cannot grow without bound', async () => {
    const { recordDebugMatch, getBlockedRequests } = await loadModule();
    for (let i = 0; i < 300; i++) {
      await recordDebugMatch(debugMatch(`https://ads.doubleclick.net/${i}.js`, 7));
    }
    expect((await getBlockedRequests(7)).total).toBe(250);
  });
});

describe('initBlockedLog', () => {
  it('is a no-op where the debug event does not exist (packaged builds)', async () => {
    const { initBlockedLog } = await loadModule();
    expect(() => initBlockedLog()).not.toThrow();
  });

  it('subscribes to the debug event when it is available', async () => {
    const { initBlockedLog } = await loadModule();
    const addListener = vi.fn();
    mockBrowser.declarativeNetRequest.onRuleMatchedDebug = { addListener };
    initBlockedLog();
    expect(addListener).toHaveBeenCalledOnce();
  });
});
