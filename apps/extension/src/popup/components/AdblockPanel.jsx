import React, { useEffect, useState } from 'react';

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

/** Read the active tab's hostname (needs activeTab, granted while the popup is open). */
async function getActiveDomain() {
  const api = getExtApi();
  if (!api?.tabs?.query) return '';
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const url = tabs?.[0]?.url || '';
    if (!url.startsWith('http')) return ''; // skip chrome://, about:, etc.
    return normalizeDomain(url);
  } catch {
    return '';
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

export function AdblockPanel() {
  const [status, setStatus] = useState(null);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setDomain(await getActiveDomain());
      // Pull cross-device prefs from the cloud (no-op if signed out), which
      // returns fresh status; fall back to local status if it fails.
      let res = await sendMessage({ type: 'SYNC_ADBLOCK_CLOUD' });
      if (!res?.success) res = await sendMessage({ type: 'GET_ADBLOCK_STATUS' });
      if (res?.success) setStatus(res);
      setLoading(false);
    })();
  }, []);

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
