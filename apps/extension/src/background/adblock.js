/**
 * MarkSyncr Adblocker
 *
 * A simple, uBlock-Origin-Lite-style content blocker built on the Manifest V3
 * declarativeNetRequest API. Blocking is done entirely by static rulesets
 * (see public/rules/*.json, generated from EasyList + EasyPrivacy) which the
 * browser applies natively — no per-request JS, no host permissions needed.
 *
 * This module only manages *which* rulesets are enabled, driven by a single
 * user preference so the whole thing is trivial to turn on/off.
 */

import browser from 'webextension-polyfill';

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
 */

/** @type {AdblockPrefs} */
const DEFAULT_PREFS = {
  enabled: true,
  lists: { ads: true, privacy: true },
};

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
  };
}

/**
 * Persist adblock preferences.
 * @param {AdblockPrefs} prefs
 */
async function setAdblockPrefs(prefs) {
  await browser.storage.local.set({ [ADBLOCK_STORAGE_KEY]: prefs });
}

/**
 * Show/hide the per-tab blocked-request count on the toolbar badge.
 * Chrome supports this natively via declarativeNetRequest; other browsers may
 * not, so failures are non-fatal.
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

  // When turning off, clear any lingering badge text.
  if (!enabled) {
    try {
      await browser.action.setBadgeText({ text: '' });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Apply the given preferences by enabling/disabling the static rulesets.
 * When the master switch is off, every ruleset is disabled regardless of the
 * per-list toggles.
 * @param {AdblockPrefs} prefs
 */
export async function applyAdblock(prefs) {
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  for (const id of Object.values(RULESET_IDS)) {
    const shouldEnable = prefs.enabled && prefs.lists[id];
    (shouldEnable ? enableRulesetIds : disableRulesetIds).push(id);
  }

  try {
    await browser.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds,
      disableRulesetIds,
    });
  } catch (err) {
    console.error('[MarkSyncr] Failed to update adblock rulesets:', err);
    throw err;
  }

  await updateBadge(prefs.enabled);
}

/**
 * Ensure the live ruleset state matches the stored preference. Call on
 * install/update/startup so the browser's enabled rulesets are always in sync
 * with what the user chose (the manifest defaults them all to enabled).
 */
export async function initAdblock() {
  const prefs = await getAdblockPrefs();
  await applyAdblock(prefs);
}

/**
 * Current adblock status for the popup UI.
 * @returns {Promise<{ success: true, enabled: boolean, lists: { ads: boolean, privacy: boolean }, counts: { ads: number, privacy: number }, activeRules: number }>}
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
    counts: RULE_COUNTS,
    activeRules,
  };
}

/**
 * Toggle the master adblock switch.
 * @param {boolean} enabled
 */
export async function setAdblockEnabled(enabled) {
  const prefs = await getAdblockPrefs();
  prefs.enabled = Boolean(enabled);
  await setAdblockPrefs(prefs);
  await applyAdblock(prefs);
  return getAdblockStatus();
}

/**
 * Toggle a single filter list on/off.
 * @param {'ads' | 'privacy'} listId
 * @param {boolean} enabled
 */
export async function setAdblockList(listId, enabled) {
  if (!(listId in RULESET_IDS)) {
    return { success: false, error: `Unknown list: ${listId}` };
  }
  const prefs = await getAdblockPrefs();
  prefs.lists[listId] = Boolean(enabled);
  await setAdblockPrefs(prefs);
  await applyAdblock(prefs);
  return getAdblockStatus();
}
