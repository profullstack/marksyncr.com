/**
 * Tests for the filter-list -> declarativeNetRequest converter
 * @module __tests__/build-filters.test
 */

import { describe, it, expect } from 'vitest';
import { parseRule, isValidDomain, isValidUrlFilter, buildRuleset } from '../scripts/build-filters.js';

describe('parseRule — skips what declarativeNetRequest cannot represent', () => {
  it.each([
    ['blank line', ''],
    ['comment', '! this is a comment'],
    ['section header', '[Adblock Plus 2.0]'],
    ['cosmetic hide', 'example.com##.ad-banner'],
    ['cosmetic exception', 'example.com#@#.ad'],
    ['scriptlet', 'example.com#%#//scriptlet("abort")'],
    ['allow/exception rule', '@@||ads.example.com^'],
    ['regex filter', '/banner\\d+/'],
    ['unsupported option (redirect)', '||ads.com^$redirect=noop.js'],
    ['unsupported option (csp)', '||ads.com^$csp=script-src'],
    ['unsupported option (removeparam)', '||ads.com^$removeparam=utm'],
    ['pipe in the middle', 'foo|bar'],
    ['non-ascii', '||exämple.com^'],
    ['only anchors/wildcards', '||^'],
  ])('returns null for %s', (_label, line) => {
    expect(parseRule(line)).toBeNull();
  });
});

describe('parseRule — converts network rules', () => {
  it('maps a plain domain-anchored block rule', () => {
    expect(parseRule('||doubleclick.net^')).toEqual({
      urlFilter: '||doubleclick.net^',
      isUrlFilterCaseSensitive: false,
    });
  });

  it('maps $third-party to domainType thirdParty', () => {
    const r = parseRule('||track.example^$third-party');
    expect(r.domainType).toBe('thirdParty');
  });

  it('maps ~third-party to domainType firstParty', () => {
    const r = parseRule('||track.example^$~third-party');
    expect(r.domainType).toBe('firstParty');
  });

  it('maps resource-type options', () => {
    const r = parseRule('||ads.example^$script,image');
    expect(r.resourceTypes.sort()).toEqual(['image', 'script']);
  });

  it('maps subdocument -> sub_frame', () => {
    const r = parseRule('||ads.example^$subdocument');
    expect(r.resourceTypes).toEqual(['sub_frame']);
  });

  it('maps a negated resource type to excludedResourceTypes', () => {
    const r = parseRule('||ads.example^$~stylesheet');
    expect(r.excludedResourceTypes).toEqual(['stylesheet']);
    expect(r.resourceTypes).toBeUndefined();
  });

  it('maps $domain= into initiator include/exclude lists', () => {
    const r = parseRule('||ads.example^$domain=foo.com|~bar.com');
    expect(r.initiatorDomains).toEqual(['foo.com']);
    expect(r.excludedInitiatorDomains).toEqual(['bar.com']);
  });

  it('sets case sensitivity for $match-case', () => {
    const r = parseRule('||Ads.example^$match-case');
    expect(r.isUrlFilterCaseSensitive).toBe(true);
  });

  it('drops a rule whose only include-domain is an invalid wildcard TLD', () => {
    // $domain=wayfair.* scopes the rule; with no valid include left, keeping it
    // would widen the scope, so it must be skipped entirely.
    expect(parseRule('||1.1.1.1/dns-query^$domain=wayfair.*')).toBeNull();
  });

  it('keeps valid includes and drops invalid ones alongside them', () => {
    const r = parseRule('||ads.example^$domain=good.com|wayfair.*');
    expect(r.initiatorDomains).toEqual(['good.com']);
  });
});

describe('isValidDomain', () => {
  it.each(['example.com', 'a.b.co.uk', 'sub-domain.example.org'])('accepts %s', (d) => {
    expect(isValidDomain(d)).toBe(true);
  });

  // The key job is rejecting the shapes Chrome refuses in initiatorDomains:
  // wildcard TLDs and bracketed IPv6 literals. Bare hostnames and underscores
  // are also rejected. (A dotted IPv4 passes the shape check but is harmless —
  // it simply never matches and does not fail ruleset loading.)
  it.each(['wayfair.*', '[::1]', '[::]', 'localhost', 'no_underscore.com', ''])(
    'rejects %s',
    (d) => {
      expect(isValidDomain(d)).toBe(false);
    }
  );
});

describe('buildRuleset — prioritization', () => {
  // Uses the vendored filters/easylist.txt.
  const rules = buildRuleset('easylist.txt', 1, ['zzz-priority-marker.example', 'another.example']);

  it('caps the ruleset at the per-list maximum', () => {
    expect(rules.length).toBe(15000);
  });

  it('injects curated priority domains first, even if absent from the list', () => {
    expect(rules[0].condition.urlFilter).toBe('||zzz-priority-marker.example^');
    expect(rules[1].condition.urlFilter).toBe('||another.example^');
  });

  it('emits equal-priority block rules with unique ids', () => {
    const ids = new Set(rules.map((r) => r.id));
    expect(ids.size).toBe(rules.length);
    expect(rules.every((r) => r.action.type === 'block' && r.priority === 1)).toBe(true);
  });

  it('ranks whole-domain (||domain^) blocks ahead of narrow path rules', () => {
    // Within the first slice, broad domain blocks should dominate.
    const broad = rules.slice(0, 500).filter((r) => /^\|\|[a-z0-9.\-*]+\^$/.test(r.condition.urlFilter));
    expect(broad.length).toBeGreaterThan(400);
  });
});

describe('isValidUrlFilter', () => {
  it('accepts anchored patterns', () => {
    expect(isValidUrlFilter('||ads.com^')).toBe(true);
    expect(isValidUrlFilter('|http://ads.com')).toBe(true);
    expect(isValidUrlFilter('/ads/banner')).toBe(true);
  });

  it('rejects empty, all-anchor, and mid-string pipe patterns', () => {
    expect(isValidUrlFilter('')).toBe(false);
    expect(isValidUrlFilter('||^')).toBe(false);
    expect(isValidUrlFilter('foo|bar')).toBe(false);
  });
});
