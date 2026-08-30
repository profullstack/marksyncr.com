import React, { useState } from 'react';

/**
 * The locked state: set up a new vault, unlock an existing one, or get back in
 * with a recovery key.
 *
 * Nothing typed here is stored or sent. The password goes to the background,
 * which derives a key from it and keeps only the key — see
 * background/vault-session.js.
 */

/** Rough strength read, shown while choosing a master password. */
export function assessPassword(password) {
  const value = String(password || '');
  if (value.length === 0) return { score: 0, label: '', hint: '' };

  // Length still dominates the rating, but it no longer gates anything: a short
  // master password reads as weak and is accepted all the same.
  if (value.length < 8) {
    return { score: 1, label: 'Weak', hint: 'Short passwords are easy to guess' };
  }

  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 16) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (score <= 2) return { score: 2, label: 'Weak', hint: 'Add length, or a mix of characters' };
  if (score === 3) return { score: 3, label: 'Fair', hint: '' };
  if (score === 4) return { score: 4, label: 'Good', hint: '' };
  return { score: 5, label: 'Strong', hint: '' };
}

const STRENGTH_COLORS = ['bg-slate-200', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];

function StrengthMeter({ password }) {
  const { score, label, hint } = assessPassword(password);
  if (!password) return null;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((step) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full ${step <= score ? STRENGTH_COLORS[score] : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {label}
        {hint ? ` — ${hint}` : ''}
      </p>
    </div>
  );
}

/**
 * Shown once, immediately after a vault is created. The key cannot be shown
 * again: the server only holds it wrapped, so nobody — including us — can
 * recover it later.
 */
function RecoveryKeyNotice({ recoveryKey, onDone }) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — the key is on screen to copy by hand */
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <h3 className="text-sm font-semibold text-amber-900">Save your recovery key</h3>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          This is the only way back into your vault if you forget your password. It is shown once
          and cannot be shown again — we store it encrypted and cannot read it.
        </p>
      </div>

      <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
        <code className="block break-all text-center font-mono text-sm font-semibold tracking-wide text-slate-800">
          {recoveryKey}
        </code>
      </div>

      <button
        type="button"
        onClick={copy}
        className="w-full rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {copied ? 'Copied' : 'Copy to clipboard'}
      </button>

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>I have saved this recovery key somewhere safe</span>
      </label>

      <button
        type="button"
        disabled={!confirmed}
        onClick={onDone}
        className="w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue to my vault
      </button>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {boolean} props.exists whether a vault has been created for this account
 * @param {(password: string) => Promise<Object>} props.onSetup
 * @param {(password: string) => Promise<Object>} props.onUnlock
 * @param {(recoveryKey: string, newPassword: string) => Promise<Object>} props.onRecover
 * @param {() => void} props.onUnlocked
 */
export function VaultUnlock({ exists, onSetup, onUnlock, onRecover, onUnlocked }) {
  const [mode, setMode] = useState(exists ? 'unlock' : 'setup');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newRecoveryKey, setNewRecoveryKey] = useState('');

  if (newRecoveryKey) {
    return <RecoveryKeyNotice recoveryKey={newRecoveryKey} onDone={onUnlocked} />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    let res;
    if (mode === 'setup') {
      if (password.length === 0) {
        setError('Enter a master password');
        setBusy(false);
        return;
      }
      if (password !== confirm) {
        setError('The two passwords do not match');
        setBusy(false);
        return;
      }
      res = await onSetup(password);
      if (res?.success && res.recoveryKey) {
        setNewRecoveryKey(res.recoveryKey);
        setBusy(false);
        return;
      }
    } else if (mode === 'recover') {
      if (password.length === 0) {
        setError('Enter a master password');
        setBusy(false);
        return;
      }
      res = await onRecover(recoveryKey, password);
    } else {
      res = await onUnlock(password);
    }

    setBusy(false);
    if (res?.success) {
      setPassword('');
      setConfirm('');
      onUnlocked();
    } else {
      setError(res?.error || 'Something went wrong');
    }
  };

  const heading =
    mode === 'setup'
      ? 'Create your vault'
      : mode === 'recover'
        ? 'Use your recovery key'
        : 'Unlock your vault';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col items-center py-2 text-center">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">{heading}</h3>
        <p className="mt-1 px-2 text-xs leading-relaxed text-slate-500">
          {mode === 'setup'
            ? 'Your vault password is separate from your MarkSyncr password and never leaves this device. We cannot reset it.'
            : mode === 'recover'
              ? 'Enter the recovery key you saved, then choose a new vault password.'
              : 'Enter your vault password to unlock.'}
        </p>
      </div>

      {mode === 'recover' && (
        <div>
          <label htmlFor="vault-recovery" className="text-xs font-medium text-slate-700">
            Recovery key
          </label>
          <input
            id="vault-recovery"
            type="text"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXXX-XXXXX-XXXXX-…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      )}

      <div>
        <label htmlFor="vault-password" className="text-xs font-medium text-slate-700">
          {mode === 'unlock' ? 'Vault password' : 'New vault password'}
        </label>
        <input
          id="vault-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'}
          autoFocus
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        {mode !== 'unlock' && <StrengthMeter password={password} />}
      </div>

      {mode === 'setup' && (
        <div>
          <label htmlFor="vault-confirm" className="text-xs font-medium text-slate-700">
            Confirm password
          </label>
          <input
            id="vault-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-primary-600 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {busy ? 'Working…' : mode === 'setup' ? 'Create vault' : mode === 'recover' ? 'Recover vault' : 'Unlock'}
      </button>

      {exists && (
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'recover' ? 'unlock' : 'recover');
            setError('');
          }}
          className="w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
        >
          {mode === 'recover' ? 'Back to unlock' : 'Forgot your vault password?'}
        </button>
      )}
    </form>
  );
}
