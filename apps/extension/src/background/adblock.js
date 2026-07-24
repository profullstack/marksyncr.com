/**
 * MarkSyncr Adblocker
 *
 * A simple, uBlock-Origin-Lite-style content blocker built on the Manifest V3
 * declarativeNetRequest API. Blocking is done by static rulesets (see
 * public/rules/*.json, generated from EasyList + EasyPrivacy) which the browser
 * applies natively — no per-request JS, no host permissions needed.
 *
 * Features:
 *  - master on/off + per-list (ads / trackers) toggles  -> static rulesets
 *  - per-site allowlist ("disable on this site")        -> dynamic allow rules
 *  - cloud sync of all preferences across devices       -> /api/settings blob
 */

import browser from 'webextension-polyfill';
import { fetchCloudSettings, saveCloudSettings } from '../lib/api.js';

const ADBLOCK_STORAGE_KEY = 'adblock';

// Ruleset ids — must match the `id`s in manifest.*.json > declarative_net_request
export const RULESET_IDS = {
  ads: 'ads',
  privacy: 'privacy',
};

// Approximate rule counts per list (kept in sync with MAX_RULES_PER_LIST in
// scripts/build-filters.js). Only used for display in the popup.
export const RULE_COUNTS = {
  ads: 15000,
  privacy: 15000,
};

/**
 * @typedef {Object} AdblockPrefs
 * @property {boolean} enabled       Master on/off switch
 * @property {{ ads: boolean, privacy: boolean }} lists  Per-list toggles
 * @property {string[]} allowlist    Domains where blocking is disabled
 */

/** @type {AdblockPrefs} */
const DEFAULT_PREFS = {
  enabled: true,
  lists: { ads: true, privacy: true },
  allowlist: [],
};

/**
 * Normalize a hostname or URL into a bare registrable-ish domain:
 * lowercase, no scheme/path/port, no leading "www.".
 * @param {string} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (!input) return '';
  let host = String(input).trim();
  try {
    if (host.includes('://')) host = new URL(host).hostname;
  } catch {
    /* fall through with the raw string */
  }
  host = host.split('/')[0].split(':')[0].toLowerCase();
  return host.replace(/^www\./, '');
}

/**
 * Read the stored adblock preferences, merged over defaults.
 * @returns {Promise<AdblockPrefs>}
 */
export async function getAdblockPrefs() {
  const stored = await browser.storage.local.get(ADBLOCK_STORAGE_KEY);
  const prefs = stored?.[ADBLOCK_STORAGE_KEY] || {};
  return {
    enabled: prefs.enabled ?? DEFAULT_PREFS.enabled,
    lists: { ...DEFAULT_PREFS.lists, ...(prefs.lists || {}) },
    allowlist: Array.isArray(prefs.allowlist) ? prefs.allowlist : [],
  };
}

/**
 * Persist adblock preferences locally.
 * @param {AdblockPrefs} prefs
 */
async function setAdblockPrefs(prefs) {
  await browser.storage.local.set({ [ADBLOCK_STORAGE_KEY]: prefs });
}

/**
 * Show/hide the per-tab blocked-request count on the toolbar badge.
 * Chrome supports this natively; other browsers may not, so failures are
 * non-fatal.
 * @param {boolean} enabled
 */
async function updateBadge(enabled) {
  try {
    if (browser.declarativeNetRequest?.setExtensionActionOptions) {
      await browser.declarativeNetRequest.setExtensionActionOptions({
        displayActionCountAsBadge: enabled,
      });
    }
  } catch (err) {
    console.log('[MarkSyncr] Badge count not supported:', err?.message);
  }

  if (!enabled) {
    try {
      await browser.action.setBadgeText({ text: '' });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Enable/disable the static rulesets to match the master + per-list prefs.
 * @param {AdblockPrefs} prefs
 */
async function applyRulesets(prefs) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  for (const id of Object.values(RULESET_IDS)) {
    const shouldEnable = prefs.enabled && prefs.lists[id];
    (shouldEnable ? enableRulesetIds : disableRulesetIds).push(id);
  }

  await browser.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds,
  });
}

/**
 * Rebuild the dynamic "allow" rules that exempt allowlisted sites. Each rule is
 * higher priority than the static block rules (priority 2 > 1), so any request
 * initiated by an allowlisted site wins an "allow" and is never blocked.
 * When the blocker is off, no allow rules are needed.
 * @param {AdblockPrefs} prefs
 */
async function applyAllowlist(prefs) {
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  const domains = prefs.enabled ? prefs.allowlist : [];
  const addRules = domains.map((domain, i) => ({
    id: i + 1,
    priority: 2,
    action: { type: 'allow' },
    condition: { initiatorDomains: [domain] },
  }));

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

/**
 * Apply the given preferences: static rulesets, per-site allowlist, and badge.
 * @param {AdblockPrefs} prefs
 */
export async function applyAdblock(prefs) {
  try {
    await applyRulesets(prefs);
    await applyAllowlist(prefs);
  } catch (err) {
    console.error('[MarkSyncr] Failed to apply adblock rules:', err);
    throw err;
  }
  await updateBadge(prefs.enabled);
}

/**
 * Ensure the live rule state matches the stored preference. Call on
 * install/update/startup so enabled rulesets + allowlist always reflect the
 * user's choice (the manifest defaults all static rulesets to enabled).
 */
export async function initAdblock() {
  const prefs = await getAdblockPrefs();
  await applyAdblock(prefs);
  // Opportunistically reconcile with the cloud (no-op if signed out).
  syncAdblockFromCloud().catch(() => {});
}

/**
 * Current adblock status for the popup UI.
 * @returns {Promise<Object>}
 */
export async function getAdblockStatus() {
  const prefs = await getAdblockPrefs();
  const activeRules = prefs.enabled
    ? Object.values(RULESET_IDS).reduce(
        (sum, id) => sum + (prefs.lists[id] ? RULE_COUNTS[id] : 0),
        0
      )
    : 0;

  return {
    success: true,
    enabled: prefs.enabled,
    lists: prefs.lists,
    allowlist: prefs.allowlist,
    counts: RULE_COUNTS,
    activeRules,
  };
}

/**
 * Save prefs locally, apply them, push to the cloud, and return fresh status.
 * @param {AdblockPrefs} prefs
 */
async function commit(prefs) {
  await setAdblockPrefs(prefs);
  await applyAdblock(prefs);
  pushAdblockToCloud(prefs).catch(() => {});
  return getAdblockStatus();
}

/** Toggle the master adblock switch. */
export async function setAdblockEnabled(enabled) {
  const prefs = await getAdblockPrefs();
  prefs.enabled = Boolean(enabled);
  return commit(prefs);
}

/** Toggle a single filter list on/off. */
export async function setAdblockList(listId, enabled) {
  if (!(listId in RULESET_IDS)) {
    return { success: false, error: `Unknown list: ${listId}` };
  }
  const prefs = await getAdblockPrefs();
  prefs.lists[listId] = Boolean(enabled);
  return commit(prefs);
}

/** Add a site to the allowlist (blocking disabled there). */
export async function addAllowlistDomain(domain) {
  const d = normalizeDomain(domain);
  if (!d) return { success: false, error: 'Invalid domain' };
  const prefs = await getAdblockPrefs();
  if (!prefs.allowlist.includes(d)) prefs.allowlist = [...prefs.allowlist, d];
  return commit(prefs);
}

/** Remove a site from the allowlist. */
export async function removeAllowlistDomain(domain) {
  const d = normalizeDomain(domain);
  const prefs = await getAdblockPrefs();
  prefs.allowlist = prefs.allowlist.filter((x) => x !== d);
  return commit(prefs);
}

// ===========================================================================
// Cloud sync — persists prefs under the user's /api/settings blob (settings.adblock)
// so they follow the user across devices. All calls no-op when signed out.
// ===========================================================================

/**
 * Fetch adblock prefs stored in the cloud, or null if none / signed out.
 * @returns {Promise<AdblockPrefs|null>}
 */
export async function pullAdblockFromCloud() {
  const res = await fetchCloudSettings();
  const adblock = res?.settings?.adblock;
  if (!adblock || typeof adblock !== 'object') return null;
  return {
    enabled: adblock.enabled ?? DEFAULT_PREFS.enabled,
    lists: { ...DEFAULT_PREFS.lists, ...(adblock.lists || {}) },
    allowlist: Array.isArray(adblock.allowlist) ? adblock.allowlist : [],
  };
}

/**
 * Persist adblock prefs to the cloud, merged into the existing settings blob so
 * other settings are preserved. No-op (returns false) when signed out.
 * @param {AdblockPrefs} prefs
 */
export async function pushAdblockToCloud(prefs) {
  const res = await fetchCloudSettings();
  if (!res) return false; // signed out or fetch failed — don't clobber
  const blob = { ...(res.settings || {}), adblock: prefs };
  return saveCloudSettings({ settings: blob });
}

/**
 * Pull cloud prefs and, if present, adopt them locally + apply. Cloud is the
 * cross-device source of truth on load.
 * @returns {Promise<Object>} fresh status
 */
export async function syncAdblockFromCloud() {
  const cloud = await pullAdblockFromCloud();
  if (cloud) {
    await setAdblockPrefs(cloud);
    await applyAdblock(cloud);
  }
  return getAdblockStatus();
}
