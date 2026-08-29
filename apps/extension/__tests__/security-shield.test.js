/**
 * Tests for the Shield's phishing & scam protection — rule construction,
 * dynamic-rule id banding, feed parsing, and the "proceed anyway" bypass.
 * @module __tests__/security-shield.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBrowser, storeRef, dynRef } = vi.hoisted(() => {
  const storeRef = { data: {} };
  const dynRef = { rules: [] };
  const mockBrowser = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    storage: {
      local: {
        get: vi.fn(async (key) =>
          typeof key === 'string'
            ? key in storeRef.data
              ? { [key]: storeRef.data[key] }
              : {}
            : { ...storeRef.data }
        ),
        set: vi.fn(async (obj) => {
          Object.assign(storeRef.data, obj);
        }),
      },
    },
    alarms: { create: vi.fn(async () => {}) },
    declarativeNetRequest: {
      getDynamicRules: vi.fn(async () => dynRef.rules),
      updateDynamicRules: vi.fn(async ({ removeRuleIds = [], addRules = [] }) => {
        dynRef.rules = dynRef.rules
          .filter((r) => !removeRuleIds.includes(r.id))
          .concat(addRules);
      }),
    },
  };
  return { mockBrowser, storeRef, dynRef };
});

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

const { cloudRef } = vi.hoisted(() => ({ cloudRef: { settings: null } }));
vi.mock('../src/lib/api.js', () => ({
  fetchCloudSettings: vi.fn(async () => cloudRef.settings),
  saveCloudSettings: vi.fn(async () => true),
}));

const SEED = ['evil-bank.example', 'scam-shop.example'];
globalThis.fetch = vi.fn(async (url) => {
  if (String(url).endsWith('rules/security-seed.json')) {
    return { ok: true, status: 200, json: async () => ({ domains: SEED }) };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
});

async function loadModule() {
  vi.resetModules();
  return import('../src/background/security-shield.js');
}

beforeEach(() => {
  storeRef.data = {};
  dynRef.rules = [];
  cloudRef.settings = null;
  globalThis.fetch.mockClear();
  mockBrowser.declarativeNetRequest.updateDynamicRules.mockClear();
});

describe('normalizeDomain — feed entries that would break a whole rule', () => {
  it.each([
    ['plain domain', 'Example.COM', 'example.com'],
    ['strips www', 'www.example.com', 'example.com'],
    ['strips wildcard', '*.example.com', 'example.com'],
    ['from a URL', 'https://evil.example.com/login', 'evil.example.com'],
    ['strips port', 'example.com:8080', 'example.com'],
  ])('%s', async (_label, input, expected) => {
    const { normalizeDomain } = await loadModule();
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([
    ['empty', ''],
    ['bare IPv4', '192.168.1.1'],
    ['no dot', 'localhost'],
    ['underscore', 'bad_domain.com'],
    ['space', 'two words.com'],
  ])('rejects %s', async (_label, input) => {
    const { normalizeDomain } = await loadModule();
    expect(normalizeDomain(input)).toBe('');
  });
});

describe('parseFeed', () => {
  it('reads adblock-syntax lists and skips their headers', async () => {
    const { parseFeed } = await loadModule();
    const text = '! Title: list\n! Version: 1\nevil.example\nscam.example\n';
    expect(parseFeed(text, 'adblock')).toEqual(['evil.example', 'scam.example']);
  });

  it('reads hosts format, taking the domain not the IP', async () => {
    const { parseFeed } = await loadModule();
    const text = '# comment\n0.0.0.0 evil.example\n127.0.0.1 www.scam.example\n';
    expect(parseFeed(text, 'hosts')).toEqual(['evil.example', 'scam.example']);
  });

  it('drops entries that would make the browser reject the rule', async () => {
    const { parseFeed } = await loadModule();
    expect(parseFeed('evil.example\n10.0.0.1\nlocalhost\n', 'plain')).toEqual(['evil.example']);
  });
});

describe('buildSecurityRules — thousands of domains in a couple of rules', () => {
  it('packs a whole chunk into one block rule rather than one rule each', async () => {
    const { buildSecurityRules, CHUNK_SIZE } = await loadModule();
    const domains = Array.from({ length: 1200 }, (_, i) => `bad${i}.example`);

    const rules = buildSecurityRules(domains);

    expect(domains.length).toBeLessThanOrEqual(CHUNK_SIZE);
    expect(rules).toHaveLength(2); // one block + one redirect
    expect(rules[0].action.type).toBe('block');
    expect(rules[0].condition.requestDomains).toHaveLength(1200);
  });

  it('sends only top-level navigations to the warning page, carrying the URL', async () => {
    const { buildSecurityRules, INTERSTITIAL_PATH } = await loadModule();
    const [, redirect] = buildSecurityRules(['evil.example']);

    expect(redirect.action.type).toBe('redirect');
    expect(redirect.condition.resourceTypes).toEqual(['main_frame']);
    // \0 is the whole regex match, i.e. the URL the user tried to open.
    expect(redirect.action.redirect.regexSubstitution).toBe(`${INTERSTITIAL_PATH}#\\0`);
  });

  it('ranks the redirect above the block so navigation reaches the warning', async () => {
    const { buildSecurityRules } = await loadModule();
    const [block, redirect] = buildSecurityRules(['evil.example']);
    expect(redirect.priority).toBeGreaterThan(block.priority);
  });

  it('outranks the ad-blocking allowlist, so allowlisting ads keeps you protected', async () => {
    const { buildSecurityRules } = await loadModule();
    const { PRIORITY } = await import('../src/background/rule-ids.js');
    const [block] = buildSecurityRules(['evil.example']);
    expect(block.priority).toBeGreaterThan(PRIORITY.allowlist);
  });

  it('chunks a list larger than one rule should hold', async () => {
    const { buildSecurityRules, CHUNK_SIZE } = await loadModule();
    const domains = Array.from({ length: CHUNK_SIZE * 2 + 10 }, (_, i) => `bad${i}.example`);

    const rules = buildSecurityRules(domains);
    expect(rules).toHaveLength(6); // 3 chunks x (block + redirect)
    expect(new Set(rules.map((r) => r.id)).size).toBe(6); // ids unique
  });

  it('produces nothing for an empty list', async () => {
    const { buildSecurityRules } = await loadModule();
    expect(buildSecurityRules([])).toEqual([]);
  });
});

describe('dynamic rule bands — the two features must not delete each other', () => {
  it('leaves the ad-blocking allowlist rules alone', async () => {
    const { applySecurityRules } = await loadModule();
    const { ALLOWLIST_RULE_ID_START } = await import('../src/background/rule-ids.js');

    // An allowlist rule is already installed.
    dynRef.rules = [
      { id: ALLOWLIST_RULE_ID_START, priority: 2, action: { type: 'allow' }, condition: {} },
    ];

    await applySecurityRules(['evil.example'], { enabled: true, bypasses: [] });

    const ids = dynRef.rules.map((r) => r.id);
    expect(ids).toContain(ALLOWLIST_RULE_ID_START);
  });

  it('replaces its own rules on reapply instead of duplicating them', async () => {
    const { applySecurityRules } = await loadModule();
    const prefs = { enabled: true, bypasses: [] };

    await applySecurityRules(['evil.example'], prefs);
    const first = dynRef.rules.length;
    await applySecurityRules(['evil.example', 'other.example'], prefs);

    expect(dynRef.rules).toHaveLength(first);
  });

  it('removes every security rule when the shield is turned off', async () => {
    const { applySecurityRules } = await loadModule();
    await applySecurityRules(['evil.example'], { enabled: true, bypasses: [] });
    expect(dynRef.rules.length).toBeGreaterThan(0);

    await applySecurityRules(['evil.example'], { enabled: false, bypasses: [] });
    expect(dynRef.rules).toHaveLength(0);
  });
});

describe('the allowlist no longer wipes the shield', () => {
  it('keeps security rules when a site is added to the ad allowlist', async () => {
    const { applySecurityRules } = await loadModule();
    await applySecurityRules(['evil.example'], { enabled: true, bypasses: [] });
    const securityIds = dynRef.rules.map((r) => r.id);

    // Now run the adblock module's allowlist update against the same store.
    const { addAllowlistDomain } = await import('../src/background/adblock.js');
    mockBrowser.declarativeNetRequest.updateEnabledRulesets = vi.fn(async () => {});
    mockBrowser.declarativeNetRequest.setExtensionActionOptions = vi.fn(async () => {});
    mockBrowser.action = { setBadgeText: vi.fn(async () => {}) };

    await addAllowlistDomain('example.com');

    const after = dynRef.rules.map((r) => r.id);
    for (const id of securityIds) expect(after).toContain(id);
  });
});

describe('bypasses — "proceed anyway" from the warning page', () => {
  it('adds an allow rule that outranks the block', async () => {
    const { addSecurityBypass, buildBypassRules } = await loadModule();
    const { PRIORITY } = await import('../src/background/rule-ids.js');

    const res = await addSecurityBypass('evil.example');
    expect(res.bypasses).toContain('evil.example');

    const [rule] = buildBypassRules(['evil.example']);
    expect(rule.action.type).toBe('allow');
    expect(rule.priority).toBe(PRIORITY.securityBypass);
    expect(rule.priority).toBeGreaterThan(PRIORITY.securityRedirect);
  });

  it('normalizes the domain before storing it', async () => {
    const { addSecurityBypass } = await loadModule();
    const res = await addSecurityBypass('https://www.Evil.example/login');
    expect(res.bypasses).toEqual(['evil.example']);
  });

  it('rejects an unusable domain', async () => {
    const { addSecurityBypass } = await loadModule();
    expect(await addSecurityBypass('not a domain')).toMatchObject({ success: false });
  });

  it('does not add the same domain twice', async () => {
    const { addSecurityBypass } = await loadModule();
    await addSecurityBypass('evil.example');
    const res = await addSecurityBypass('evil.example');
    expect(res.bypasses).toEqual(['evil.example']);
  });

  it('re-blocks on removal', async () => {
    const { addSecurityBypass, removeSecurityBypass } = await loadModule();
    await addSecurityBypass('evil.example');
    const res = await removeSecurityBypass('evil.example');
    expect(res.bypasses).toEqual([]);
  });
});

describe('prefs', () => {
  it('is on by default — protection nobody enables protects nobody', async () => {
    const { getSecurityPrefs } = await loadModule();
    expect((await getSecurityPrefs()).enabled).toBe(true);
  });

  it('installs the bundled seed when nothing is installed yet', async () => {
    const { initSecurityShield } = await loadModule();
    await initSecurityShield();

    const blockRule = dynRef.rules.find((r) => r.action.type === 'block');
    expect(blockRule.condition.requestDomains).toEqual(SEED);
  });

  it('turning it off then on again restores rules from the seed', async () => {
    const { initSecurityShield, setSecurityEnabled } = await loadModule();
    await initSecurityShield();

    await setSecurityEnabled(false);
    expect(dynRef.rules).toHaveLength(0);

    const res = await setSecurityEnabled(true);
    expect(res.enabled).toBe(true);
    expect(dynRef.rules.length).toBeGreaterThan(0);
  });
});

describe('fetchFeedDomains', () => {
  it('merges feeds and survives one of them failing', async () => {
    const mod = await loadModule();
    globalThis.fetch.mockImplementation(async (url) => {
      if (String(url).includes('hole.cert.pl')) {
        return { ok: true, status: 200, text: async () => '! header\ncert-bad.example\n' };
      }
      if (String(url).includes('durablenapkin')) {
        return { ok: false, status: 500, text: async () => '' };
      }
      return { ok: true, status: 200, text: async () => 'pdb-bad.example\n' };
    });

    const domains = await mod.fetchFeedDomains();
    expect(domains).toContain('cert-bad.example');
    expect(domains).toContain('pdb-bad.example');
  });

  it('returns null when every feed fails, so the caller keeps what it has', async () => {
    const mod = await loadModule();
    globalThis.fetch.mockImplementation(async () => {
      throw new Error('offline');
    });
    expect(await mod.fetchFeedDomains()).toBeNull();
  });

  it('a failed refresh does not wipe the installed list', async () => {
    const mod = await loadModule();
    await mod.initSecurityShield();
    const before = dynRef.rules.length;

    globalThis.fetch.mockImplementation(async () => {
      throw new Error('offline');
    });
    const res = await mod.refreshSecurityList();

    expect(res.refreshed).toBe(false);
    expect(dynRef.rules).toHaveLength(before);
  });
});
