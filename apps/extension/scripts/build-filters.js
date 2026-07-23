#!/usr/bin/env node

/**
 * Convert Adblock-Plus-syntax filter lists (EasyList, EasyPrivacy) into
 * Manifest V3 declarativeNetRequest static rulesets.
 *
 * This is intentionally conservative: it only converts network-blocking rules
 * that can be represented *exactly* by declarativeNetRequest. Anything it can't
 * map cleanly (cosmetic/element-hiding rules, exceptions, redirects, CSP,
 * regex filters, unknown options, …) is skipped so we never over-block.
 *
 * Source lists live in `filters/*.txt` (vendored). Output rulesets are written
 * to `public/rules/*.json` and shipped as static declarative_net_request
 * rule_resources in the manifest.
 *
 * Usage: node scripts/build-filters.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const FILTERS_DIR = join(ROOT_DIR, 'filters');
const RULES_DIR = join(ROOT_DIR, 'public/rules');

// Chrome & Firefox guarantee ~30k *enabled* static rules across all enabled
// rulesets. Both lists can be on at once, so budget 15k each => 30k combined,
// which stays inside the guaranteed limit on every MV3 browser (incl. Safari).
const MAX_RULES_PER_LIST = 15000;

// EasyList resource-type option -> declarativeNetRequest ResourceType
const RESOURCE_TYPES = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  css: 'stylesheet',
  object: 'object',
  'object-subrequest': 'object',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  subdocument: 'sub_frame',
  frame: 'sub_frame',
  document: 'main_frame',
  ping: 'ping',
  beacon: 'ping',
  media: 'media',
  font: 'font',
  websocket: 'websocket',
  other: 'other',
};

// Options that are safe to ignore (don't change what we block enough to matter)
const IGNORABLE_OPTIONS = new Set(['all', '~all', 'first-party', '~popup']);

/**
 * declarativeNetRequest requires initiator domains to be canonical registrable
 * domains — no wildcards (wayfair.*), IPs, or IPv6 literals ([::1]).
 * @param {string} d
 */
export function isValidDomain(d) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d);
}

/**
 * declarativeNetRequest urlFilter only allows `|` as a start/end anchor
 * (or `||` domain anchor). A `|` anywhere else makes Chrome reject the rule
 * and, with enough rejects, disable the whole ruleset. Reject those, plus
 * patterns that carry no real matchable content.
 * @param {string} p
 */
export function isValidUrlFilter(p) {
  if (!p) return false;
  // A pattern of only anchors/wildcards/separators matches everything — skip.
  if (/^[|^*]+$/.test(p)) return false;
  // Strip a leading || / | and a trailing |, then no bare | may remain.
  const inner = p.replace(/^\|\|?/, '').replace(/\|$/, '');
  if (inner.includes('|')) return false;
  return true;
}

/**
 * Convert a single Adblock-syntax line into a declarativeNetRequest rule
 * condition + action, or return null if it cannot be represented safely.
 * @param {string} line
 * @returns {{ urlFilter: string, resourceTypes?: string[], excludedResourceTypes?: string[], domainType?: string, initiatorDomains?: string[], excludedInitiatorDomains?: string[], isUrlFilterCaseSensitive?: boolean } | null}
 */
export function parseRule(line) {
  const raw = line.trim();

  // Skip blanks, comments, section headers
  if (!raw || raw.startsWith('!') || raw.startsWith('[')) return null;

  // Skip cosmetic / element-hiding / scriptlet rules (##, #@#, #?#, #$#, #%#)
  if (/#[@?$%]?#/.test(raw)) return null;

  // Skip allow/exception rules — we only build a block list
  if (raw.startsWith('@@')) return null;

  // Skip regex filters (/.../), we can't map them to urlFilter safely
  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0 && raw.indexOf('$') === -1) return null;

  // Split pattern from $options
  let pattern = raw;
  let optionsStr = '';
  const dollar = raw.lastIndexOf('$');
  // Only treat as options separator if there's a real option list after it
  if (dollar > 0 && !raw.slice(dollar).includes('/')) {
    pattern = raw.slice(0, dollar);
    optionsStr = raw.slice(dollar + 1);
  }

  if (!pattern) return null;

  // urlFilter must be ASCII-only
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(pattern)) return null;

  // urlFilter must be a shape declarativeNetRequest will accept
  if (!isValidUrlFilter(pattern)) return null;

  const condition = { urlFilter: pattern, isUrlFilterCaseSensitive: false };
  const resourceTypes = [];
  const excludedResourceTypes = [];

  if (optionsStr) {
    const options = optionsStr.split(',');
    for (let opt of options) {
      opt = opt.trim();
      if (!opt) continue;

      const negated = opt.startsWith('~');
      const base = negated ? opt.slice(1) : opt;

      if (base === 'third-party' || base === '3p') {
        condition.domainType = negated ? 'firstParty' : 'thirdParty';
        continue;
      }
      if (base === 'match-case') {
        condition.isUrlFilterCaseSensitive = true;
        continue;
      }
      if (base.startsWith('domain=')) {
        const value = base.slice('domain='.length);
        const include = [];
        const exclude = [];
        let hadInclude = false;
        for (const d of value.split('|')) {
          if (!d) continue;
          const isExclude = d.startsWith('~');
          const domain = (isExclude ? d.slice(1) : d).toLowerCase();
          if (isExclude) {
            // Invalid excluded domains (IPs/wildcards) can just be dropped
            if (isValidDomain(domain)) exclude.push(domain);
          } else {
            hadInclude = true;
            if (isValidDomain(domain)) include.push(domain);
          }
        }
        // If the rule was scoped to specific domains but none survived
        // validation, dropping them would widen its scope — skip it instead.
        if (hadInclude && include.length === 0) return null;
        if (include.length) condition.initiatorDomains = include;
        if (exclude.length) condition.excludedInitiatorDomains = exclude;
        continue;
      }
      if (RESOURCE_TYPES[base]) {
        if (negated) excludedResourceTypes.push(RESOURCE_TYPES[base]);
        else resourceTypes.push(RESOURCE_TYPES[base]);
        continue;
      }
      if (IGNORABLE_OPTIONS.has(opt) || IGNORABLE_OPTIONS.has(base)) continue;

      // Unknown / unsupported option (redirect, csp, removeparam, important,
      // badfilter, popup, generichide, cookie, replace, header, …) -> skip rule
      return null;
    }
  }

  if (resourceTypes.length) condition.resourceTypes = [...new Set(resourceTypes)];
  if (excludedResourceTypes.length && !resourceTypes.length) {
    condition.excludedResourceTypes = [...new Set(excludedResourceTypes)];
  }

  return condition;
}

/**
 * Build a ruleset array from a filter-list file.
 * @param {string} file
 * @param {number} startId
 */
export function buildRuleset(file, startId) {
  const text = readFileSync(join(FILTERS_DIR, file), 'utf-8');
  const rules = [];
  const seen = new Set();
  let id = startId;

  for (const line of text.split('\n')) {
    if (rules.length >= MAX_RULES_PER_LIST) break;
    const condition = parseRule(line);
    if (!condition) continue;

    // Dedupe on the serialized condition
    const key = JSON.stringify(condition);
    if (seen.has(key)) continue;
    seen.add(key);

    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition,
    });
  }

  return rules;
}

function main() {
  mkdirSync(RULES_DIR, { recursive: true });

  const lists = [
    { file: 'easylist.txt', out: 'ads.json', startId: 1 },
    // Offset ids so the two rulesets never collide if ever merged
    { file: 'easyprivacy.txt', out: 'privacy.json', startId: 1_000_000 },
  ];

  for (const { file, out, startId } of lists) {
    const rules = buildRuleset(file, startId);
    writeFileSync(join(RULES_DIR, out), JSON.stringify(rules));
    console.log(`✅ ${file} -> rules/${out} (${rules.length} rules)`);
  }
}

// Only run the file-writing build when invoked directly (not when imported by tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
