import React, { useEffect, useRef, useState } from 'react';
import { detectImportKind, inspectOpenCredsFile, parseImport, parseOpenCredsImport } from '@marksyncr/vault';

/**
 * Vault import, on the options page rather than in the popup.
 *
 * The popup could not host this. It is dismissed the moment it loses focus, and
 * a file chooser and a passphrase prompt both take focus; Chrome additionally
 * suppresses JS dialogs in an action popup, so `window.prompt` returned null
 * and the old handler cancelled silently. An import of a large OpenCreds
 * database looked exactly like a crash -- the window vanished, nothing was
 * written, and no message explained why.
 *
 * An options tab has none of those constraints: it survives the file chooser,
 * it can ask for the passphrase in the page, and it stays open long enough to
 * show progress for a database of a few thousand items.
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

/** How often to ask the background how far the import has got. */
const POLL_MS = 400;

export function VaultImport() {
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [header, setHeader] = useState(null);
  const [kind, setKind] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState(null);

  // Stop polling when this page goes away.
  useEffect(() => () => clearInterval(pollRef.current), []);

  const reset = () => {
    setFile(null);
    setText('');
    setHeader(null);
    setKind(null);
    setPassphrase('');
    setAcknowledged(false);
    setJob(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPick = async (event) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    setMessage(null);
    setJob(null);

    const content = await picked.text();
    const detected = detectImportKind(content);

    if (detected === 'unknown') {
      setMessage({ type: 'error', text: 'That file is neither an OpenCreds database nor a CSV export.' });
      reset();
      return;
    }

    setFile(picked);
    setText(content);
    setKind(detected);

    if (detected === 'opencreds') {
      try {
        setHeader(inspectOpenCredsFile(content));
      } catch (err) {
        // The header is authenticated, so a failure here means the file is
        // damaged rather than that the passphrase is wrong.
        setMessage({ type: 'error', text: err.message });
        reset();
      }
    } else {
      setHeader(null);
    }
  };

  const startPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await sendMessage({ type: 'VAULT_IMPORT_PROGRESS' });
      if (!res?.success) return;
      if (!res.job) {
        // The service worker was restarted and lost the job. Say so rather than
        // leaving a progress bar frozen at whatever it last showed.
        clearInterval(pollRef.current);
        setBusy(false);
        setMessage({
          type: 'error',
          text: 'The import was interrupted. Import the same file again to carry on — items already stored are recognised and skipped.',
        });
        return;
      }
      setJob(res.job);
      if (!res.job.running) {
        clearInterval(pollRef.current);
        setBusy(false);
        setMessage(summarise(res.job));
      }
    }, POLL_MS);
  };

  const summarise = (j) => {
    const parts = [`Imported ${j.imported}`];
    if (j.already) parts.push(`${j.already} already in the vault`);
    if (j.failed) parts.push(`${j.failed} failed`);
    return { type: j.failed ? 'error' : 'success', text: `${parts.join(', ')}.` };
  };

  const onImport = async () => {
    if (!text) return;
    setBusy(true);
    setMessage(null);

    let items;
    try {
      if (kind === 'opencreds') {
        const parsed = await parseOpenCredsImport(text, { passphrase });
        items = parsed.items;
      } else {
        const parsed = parseImport(text);
        items = parsed.items;
        if (!items.length) {
          setBusy(false);
          setMessage({ type: 'error', text: parsed.skipped?.[0]?.reason || 'Nothing to import.' });
          return;
        }
      }
    } catch (err) {
      // A wrong passphrase, an altered file and a manifest mismatch all land
      // here, and in every one of them nothing has been written.
      setBusy(false);
      setMessage({ type: 'error', text: err.message });
      return;
    }

    const res = await sendMessage({ type: 'VAULT_IMPORT', payload: { items } });

    if (!res?.success) {
      setBusy(false);
      setMessage({
        type: 'error',
        text: res?.locked ? 'The vault is locked. Unlock it from the toolbar first.' : res?.error || 'Import failed.',
      });
      return;
    }

    if (res.finished) {
      setBusy(false);
      setMessage(summarise({ imported: res.imported, already: res.already || 0, failed: res.failures?.length || 0 }));
      return;
    }

    setJob({ total: res.total, done: 0, imported: 0, already: 0, failed: 0, running: true, failures: [] });
    startPolling();
  };

  const needsPassphrase = kind === 'opencreds' && header?.protected;
  const needsAck = kind === 'opencreds' && header && !header.protected;
  const canImport =
    Boolean(text) && !busy && (!needsPassphrase || passphrase.length > 0) && (!needsAck || acknowledged);

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,.opencreds,.json,application/json,application/vnd.logicsrc.opencreds+json"
        onChange={onPick}
        disabled={busy}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50"
      />

      {file && kind === 'csv' && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">{file.name}</span> — a CSV export. Folders, TOTP seeds and
          anything a CSV has no column for will not be present.
        </p>
      )}

      {file && header && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            <span className="font-medium">{file.name}</span> — OpenCreds {header.opencreds},{' '}
            {header.protected ? 'encrypted' : 'unprotected'}, namespace {header.namespace}.
          </p>
          <p className="mt-1">
            {header.itemCount} {header.itemCount === 1 ? 'item' : 'items'} in {header.folderCount}{' '}
            {header.folderCount === 1 ? 'folder' : 'folders'}
            {header.types
              ? ` (${Object.entries(header.types)
                  .map(([type, n]) => `${n} ${type}`)
                  .join(', ')})`
              : ''}
            .
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The header is authenticated, so these counts cannot be misstated by an altered file.
          </p>
        </div>
      )}

      {needsPassphrase && (
        <label className="block">
          <span className="text-sm font-medium text-slate-900">Export passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            disabled={busy}
            autoComplete="off"
            placeholder="The passphrase the database was exported under"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Not your master password — the passphrase given when the file was exported.
          </span>
        </label>
      )}

      {needsAck && (
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            This file is unprotected — every secret in it is in the clear on disk. Import it anyway.
          </span>
        </label>
      )}

      {job?.running && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-primary-600 transition-all"
              style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {job.done} of {job.total} — {job.imported} imported
            {job.already ? `, ${job.already} already present` : ''}
            {job.failed ? `, ${job.failed} failed` : ''}. You can leave this page open; the import
            continues in the background.
          </p>
        </div>
      )}

      {job && !job.running && job.failures?.length > 0 && (
        <details className="rounded-lg border border-slate-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-slate-800">
            {job.failed} item{job.failed === 1 ? '' : 's'} could not be stored
          </summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {job.failures.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name || 'Untitled'}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onImport}
          disabled={!canImport}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import into vault'}
        </button>
        {file && !busy && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Choose another file
          </button>
        )}
      </div>
    </div>
  );
}
