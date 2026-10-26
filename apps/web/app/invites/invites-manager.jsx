'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

const STATUS = {
  open: 'Open',
  used: 'Joined',
  expired: 'Expired',
  revoked: 'Withdrawn',
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function InvitesManager() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const r = await fetch('/api/invites', { credentials: 'same-origin', cache: 'no-store' });
    const body = await r.json().catch(() => ({}));
    if (r.ok) setData(body);
    else setError(body.error ?? 'Could not load your invites.');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data && !error) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Send an invite</h2>
          <p className="text-sm text-slate-600 mb-4">
            {data.quota.left} of {data.quota.total} left.
          </p>
          {!data.canInvite ? (
            <p className="text-sm text-slate-600">
              Invites unlock once your account is a week old
              {data.unlocksAt ? ` (${new Date(data.unlocksAt).toLocaleDateString()})` : ''}.
            </p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setFresh(null);
                start(async () => {
                  const r = await fetch('/api/invites', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ note }),
                  });
                  const body = await r.json().catch(() => ({}));
                  if (r.ok) {
                    setFresh(body);
                    setNote('');
                    await load();
                  } else setError(body.error ?? 'Could not create an invite.');
                });
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Who is it for? (only you see this)"
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={pending || data.quota.left < 1}
                className="shrink-0 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {pending ? 'Creating…' : 'Create invite'}
              </button>
            </form>
          )}
          {fresh && (
            <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm text-green-800">
              <p className="mb-2">
                Send this link. The code is shown only now, so copy it before you leave the page.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-white px-2 py-1 text-slate-900">{fresh.url}</code>
                <CopyButton text={fresh.url} />
              </div>
            </div>
          )}
        </section>
      )}

      {data && data.invites.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Your invites</h2>
          <ul className="divide-y divide-slate-100">
            {data.invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{i.note || 'Invite'}</p>
                  <p className="text-xs text-slate-500">
                    {STATUS[i.status] ?? i.status}
                    {i.status === 'used' && i.usedByName ? `: ${i.usedByName}` : ''}
                    {i.status === 'used' && i.bonus === 'granted'
                      ? ` · +${data.bonusDays} days of Pro`
                      : ''}
                    {i.status === 'used' && i.bonus === 'pending' ? ' · bonus once they confirm their email' : ''}
                    {i.status === 'open' && i.expiresAt
                      ? ` · expires ${new Date(i.expiresAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                {i.status === 'open' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await fetch(`/api/invites/${encodeURIComponent(i.id)}`, {
                          method: 'DELETE',
                          credentials: 'same-origin',
                        });
                        if (!r.ok) {
                          const body = await r.json().catch(() => ({}));
                          setError(body.error ?? 'Could not withdraw that invite.');
                        }
                        await load();
                      })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Your link</h2>
          <p className="text-sm text-slate-600 mb-3">
            Share MarkSyncr anywhere with your own link. Sign-ups through it are recorded as yours.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <code className="break-all rounded bg-slate-50 px-2 py-1 text-slate-900">{data.affiliateUrl}</code>
            <CopyButton text={data.affiliateUrl} />
          </div>
        </section>
      )}
    </div>
  );
}
