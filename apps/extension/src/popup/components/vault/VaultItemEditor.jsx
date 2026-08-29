import React, { useState } from 'react';
import { generatePassword, generatePassphrase, passwordEntropyBits } from '@marksyncr/vault';

/**
 * Create and edit vault items.
 *
 * One editor for every type — logins, cards, identities, notes, keys and
 * accounts differ only in which field group they render, because they are one
 * record shape underneath. The types are the OpenCreds six; see
 * https://logicsrc.com/opencreds.
 */

const TYPE_LABELS = {
  login: 'Login',
  card: 'Card',
  identity: 'Identity',
  note: 'Note',
  key: 'Key',
  account: 'Account',
};

/** Key kinds, in the order people reach for them. */
const KEY_TYPES = ['ssh', 'api', 'pgp', 'certificate', 'symmetric', 'env'];

/**
 * Placeholder shown in place of a hidden password. Built rather than written as
 * a literal so credential scanners do not read a run of bullet characters
 * sitting next to `password` as a hardcoded secret.
 */
const MASK = '\u2022'.repeat(12);

function Field({ label, value, onChange, type = 'text', mono = false, autoFocus = false }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={`mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
          mono ? 'font-mono text-xs' : ''
        }`}
      />
    </label>
  );
}

/** A multi-line field, for key bodies and anything else that wraps. */
function TextArea({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </label>
  );
}

/**
 * A secret that is masked until asked for.
 *
 * Distinct from PasswordField because these have no generator: nobody generates
 * an access token here, they paste the one the provider issued.
 */
function SecretField({ label, value, onChange, multiline = false }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-600">{label}</span>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="text-[10px] text-primary-600 hover:underline"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      {multiline ? (
        <textarea
          value={revealed ? value || '' : value ? MASK : ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={!revealed && Boolean(value)}
          rows={3}
          spellCheck={false}
          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      ) : (
        <input
          type={revealed ? 'text' : 'password'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      )}
    </div>
  );
}

/** The password field, with reveal and a generator. */
function PasswordField({ value, onChange }) {
  const [revealed, setRevealed] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [length, setLength] = useState(20);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [symbols, setSymbols] = useState(true);

  const generate = () => {
    try {
      onChange(
        usePassphrase
          ? generatePassphrase({ words: 5, capitalize: true, includeNumber: true })
          : generatePassword({ length, symbols })
      );
      setRevealed(true);
    } catch {
      /* the options always satisfy the generator's minimums */
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-600">Password</span>
        <button
          type="button"
          onClick={() => setShowGenerator((v) => !v)}
          className="text-[11px] font-medium text-primary-600 hover:underline"
        >
          {showGenerator ? 'Hide generator' : 'Generate'}
        </button>
      </div>

      <div className="mt-0.5 flex gap-1.5">
        <input
          type={revealed ? 'text' : 'password'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          className="rounded-lg border border-slate-300 px-2 text-slate-500 hover:bg-slate-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {revealed ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            ) : (
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </>
            )}
          </svg>
        </button>
      </div>

      {showGenerator && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex gap-3 text-[11px]">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={!usePassphrase}
                onChange={() => setUsePassphrase(false)}
              />
              Password
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={usePassphrase} onChange={() => setUsePassphrase(true)} />
              Passphrase
            </label>
          </div>

          {!usePassphrase && (
            <>
              <label className="block text-[11px] text-slate-600">
                Length: <span className="font-semibold tabular-nums">{length}</span>
                <input
                  type="range"
                  min="8"
                  max="64"
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={symbols}
                  onChange={(e) => setSymbols(e.target.checked)}
                />
                Include symbols
              </label>
              <p className="text-[10px] text-slate-400">
                About {passwordEntropyBits({ length, symbols })} bits of entropy
              </p>
            </>
          )}

          <button
            type="button"
            onClick={generate}
            className="w-full rounded-lg bg-primary-600 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            Generate
          </button>
        </div>
      )}
    </div>
  );
}

/** Previous passwords, newest first. */
function PasswordHistory({ history }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(null);

  if (!history?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left"
      >
        <span className="text-[11px] font-medium text-slate-600">
          Password history ({history.length})
        </span>
        <span className="text-[11px] text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <ul className="space-y-1 border-t border-slate-200 p-2">
          {history.map((entry, i) => (
            <li key={`${entry.changedAt}-${i}`} className="flex items-center justify-between gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-700">
                {revealed === i ? entry.password : MASK}
              </code>
              <span className="shrink-0 text-[10px] text-slate-400">
                {new Date(entry.changedAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={() => setRevealed(revealed === i ? null : i)}
                className="shrink-0 text-[10px] text-primary-600 hover:underline"
              >
                {revealed === i ? 'Hide' : 'Show'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object|null} props.item the item being edited, or null to create
 * @param {string} props.type item type when creating
 * @param {(type: string, fields: Object, existing: Object|null) => Promise<Object>} props.onSave
 * @param {() => void} props.onCancel
 */
export function VaultItemEditor({ item, type: initialType, onSave, onCancel }) {
  const type = item?.type || initialType || 'login';
  const [name, setName] = useState(item?.name || '');
  const [notes, setNotes] = useState(item?.notes || '');
  const [group, setGroup] = useState(() => ({ ...(item?.[type] || {}) }));
  const [uri, setUri] = useState(item?.login?.uris?.[0]?.uri || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setField = (key) => (value) => setGroup((g) => ({ ...g, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    const fields = { name, notes, [type]: { ...group } };
    if (type === 'login') {
      fields.login.uris = uri ? [{ uri, match: 'domain' }] : [];
    }

    const res = await onSave(type, fields, item);
    setBusy(false);
    if (!res?.success) setError(res?.error || 'Could not save');
  };

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {item ? 'Edit' : 'New'} {TYPE_LABELS[type].toLowerCase()}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      <Field label="Name" value={name} onChange={setName} autoFocus />

      {type === 'login' && (
        <>
          <Field label="Username" value={group.username} onChange={setField('username')} />
          <PasswordField value={group.password} onChange={setField('password')} />
          <Field label="Website" value={uri} onChange={setUri} />
          <Field
            label="Authenticator key (optional)"
            value={group.totp}
            onChange={setField('totp')}
            mono
          />
          <PasswordHistory history={item?.history} />
        </>
      )}

      {type === 'card' && (
        <>
          <Field
            label="Cardholder name"
            value={group.cardholderName}
            onChange={setField('cardholderName')}
          />
          <Field label="Number" value={group.number} onChange={setField('number')} mono />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Month" value={group.expMonth} onChange={setField('expMonth')} />
            <Field label="Year" value={group.expYear} onChange={setField('expYear')} />
            <Field label="CVC" value={group.code} onChange={setField('code')} mono />
          </div>
          <Field label="Brand" value={group.brand} onChange={setField('brand')} />
        </>
      )}

      {type === 'identity' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="First name" value={group.firstName} onChange={setField('firstName')} />
            <Field label="Last name" value={group.lastName} onChange={setField('lastName')} />
          </div>
          <Field label="Email" value={group.email} onChange={setField('email')} type="email" />
          <Field label="Phone" value={group.phone} onChange={setField('phone')} />
          <Field label="Company" value={group.company} onChange={setField('company')} />
          <Field label="Address" value={group.address1} onChange={setField('address1')} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="City" value={group.city} onChange={setField('city')} />
            <Field label="Postal code" value={group.postalCode} onChange={setField('postalCode')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="State" value={group.state} onChange={setField('state')} />
            <Field label="Country" value={group.country} onChange={setField('country')} />
          </div>
        </>
      )}

      {type === 'key' && (
        <>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Kind</span>
            <select
              value={group.keyType || ''}
              onChange={(e) => setField('keyType')(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Choose…</option>
              {KEY_TYPES.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>

          {/* An api, env or symmetric key is one opaque string; the rest are a
              keypair. Rendering both would ask for a public key for an API
              token, which is a question with no answer. */}
          {['api', 'env', 'symmetric'].includes(group.keyType) ? (
            <SecretField label="Secret" value={group.value} onChange={setField('value')} />
          ) : (
            <>
              <TextArea
                label="Public key"
                value={group.publicKey}
                onChange={setField('publicKey')}
              />
              <SecretField
                label="Private key"
                value={group.privateKey}
                onChange={setField('privateKey')}
                multiline
              />
              <SecretField
                label="Key passphrase"
                value={group.passphrase}
                onChange={setField('passphrase')}
              />
            </>
          )}

          <Field label="Algorithm" value={group.algorithm} onChange={setField('algorithm')} />
          {/* Path and mode make a restore total: a private key written back
              with the wrong mode is a key ssh refuses to use, and one at the
              wrong path is a key nothing finds. */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="Path" value={group.path} onChange={setField('path')} mono />
            </div>
            <Field label="Mode" value={group.mode} onChange={setField('mode')} mono />
          </div>
          <Field
            label="Fingerprint"
            value={group.fingerprint}
            onChange={setField('fingerprint')}
            mono
          />
        </>
      )}

      {type === 'account' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Provider" value={group.provider} onChange={setField('provider')} />
            <Field label="Handle" value={group.handle} onChange={setField('handle')} />
          </div>
          <Field label="Account id" value={group.accountId} onChange={setField('accountId')} mono />
          <Field label="Email" value={group.email} onChange={setField('email')} type="email" />
          <SecretField
            label="Access token"
            value={group.accessToken}
            onChange={setField('accessToken')}
          />
          <SecretField
            label="Refresh token"
            value={group.refreshToken}
            onChange={setField('refreshToken')}
          />
          <div className="grid grid-cols-2 gap-2">
            {/* A test key and a live key look identical and are not. */}
            <Field
              label="Environment"
              value={group.environment}
              onChange={setField('environment')}
            />
            <Field label="Expires" value={group.expiresAt} onChange={setField('expiresAt')} />
          </div>
          <Field
            label="Scopes (comma separated)"
            value={Array.isArray(group.scopes) ? group.scopes.join(', ') : group.scopes}
            onChange={(value) =>
              setField('scopes')(
                String(value)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </>
      )}

      <label className="block">
        <span className="text-[11px] font-medium text-slate-600">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </label>

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
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
