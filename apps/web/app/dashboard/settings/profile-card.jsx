'use client';

import { useEffect, useState, useTransition } from 'react';
import { ProfileFields } from '@profullstack/profile/react';

const FIELDS = ['email', 'first_name', 'last_name', 'company_domain', 'job_title', 'linkedin_url'];

// Profile fields shared across Profullstack properties, read and written
// through /api/v1/me/profile.
export default function ProfileCard() {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    fetch('/api/v1/me/profile', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const p = body?.profile ?? {};
        setValues(Object.fromEntries(FIELDS.map((k) => [k, p[k] ?? ''])));
      })
      .catch(() => setError('Could not load your profile.'))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        setError(null);
        setErrors({});
        start(async () => {
          const r = await fetch('/api/v1/me/profile', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(values),
          });
          const body = await r.json().catch(() => ({}));
          if (r.ok) setSaved(true);
          else {
            setErrors(body.errors ?? {});
            setError(body.error ?? 'Could not save.');
          }
        });
      }}
    >
      <ProfileFields
        idPrefix="settings-"
        values={values}
        onChange={setValues}
        errors={errors}
        disabled={!loaded}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !loaded}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save profile'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </form>
  );
}
