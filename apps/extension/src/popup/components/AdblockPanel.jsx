import React, { useEffect, useState } from 'react';

/**
 * Get the extension messaging API (Chrome or Firefox), or null in a plain
 * web/dev context where it isn't available.
 */
function getRuntime() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) return chrome.runtime;
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) return browser.runtime;
  return null;
}

async function sendMessage(message) {
  const runtime = getRuntime();
  if (!runtime) return { success: false, error: 'Extension API unavailable' };
  return runtime.sendMessage(message);
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
  {
    id: 'ads',
    name: 'Ads',
    description: 'Blocks ad servers & banners (EasyList)',
  },
  {
    id: 'privacy',
    name: 'Trackers',
    description: 'Blocks trackers & analytics (EasyPrivacy)',
  },
];

export function AdblockPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const res = await sendMessage({ type: 'GET_ADBLOCK_STATUS' });
    if (res?.success) setStatus(res);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleMasterToggle = async (enabled) => {
    setBusy(true);
    // Optimistic update
    setStatus((s) => (s ? { ...s, enabled } : s));
    const res = await sendMessage({ type: 'SET_ADBLOCK_ENABLED', payload: { enabled } });
    if (res?.success) setStatus(res);
    else await refresh();
    setBusy(false);
  };

  const handleListToggle = async (listId, enabled) => {
    setBusy(true);
    setStatus((s) => (s ? { ...s, lists: { ...s.lists, [listId]: enabled } } : s));
    const res = await sendMessage({
      type: 'SET_ADBLOCK_LIST',
      payload: { listId, enabled },
    });
    if (res?.success) setStatus(res);
    else await refresh();
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

  const { enabled, lists, counts, activeRules } = status;

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
            onChange={handleMasterToggle}
            disabled={busy}
            label="Enable adblocker"
          />
        </div>
      </div>

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
              onChange={(v) => handleListToggle(list.id, v)}
              disabled={busy || !enabled}
              label={`Enable ${list.name} list`}
            />
          </div>
        ))}
      </div>

      {/* Info footer */}
      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Blocking runs natively in your browser — no page slowdown and no data leaves your device.
        The number on the toolbar icon shows requests blocked on the current tab.
      </p>
    </div>
  );
}
