import React, { useCallback, useEffect, useState } from 'react';

/**
 * Get the extension messaging/tabs API (Chrome or Firefox), or null in a plain
 * web/dev context where it isn't available.
 */
function getExtApi() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) return chrome;
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) return browser;
  return null;
}

async function sendMessage(message) {
  const api = getExtApi();
  if (!api) return { success: false, error: 'Extension API unavailable' };
  return api.runtime.sendMessage(message);
}

/**
 * Read the active tab's id + hostname (needs activeTab, which is granted to the
 * extension while the popup is open). The id is what lets the background ask
 * declarativeNetRequest which rules matched on this tab.
 */
async function getActiveTab() {
  const api = getExtApi();
  if (!api?.tabs?.query) return { id: null, domain: '' };
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    const url = tab?.url || '';
    const id = typeof tab?.id === 'number' ? tab.id : null;
    if (!url.startsWith('http')) return { id, domain: '' }; // skip chrome://, about:, etc.
    return { id, domain: normalizeDomain(url) };
  } catch {
    return { id: null, domain: '' };
  }
}

/** Mirror of background normalizeDomain: bare host, no scheme/path/port/www. */
function normalizeDomain(input) {
  if (!input) return '';
  let host = String(input).trim();
  try {
    if (host.includes('://')) host = new URL(host).hostname;
  } catch {
    /* raw */
  }
  return host.split('/')[0].split(':')[0].toLowerCase().replace(/^www\./, '');
}

/** iOS-style toggle switch */
function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const LISTS = [
  { id: 'ads', name: 'Ads', description: 'Blocks ad servers & banners (EasyList)' },
  { id: 'privacy', name: 'Trackers', description: 'Blocks trackers & analytics (EasyPrivacy)' },
];

/** Ruleset id -> short label for the blocked-request rows. */
const LIST_NAMES = Object.fromEntries(LISTS.map((l) => [l.id, l.name]));

/** How many blocked rows to show before "Show all". */
const BLOCKED_PREVIEW_COUNT = 6;

/**
 * "Blocked on this page" — what the shield actually stopped on the active tab.
 *
 * declarativeNetRequest reports matched *rules*, not URLs, so in a packaged
 * build each row names the filter's domain (e.g. doubleclick.net) rather than
 * the full request URL. Dev builds with the feedback permission get real URLs,
 * which are shown as an expandable detail.
 */
function BlockedList({ report, busy, onRefresh }) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const entries = report?.entries || [];
  const shown = showAll ? entries : entries.slice(0, BLOCKED_PREVIEW_COUNT);
  const hasUrls = report?.source === 'debug';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Blocked on this page
          {report?.total ? (
            <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
              {report.total}
            </span>
          ) : null}
        </h4>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          aria-label="Refresh blocked requests"
          title="Refresh"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {report && !report.supported ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {report.error || 'Blocked-request details are not available in this browser.'}
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Nothing blocked on this page yet. Reload the page to see what gets stopped.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {shown.map((entry) => {
              const key = `${entry.list}:${entry.label}`;
              const isOpen = expanded === key;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        hasUrls && entry.urls?.length ? setExpanded(isOpen ? null : key) : null
                      }
                      className={`min-w-0 flex-1 text-left ${
                        hasUrls && entry.urls?.length ? 'cursor-pointer' : 'cursor-default'
                      }`}
                      title={entry.label}
                    >
                      <span className="block truncate font-mono text-xs text-slate-700">
                        {entry.label}
                      </span>
                    </button>
                    <span
                      className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        entry.list === 'ads'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-violet-50 text-violet-600'
                      }`}
                    >
                      {LIST_NAMES[entry.list] || entry.list}
                    </span>
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">
                      {entry.count}
                    </span>
                  </div>

                  {isOpen && entry.urls?.length ? (
                    <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5">
                      {entry.urls.map((url) => (
                        <li
                          key={url}
                          className="truncate font-mono text-[10px] text-slate-400"
                          title={url}
                        >
                          {url}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>

          {entries.length > BLOCKED_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full rounded-lg py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
            >
              {showAll
                ? 'Show fewer'
                : `Show all ${entries.length} domains`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function AdblockPanel() {
  const [status, setStatus] = useState(null);
  const [domain, setDomain] = useState('');
  const [tabId, setTabId] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [blockedBusy, setBlockedBusy] = useState(false);
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  /** Ask the background what the shield stopped on the given tab. */
  const loadBlocked = useCallback(async (id) => {
    if (typeof id !== 'number') return;
    setBlockedBusy(true);
    const res = await sendMessage({ type: 'GET_BLOCKED_REQUESTS', payload: { tabId: id } });
    if (res?.success) setBlocked(res);
    setBlockedBusy(false);
  }, []);

  useEffect(() => {
    (async () => {
      const tab = await getActiveTab();
      setDomain(tab.domain);
      setTabId(tab.id);
      // Pull cross-device prefs from the cloud (no-op if signed out), which
      // returns fresh status; fall back to local status if it fails.
      let res = await sendMessage({ type: 'SYNC_ADBLOCK_CLOUD' });
      if (!res?.success) res = await sendMessage({ type: 'GET_ADBLOCK_STATUS' });
      if (res?.success) setStatus(res);

      // Phishing protection keeps its own prefs (and its own cloud blob key).
      let sec = await sendMessage({ type: 'SYNC_SECURITY_CLOUD' });
      if (!sec?.success) sec = await sendMessage({ type: 'GET_SECURITY_STATUS' });
      if (sec?.success) setSecurity(sec);

      setLoading(false);
      loadBlocked(tab.id);
    })();
  }, [loadBlocked]);

  const applySecurity = async (message) => {
    setBusy(true);
    const res = await sendMessage(message);
    if (res?.success) setSecurity(res);
    setBusy(false);
  };

  const apply = async (message, optimistic) => {
    setBusy(true);
    if (optimistic) setStatus((s) => (s ? { ...s, ...optimistic } : s));
    const res = await sendMessage(message);
    if (res?.success) setStatus(res);
    else {
      const fresh = await sendMessage({ type: 'GET_ADBLOCK_STATUS' });
      if (fresh?.success) setStatus(fresh);
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-500">
        Loading adblocker…
      </div>
    );
  }
  if (!status) {
    return (
      <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
        Adblocker unavailable. Try reloading the extension.
      </div>
    );
  }

  const { enabled, lists, counts, activeRules, allowlist = [] } = status;
  const siteAllowed = domain && allowlist.includes(domain);

  return (
    <div className="space-y-4">
      {/* Master toggle card */}
      <div
        className={`rounded-xl border p-4 transition-colors ${
          enabled ? 'border-primary-200 bg-primary-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                enabled ? 'bg-primary-600 text-white' : 'bg-slate-300 text-slate-600'
              }`}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Adblocker</h3>
              <p className="text-xs text-slate-500">
                {enabled ? `${activeRules.toLocaleString()} filters active` : 'Turned off'}
              </p>
            </div>
          </div>
          <Toggle
            checked={enabled}
            onChange={(v) => apply({ type: 'SET_ADBLOCK_ENABLED', payload: { enabled: v } }, { enabled: v })}
            disabled={busy}
            label="Enable adblocker"
          />
        </div>
      </div>

      {/* Phishing & scam protection — independent of the ad/tracker blocker, so
          it stays on for a site the user has allowlisted for ads. */}
      {security && (
        <div
          className={`rounded-xl border p-4 transition-colors ${
            security.enabled ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  security.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
                }`}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">Scam &amp; phishing</h3>
                <p className="truncate text-xs text-slate-500">
                  {security.enabled
                    ? `${(security.listCount || 0).toLocaleString()} dangerous sites blocked`
                    : 'Turned off'}
                </p>
              </div>
            </div>
            <Toggle
              checked={security.enabled}
              onChange={(v) =>
                applySecurity({ type: 'SET_SECURITY_ENABLED', payload: { enabled: v } })
              }
              disabled={busy}
              label="Enable phishing and scam protection"
            />
          </div>

          {security.enabled && security.bypasses?.length > 0 && (
            <div className="mt-3 border-t border-emerald-200 pt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                Warnings you dismissed
              </p>
              <div className="space-y-1">
                {security.bypasses.map((d) => (
                  <div key={d} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-amber-700">{d}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        applySecurity({
                          type: 'REMOVE_SECURITY_BYPASS',
                          payload: { domain: d },
                        })
                      }
                      className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                    >
                      Re-block
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-site allowlist */}
      {domain ? (
        <div
          className={`flex items-center justify-between rounded-lg border p-3 ${
            siteAllowed ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          } ${enabled ? '' : 'opacity-60'}`}
        >
          <div className="min-w-0 pr-3">
            <p className="text-sm font-medium text-slate-800">
              {siteAllowed ? 'Blocking off for' : 'This site'}
            </p>
            <p className="truncate text-xs text-slate-500">{domain}</p>
          </div>
          <button
            type="button"
            disabled={busy || !enabled}
            onClick={() =>
              apply({
                type: siteAllowed ? 'REMOVE_ADBLOCK_ALLOWLIST' : 'ADD_ADBLOCK_ALLOWLIST',
                payload: { domain },
              })
            }
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              siteAllowed
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {siteAllowed ? 'Re-enable here' : 'Disable on this site'}
          </button>
        </div>
      ) : null}

      {/* Filter lists */}
      <div className="space-y-2">
        <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Filter lists
        </h4>
        {LISTS.map((list) => (
          <div
            key={list.id}
            className={`flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 ${
              enabled ? '' : 'opacity-60'
            }`}
          >
            <div className="min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{list.name}</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {counts[list.id].toLocaleString()} rules
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{list.description}</p>
            </div>
            <Toggle
              checked={Boolean(lists[list.id])}
              onChange={(v) =>
                apply(
                  { type: 'SET_ADBLOCK_LIST', payload: { listId: list.id, enabled: v } },
                  { lists: { ...lists, [list.id]: v } }
                )
              }
              disabled={busy || !enabled}
              label={`Enable ${list.name} list`}
            />
          </div>
        ))}
      </div>

      {/* What the shield actually blocked on this page */}
      {enabled && typeof tabId === 'number' && (
        <BlockedList
          report={blocked}
          busy={blockedBusy}
          onRefresh={() => loadBlocked(tabId)}
        />
      )}

      {/* Allowlisted sites */}
      {allowlist.length > 0 && (
        <div className="space-y-2">
          <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Disabled on {allowlist.length} {allowlist.length === 1 ? 'site' : 'sites'}
          </h4>
          <div className="space-y-1">
            {allowlist.map((d) => (
              <div
                key={d}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="truncate text-xs text-slate-700">{d}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    apply({ type: 'REMOVE_ADBLOCK_ALLOWLIST', payload: { domain: d } })
                  }
                  className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                  aria-label={`Remove ${d} from allowlist`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info footer */}
      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Blocking runs natively in your browser — no page slowdown and no data leaves your device.
        Your settings sync across devices when you're signed in. The number on the toolbar icon
        shows requests blocked on the current tab.
      </p>
    </div>
  );
}
