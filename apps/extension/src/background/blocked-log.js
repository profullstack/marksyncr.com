/**
 * MarkSyncr Shield — blocked-request log
 *
 * Reports *what* the shield blocked on a tab, not just how many things it
 * blocked. This is harder than it sounds under Manifest V3: blocking is done
 * natively by declarativeNetRequest static rulesets, and the only match
 * telemetry a packaged extension can read is
 * `declarativeNetRequest.getMatchedRules()`, which returns the matched **rule
 * id** and ruleset — never the request URL. (The URL-bearing
 * `onRuleMatchedDebug` event needs the `declarativeNetRequestFeedback`
 * permission and only fires for unpacked extensions.)
 *
 * So we resolve rule ids back to the filter that matched, using the label index
 * `scripts/build-filters.js` emits next to each ruleset (`rules/*.labels.txt`,
 * one label per line, line N == rule id `startId + N`). Every rule in the
 * shipped lists is a whole-domain block, so the label is the ad/tracker domain
 * that was stopped — which is what the user wants to see.
 *
 * When `onRuleMatchedDebug` *is* available (dev builds), we additionally record
 * the exact request URLs, which are strictly better, and prefer them.
 */

import browser from 'webextension-polyfill';

const RULES_INDEX_PATH = 'rules/index.json';

/** Per-tab cap on remembered debug entries — keeps the newest. */
const MAX_DEBUG_ENTRIES_PER_TAB = 250;
/** Cap on how many tabs we keep a debug log for. */
const MAX_DEBUG_TABS = 50;
/** Rulesets that represent blocking (dynamic allowlist rules are not blocks). */
const BLOCKING_RULESET_IDS = ['ads', 'privacy'];

/** @type {Promise<Record<string, {startId: number, count: number, labels: string}>>|null} */
let rulesIndexPromise = null;
/** @type {Map<string, Promise<string[]>>} ruleset id -> label lines */
const labelCache = new Map();
/**
 * tabId -> array of { url, label, list, at } oldest-first. Only populated when
 * onRuleMatchedDebug is available.
 * @type {Map<number, Array<{url: string, label: string, list: string, at: number}>>}
 */
const debugLog = new Map();
let debugListenerAttached = false;

/**
 * Load the generated ruleset index (ruleset id -> start id + label file).
 * Cached for the life of the service worker.
 */
function loadRulesIndex() {
  if (!rulesIndexPromise) {
    rulesIndexPromise = (async () => {
      const res = await fetch(browser.runtime.getURL(RULES_INDEX_PATH));
      if (!res.ok) throw new Error(`rules index ${res.status}`);
      const json = await res.json();
      return json?.lists || {};
    })().catch((err) => {
      console.warn('[MarkSyncr] Could not load rules index:', err?.message);
      rulesIndexPromise = null; // allow a retry on the next call
      return {};
    });
  }
  return rulesIndexPromise;
}

/**
 * Load (and cache) the label lines for one ruleset.
 * @param {string} rulesetId
 * @param {string} labelsPath
 * @returns {Promise<string[]>}
 */
function loadLabels(rulesetId, labelsPath) {
  if (!labelCache.has(rulesetId)) {
    const promise = (async () => {
      const res = await fetch(browser.runtime.getURL(labelsPath));
      if (!res.ok) throw new Error(`labels ${res.status}`);
      return (await res.text()).split('\n');
    })().catch((err) => {
      console.warn(`[MarkSyncr] Could not load labels for ${rulesetId}:`, err?.message);
      labelCache.delete(rulesetId); // allow a retry
      return [];
    });
    labelCache.set(rulesetId, promise);
  }
  return labelCache.get(rulesetId);
}

/**
 * Resolve a matched rule back to the domain/pattern it blocked.
 * @param {string} rulesetId
 * @param {number} ruleId
 * @returns {Promise<string>} label, or '' when it can't be resolved
 */
export async function labelForRule(rulesetId, ruleId) {
  const index = await loadRulesIndex();
  const entry = index[rulesetId];
  if (!entry) return '';
  const labels = await loadLabels(rulesetId, entry.labels);
  return labels[ruleId - entry.startId] || '';
}

/**
 * Fold a flat list of hits into per-target rows: one row per blocked
 * domain/pattern, with a count and the most recent timestamp.
 * @param {Array<{label: string, list: string, at: number, url?: string}>} hits
 */
function aggregate(hits) {
  /** @type {Map<string, {label: string, list: string, count: number, lastAt: number, urls: string[]}>} */
  const rows = new Map();

  for (const hit of hits) {
    const key = `${hit.list} ${hit.label}`;
    let row = rows.get(key);
    if (!row) {
      row = { label: hit.label, list: hit.list, count: 0, lastAt: 0, urls: [] };
      rows.set(key, row);
    }
    row.count += 1;
    if (hit.at > row.lastAt) row.lastAt = hit.at;
    // Keep a few example URLs (debug mode only) without unbounded growth.
    if (hit.url && row.urls.length < 5 && !row.urls.includes(hit.url)) row.urls.push(hit.url);
  }

  return [...rows.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Read the blocked-request report for a tab.
 *
 * Prefers the debug log (real URLs) when it has entries for the tab, otherwise
 * queries getMatchedRules and resolves rule ids to labels.
 *
 * @param {number} tabId
 * @returns {Promise<Object>} { success, supported, source, total, entries, [error] }
 */
export async function getBlockedRequests(tabId) {
  if (typeof tabId !== 'number') {
    return { success: false, error: 'A tabId is required' };
  }

  const debugHits = debugLog.get(tabId);
  if (debugHits?.length) {
    return {
      success: true,
      supported: true,
      source: 'debug',
      tabId,
      total: debugHits.length,
      entries: aggregate(debugHits),
    };
  }

  if (!browser.declarativeNetRequest?.getMatchedRules) {
    return {
      success: true,
      supported: false,
      source: 'unavailable',
      tabId,
      total: 0,
      entries: [],
      error: 'This browser cannot report which requests were blocked.',
    };
  }

  let matched;
  try {
    matched = await browser.declarativeNetRequest.getMatchedRules({ tabId });
  } catch (err) {
    // Thrown when neither activeTab (for this tab) nor the feedback permission
    // is available — e.g. the tab changed since the popup opened.
    return {
      success: true,
      supported: false,
      source: 'unavailable',
      tabId,
      total: 0,
      entries: [],
      error: err?.message || 'Blocked-request details are not available for this tab.',
    };
  }

  const info = matched?.rulesMatchedInfo || [];
  const hits = [];
  for (const item of info) {
    const rulesetId = item?.rule?.rulesetId;
    // Skip our dynamic allowlist rules and anything from a ruleset we don't
    // have labels for — those are allows, not blocks.
    if (!BLOCKING_RULESET_IDS.includes(rulesetId)) continue;
    const label = await labelForRule(rulesetId, item.rule.ruleId);
    hits.push({
      label: label || `rule #${item.rule.ruleId}`,
      list: rulesetId,
      at: item.timeStamp || 0,
    });
  }

  return {
    success: true,
    supported: true,
    source: 'matched-rules',
    tabId,
    total: hits.length,
    entries: aggregate(hits),
  };
}

/** Drop a tab's debug log (navigation or tab close). */
function clearTab(tabId) {
  debugLog.delete(tabId);
}

/**
 * Record one onRuleMatchedDebug event. Exported for tests.
 * @param {Object} info matched rule info, including `request`
 */
export async function recordDebugMatch(info) {
  const tabId = info?.request?.tabId;
  if (typeof tabId !== 'number' || tabId < 0) return;

  const rulesetId = info?.rule?.rulesetId;
  if (!BLOCKING_RULESET_IDS.includes(rulesetId)) return;

  const url = info.request.url || '';
  let label = '';
  try {
    label = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    label = (await labelForRule(rulesetId, info.rule.ruleId)) || url;
  }

  let entries = debugLog.get(tabId);
  if (!entries) {
    if (debugLog.size >= MAX_DEBUG_TABS) clearTab(debugLog.keys().next().value);
    entries = [];
    debugLog.set(tabId, entries);
  }
  entries.push({ url, label, list: rulesetId, at: Date.now() });
  if (entries.length > MAX_DEBUG_ENTRIES_PER_TAB) entries.shift();
}

/**
 * Attach the listeners that keep the log fresh. Safe to call more than once and
 * a no-op where the debug event isn't available (packaged builds).
 */
export function initBlockedLog() {
  if (debugListenerAttached) return;

  const onRuleMatchedDebug = browser.declarativeNetRequest?.onRuleMatchedDebug;
  if (onRuleMatchedDebug?.addListener) {
    onRuleMatchedDebug.addListener((info) => {
      recordDebugMatch(info).catch(() => {});
    });
    debugListenerAttached = true;
  }

  // Reset a tab's log when it navigates or goes away, so the report always
  // describes the page the user is looking at.
  try {
    browser.tabs?.onRemoved?.addListener((tabId) => clearTab(tabId));
    browser.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
      if (changeInfo?.status === 'loading') clearTab(tabId);
    });
  } catch {
    /* tabs events unavailable — the debug log just grows to its cap */
  }
}

/**
 * Clear remembered debug entries for a tab, or all of them when no tab is given.
 * @param {number} [tabId]
 */
export function clearBlockedRequests(tabId) {
  if (typeof tabId === 'number') clearTab(tabId);
  else debugLog.clear();
  return { success: true };
}
