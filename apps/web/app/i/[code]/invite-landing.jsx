'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';

const COOKIE = 'marksyncr_invite';

export default function InviteLanding({ code, signedIn }) {
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();

  // Keep the code for 30 days so it survives signup and the confirmation link.
  useEffect(() => {
    if (!code) return;
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${secure}`;
  }, [code]);

  if (!signedIn) {
    return (
      <div className="mt-6 space-y-3">
        <Link
          href={`/signup?invite=${encodeURIComponent(code)}`}
          className="block w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          Create your account
        </Link>
        <p className="text-xs text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-primary-600 hover:text-primary-700">
            Sign in
          </Link>{' '}
          (invites are for accounts up to a week old).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {result?.ok ? (
        <p className="text-sm text-green-700">
          {result.bonus === 'granted'
            ? 'Invite accepted. Your Pro days are on your account.'
            : result.bonus === 'pending'
              ? 'Invite accepted. Your Pro days arrive once you confirm your email.'
              : 'Invite accepted.'}{' '}
          <Link href="/dashboard" className="text-primary-600 hover:text-primary-700">
            Go to your dashboard
          </Link>
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await fetch('/api/invites/accept', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ code }),
              });
              const body = await r.json().catch(() => ({}));
              setResult(r.ok ? body : { ok: false, error: body.error ?? 'Could not accept the invite.' });
            })
          }
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? 'Accepting…' : 'Accept invite'}
        </button>
      )}
      {result && !result.ok && <p className="text-sm text-red-600">{result.error}</p>}
    </div>
  );
}
