'use client';

import { useEffect, useState } from 'react';

export default function CoinpayIdentity() {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/coinpay/identity', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
    const result = new URLSearchParams(window.location.search).get('coinpay');
    if (result === 'linked') setMessage('CoinPay connected. OpenProfile details were imported where fields were blank.');
    else if (result && result !== 'unavailable') setMessage('CoinPay could not be connected. It may already be linked to another account.');
  }, []);

  async function disconnect() {
    const response = await fetch('/api/coinpay/identity', { method: 'DELETE' });
    if (response.ok) {
      setStatus((current) => ({ ...current, linked: false, identity: null }));
      setMessage('CoinPay disconnected.');
    } else setMessage('Could not disconnect CoinPay.');
  }

  if (!status) return null;
  if (!status.configured) return <p className="text-sm text-slate-500">CoinPay connection is not configured on this deployment.</p>;

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">CoinPay</h2>
      {status.linked ? (
        <>
          <p className="text-sm text-slate-600">
            Connected{status.identity?.name ? ` as ${status.identity.name}` : ''}.
            {status.identity?.openprofile_url ? (
              <> OpenProfile: <a className="underline" href={status.identity.openprofile_url} target="_blank" rel="noreferrer">view profile</a>.</>
            ) : null}
          </p>
          <button className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm" type="button" onClick={disconnect}>
            Disconnect CoinPay
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">Connect CoinPay to import your OpenProfile details into your private contact profile.</p>
          <a className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" href="/api/coinpay/connect">
            Connect CoinPay
          </a>
        </>
      )}
      {message ? <p className="mt-3 text-sm text-slate-600" role="status">{message}</p> : null}
    </section>
  );
}
