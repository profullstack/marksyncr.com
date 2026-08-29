/**
 * MarkSyncr Shield — phishing & scam protection
 *
 * Blocks known phishing, malware and scam domains, and sends top-level
 * navigations to a warning page instead of a bare network error.
 *
 * Three design decisions worth knowing:
 *
 * 1. **One rule holds thousands of domains.** `requestDomains` takes an array
 *    and matches subdomains implicitly, so ~18k domains cost a handful of rules
 *    rather than 18k. That matters because the ~30k *static* rule budget is
 *    already fully spent by the ads and privacy rulesets.
 *
 * 2. **Dynamic rules, not a static ruleset.** Phishing domains have a median
 *    lifetime measured in hours, while a static ruleset only changes when a new
 *    extension version clears store review — days to weeks. Dynamic rules
 *    persist across restarts and updates and can be refreshed on an alarm. The
 *    bundled seed is installed on first run so protection is never absent while
 *    waiting for a fetch.
 *
 * 3. **Nothing about browsing leaves the device.** The list is downloaded and
 *    matched locally; no URL, domain or hash of one is ever sent anywhere. An
 *    extension that phoned home with visited URLs would be both a privacy
 *    problem and a store-policy one.
 */

import browser from 'webextension-polyfill';
import { fetchCloudSettings, saveCloudSettings } from '../lib/api.js';
import {
  SECURITY_RULE_ID_START,
  SECURITY_RULE_ID_END,
  SECURITY_BYPASS_RULE_ID_START,
  SECURITY_BYPASS_RULE_ID_END,
  PRIORITY,
} from './rule-ids.js';

const SECURITY_STORAGE_KEY = 'security-shield';
const SEED_PATH = 'rules/security-seed.json';
const REFRESH_ALARM_NAME = 'marksyncr-security-refresh';
/** Hours between list refreshes. */
const REFRESH_INTERVAL_HOURS = 6;

/**
 * How many domains go in one rule. Kept well under the size at which large
 * `requestDomains` arrays start to matter for memory, and small enough that a
 * single malformed entry only costs one chunk if a rule is ever rejected.
 */
export const CHUNK_SIZE = 5000;

/** The page a blocked top-level navigation lands on. */
export const INTERSTITIAL_PATH = '/blocked.html';

/**
 * Feeds refreshed at runtime. Same sources, and same licence reasoning, as
 * scripts/update-phishing-list.js — see that file for why these three.
 */
export const FEEDS = [
  { id: 'cert-pl', url: 'https://hole.cert.pl/domains/v2/domains_ublock.txt', format: 'adblock' },
  {
    id: 'durablenapkin-scam',
    url: 'https://raw.githubusercontent.com/durablenapkin/scamblocklist/master/hosts.txt',
    format: 'hosts',
  },
  {
    id: 'phishing-database-new',
    url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-NEW-today.txt',
    format: 'plain',
  },
];

/**
 * @typedef {Object} SecurityPrefs
 * @property {boolean} enabled     Master on/off for phishing protection
 * @property {string[]} bypasses   Domains the user chose to visit anyway
 * @property {number} listUpdatedAt  When the domain list was last refreshed
 * @property {number} listCount    How many domains are currently loaded
 */

/** @type {SecurityPrefs} */
const DEFAULT_PREFS = {
  // On by default. Protection nobody switches on protects nobody, and the
  // curated list is small and clean enough not to break ordinary browsing.
  enabled: true,
  bypasses: [],
  listUpdatedAt: 0,
  listCount: 0,
};

/**
 * Lowercase a hostname, drop "www.", and reject anything that is not a plain
 * registrable hostname. `requestDomains` rejects IPs, ports and wildcards, and
 * a single invalid entry makes the browser reject the entire rule — so an
 * unvalidated feed line could silently disable all protection.
 * @param {string} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (!input) return '';
  let host = String(input).trim().toLowerCase();
  if (host.includes('://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      return '';
    }
  }
  host = host.split('/')[0].split(':')[0].replace(/^\*\./, '').replace(/^www\./, '');
  if (!host || host.length > 253) return '';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return '';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
  return host;
}

/**
 * Extract domains from a feed body.
 * @param {string} text
 * @param {'adblock'|'hosts'|'plain'} format
 * @returns {string[]}
 */
export function parseFeed(text, format) {
  const domains = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!') || line.startsWith('[')) continue;

    let candidate = line;
    if (format === 'hosts') {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      candidate = parts[1];
    }
    const domain = normalizeDomain(candidate);
    if (domain) domains.push(domain);
  }
  return domains;
}

/**
 * Build the dynamic rules for a domain list.
 *
 * Each chunk produces two rules: a `block` covering every request type, and a
 * higher-priority `redirect` limited to `main_frame`. The redirect's
 * `regexSubstitution` carries the original URL into the warning page's fragment
 * (`\0` is the whole regex match), which is how the page can name the site the
 * user was about to visit. The fragment never leaves the browser.
 *
 * @param {string[]} domains
 * @returns {Array<Object>} declarativeNetRequest rules
 */
export function buildSecurityRules(domains) {
  const rules = [];
  let id = SECURITY_RULE_ID_START;

  for (let i = 0; i < domains.length; i += CHUNK_SIZE) {
    const chunk = domains.slice(i, i + CHUNK_SIZE);
    if (id + 1 > SECURITY_RULE_ID_END) break; // out of id band — stop rather than collide

    rules.push({
      id: id++,
      priority: PRIORITY.securityBlock,
      action: { type: 'block' },
      condition: { requestDomains: chunk },
    });

    rules.push({
      id: id++,
      priority: PRIORITY.securityRedirect,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: `${INTERSTITIAL_PATH}#\\0` },
      },
      condition: {
        regexFilter: '^https?://.*',
        requestDomains: chunk,
        resourceTypes: ['main_frame'],
      },
    });
  }

  return rules;
}

/**
 * Build the "proceed anyway" exemptions. These outrank both security rules, so
 * the user can reach a site the list flags once they have seen the warning.
 * @param {string[]} domains
 * @returns {Array<Object>}
 */
export function buildBypassRules(domains) {
  const capacity = SECURITY_BYPASS_RULE_ID_END - SECURITY_BYPASS_RULE_ID_START + 1;
  return domains.slice(0, capacity).map((domain, i) => ({
    id: SECURITY_BYPASS_RULE_ID_START + i,
    priority: PRIORITY.securityBypass,
    action: { type: 'allow' },
    condition: { requestDomains: [domain] },
  }));
}

/** Read stored prefs merged over defaults. */
export async function getSecurityPrefs() {
  const stored = await browser.storage.local.get(SECURITY_STORAGE_KEY);
  const prefs = stored?.[SECURITY_STORAGE_KEY] || {};
  return {
    enabled: prefs.enabled ?? DEFAULT_PREFS.enabled,
    bypasses: Array.isArray(prefs.bypasses) ? prefs.bypasses : [],
    listUpdatedAt: prefs.listUpdatedAt || 0,
    listCount: prefs.listCount || 0,
  };
}

async function setSecurityPrefs(prefs) {
  await browser.storage.local.set({ [SECURITY_STORAGE_KEY]: prefs });
}

/** Read the domain list bundled with the extension. */
export async function loadSeedDomains() {
  try {
    const res = await fetch(browser.runtime.getURL(SEED_PATH));
    if (!res.ok) throw new Error(`seed ${res.status}`);
    const json = await res.json();
    return Array.isArray(json?.domains) ? json.domains : [];
  } catch (err) {
    console.warn('[MarkSyncr] Could not load security seed:', err?.message);
    return [];
  }
}

/** Domains currently installed, read back from the live rules. */
async function getInstalledDomains() {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const domains = [];
  for (const rule of existing) {
    if (rule.id < SECURITY_RULE_ID_START || rule.id > SECURITY_RULE_ID_END) continue;
    if (rule.action?.type !== 'block') continue;
    domains.push(...(rule.condition?.requestDomains || []));
  }
  return domains;
}

/**
 * Replace the shield's dynamic rules. Removes only ids in the security bands,
 * leaving the ad-blocking allowlist alone.
 * @param {string[]} domains
 * @param {SecurityPrefs} prefs
 */
export async function applySecurityRules(domains, prefs) {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .map((r) => r.id)
    .filter(
      (id) =>
        (id >= SECURITY_RULE_ID_START && id <= SECURITY_RULE_ID_END) ||
        (id >= SECURITY_BYPASS_RULE_ID_START && id <= SECURITY_BYPASS_RULE_ID_END)
    );

  const addRules = prefs.enabled
    ? [...buildSecurityRules(domains), ...buildBypassRules(prefs.bypasses)]
    : [];

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

/**
 * Download every feed and return the merged domain list. A feed that fails is
 * skipped rather than failing the refresh — partial protection beats none — but
 * if they all fail we return null so the caller keeps what it already has.
 * @returns {Promise<string[]|null>}
 */
export async function fetchFeedDomains() {
  const merged = new Set();
  let anySucceeded = false;

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const domain of parseFeed(await res.text(), feed.format)) merged.add(domain);
      anySucceeded = true;
    } catch (err) {
      console.warn(`[MarkSyncr] Security feed ${feed.id} failed:`, err?.message);
    }
  }

  return anySucceeded ? [...merged] : null;
}

/**
 * Refresh the list from the network and reinstall the rules.
 * @returns {Promise<Object>} fresh status
 */
export async function refreshSecurityList() {
  const prefs = await getSecurityPrefs();
  const domains = await fetchFeedDomains();

  if (!domains) {
    return { ...(await getSecurityStatus()), refreshed: false };
  }

  prefs.listUpdatedAt = Date.now();
  prefs.listCount = domains.length;
  await setSecurityPrefs(prefs);
  await applySecurityRules(domains, prefs);

  return { ...(await getSecurityStatus()), refreshed: true };
}

/** Current shield status for the popup. */
export async function getSecurityStatus() {
  const prefs = await getSecurityPrefs();
  return {
    success: true,
    enabled: prefs.enabled,
    bypasses: prefs.bypasses,
    listUpdatedAt: prefs.listUpdatedAt,
    listCount: prefs.listCount,
  };
}

/**
 * Reinstall rules from whatever domain list is available: the live rules if the
 * shield is already installed, otherwise the bundled seed.
 * @param {SecurityPrefs} prefs
 */
async function reapply(prefs) {
  let domains = await getInstalledDomains();
  if (domains.length === 0) domains = await loadSeedDomains();
  if (prefs.listCount !== domains.length) {
    prefs.listCount = domains.length;
    await setSecurityPrefs(prefs);
  }
  await applySecurityRules(domains, prefs);
}

/** Toggle phishing protection. */
export async function setSecurityEnabled(enabled) {
  const prefs = await getSecurityPrefs();
  prefs.enabled = Boolean(enabled);
  await setSecurityPrefs(prefs);
  await reapply(prefs);
  pushSecurityToCloud(prefs).catch(() => {});
  return getSecurityStatus();
}

/**
 * Let the user through to a site the list flags, from the warning page.
 * @param {string} domain
 */
export async function addSecurityBypass(domain) {
  const d = normalizeDomain(domain);
  if (!d) return { success: false, error: 'Invalid domain' };
  const prefs = await getSecurityPrefs();
  if (!prefs.bypasses.includes(d)) prefs.bypasses = [...prefs.bypasses, d];
  await setSecurityPrefs(prefs);
  await reapply(prefs);
  pushSecurityToCloud(prefs).catch(() => {});
  return getSecurityStatus();
}

/** Re-protect a site the user had let through. */
export async function removeSecurityBypass(domain) {
  const d = normalizeDomain(domain);
  const prefs = await getSecurityPrefs();
  prefs.bypasses = prefs.bypasses.filter((x) => x !== d);
  await setSecurityPrefs(prefs);
  await reapply(prefs);
  pushSecurityToCloud(prefs).catch(() => {});
  return getSecurityStatus();
}

// ===========================================================================
// Cloud sync — the enabled flag and bypass list follow the user across devices,
// alongside the adblock prefs. The domain list itself is never synced; each
// device fetches it directly.
// ===========================================================================

/** Persist prefs to the cloud, merged into the existing settings blob. */
export async function pushSecurityToCloud(prefs) {
  const res = await fetchCloudSettings();
  if (!res) return false;
  const blob = {
    ...(res.settings || {}),
    security: { enabled: prefs.enabled, bypasses: prefs.bypasses },
  };
  return saveCloudSettings({ settings: blob });
}

/** Adopt cloud prefs locally, if any. */
export async function syncSecurityFromCloud() {
  const res = await fetchCloudSettings();
  const cloud = res?.settings?.security;
  if (cloud && typeof cloud === 'object') {
    const prefs = await getSecurityPrefs();
    prefs.enabled = cloud.enabled ?? prefs.enabled;
    prefs.bypasses = Array.isArray(cloud.bypasses) ? cloud.bypasses : prefs.bypasses;
    await setSecurityPrefs(prefs);
    await reapply(prefs);
  }
  return getSecurityStatus();
}

/**
 * Install the shield and schedule refreshes. Called on install, update and
 * startup — dynamic rules survive restarts, so this is normally a no-op reapply
 * rather than a reinstall.
 */
export async function initSecurityShield() {
  const prefs = await getSecurityPrefs();
  await reapply(prefs);

  try {
    await browser.alarms.create(REFRESH_ALARM_NAME, {
      periodInMinutes: REFRESH_INTERVAL_HOURS * 60,
    });
  } catch (err) {
    console.warn('[MarkSyncr] Could not schedule security refresh:', err?.message);
  }

  // Refresh straight away if the list has never been fetched or is stale.
  const age = Date.now() - prefs.listUpdatedAt;
  if (prefs.enabled && age > REFRESH_INTERVAL_HOURS * 60 * 60 * 1000) {
    refreshSecurityList().catch(() => {});
  }
}

/** True when the alarm belongs to this module. */
export function isSecurityRefreshAlarm(alarmName) {
  return alarmName === REFRESH_ALARM_NAME;
}
