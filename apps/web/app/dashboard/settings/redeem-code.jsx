'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

const PLAN_LABELS = { free: 'Free', pro: 'Pro', team: 'Team' };

function planLine(view) {
  if (!view || view.plan === 'free') return 'Free plan';
  const label = PLAN_LABELS[view.plan] ?? view.plan;
  return view.currentPeriodEnd
    ? `${label} until ${new Date(view.currentPeriodEnd).toLocaleDateString()}`
    : `${label} (no end date)`;
}

// "Have a code?": redeem a credit code for days of Pro through /api/credits/redeem.
export default function RedeemCode({ initialView }) {
  const [view, setView] = useState(initialView);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Your plan: <span className="font-medium text-slate-900">{planLine(view)}</span>
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setDone(null);
          start(async () => {
            const r = await fetch('/api/credits/redeem', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ code }),
            });
            const body = await r.json().catch(() => ({}));
            if (r.ok && body.ok) {
              setDone(`Redeemed: ${body.days} days of ${PLAN_LABELS[body.plan] ?? body.plan}.`);
              setView(body.subscription);
              setCode('');
            } else {
              setError(body.error ?? 'Could not redeem that code.');
            }
          });
        }}
      >
        <label htmlFor="credit-code" className="block text-sm font-medium text-slate-700">
          Have a code?
        </label>
        <div className="flex gap-2">
          <input
            id="credit-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            maxLength={64}
            required
            placeholder="CR-XXXX-XXXX-XXXX-XXXX"
            className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={pending || !code.trim()}
            className="shrink-0 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? 'Redeeming…' : 'Redeem'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-green-600">{done}</p>}
      </form>
      <p className="text-xs text-slate-500">
        Got an invite code instead? Those are for new accounts and are entered at sign-up. Want to
        invite someone? <Link href="/invites" className="text-primary-600 hover:text-primary-700">Your invites</Link>
      </p>
    </div>
  );
}
