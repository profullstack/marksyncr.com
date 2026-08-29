import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseImport } from '@marksyncr/vault';
import { VaultUnlock } from './vault/VaultUnlock.jsx';
import { VaultItemEditor } from './vault/VaultItemEditor.jsx';

/**
 * The Vault tab.
 *
 * This component never holds a key. It sends messages to the background, which
 * owns the unlocked key and does every encrypt and decrypt — so a bug here can
 * leak what is on screen, but not the vault.
 */

/** How long a copied secret stays on the clipboard before being cleared. */
const CLIPBOARD_CLEAR_MS = 30_000;

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

const TYPE_META = {
  login: { label: 'Login', badge: 'bg-sky-50 text-sky-700' },
  card: { label: 'Card', badge: 'bg-violet-50 text-violet-700' },
  identity: { label: 'Identity', badge: 'bg-amber-50 text-amber-700' },
  note: { label: 'Note', badge: 'bg-slate-100 text-slate-600' },
};

/** Search across the fields a person would actually search by. */
export function filterItems(items, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const haystack = [
      item.name,
      item.notes,
      item.login?.username,
      item.login?.uris?.[0]?.uri,
      item.identity?.email,
      item.identity?.firstName,
      item.identity?.lastName,
      item.card?.cardholderName,
      item.card?.brand,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Copy a secret, then clear it from the clipboard after a delay. */
async function copySecret(value, onCopied) {
  try {
    await navigator.clipboard.writeText(value);
    onCopied();
    setTimeout(() => {
      // Best effort: only clear if the clipboard still holds what we put there,
      // so we never wipe something the user copied in the meantime.
      navigator.clipboard
        .readText()
        .then((current) => {
          if (current === value) navigator.clipboard.writeText('');
        })
        .catch(() => {
          /* read permission denied — leave the clipboard alone */
        });
    }, CLIPBOARD_CLEAR_MS);
  } catch {
    onCopied('Could not copy');
  }
}

function ItemRow({ item, trash, onOpen, onCopy, onTrash, onRestore, onDelete }) {
  const meta = TYPE_META[item.type] || TYPE_META.note;
  const subtitle =
    item.login?.username ||
    item.identity?.email ||
    (item.card?.number ? `•••• ${item.card.number.slice(-4)}` : '') ||
    '';

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="min-w-0 flex-1 text-left"
        title={item.name}
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-800">
            {item.name || 'Untitled'}
          </span>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </button>

      {!trash && item.type === 'login' && item.login?.password && (
        <button
          type="button"
          onClick={() => onCopy(item.login.password)}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={`Copy password for ${item.name}`}
          title="Copy password"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
      )}

      {trash ? (
        <>
          <button
            type="button"
            onClick={() => onRestore(item)}
            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onTrash(item)}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Move ${item.name} to trash`}
          title="Move to trash"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export function VaultPanel() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [failed, setFailed] = useState([]);
  const [query, setQuery] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [editing, setEditing] = useState(null); // { item } | { type }
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    const res = await sendMessage({ type: 'VAULT_STATUS' });
    if (res?.success) setStatus(res);
    return res;
  }, []);

  const loadItems = useCallback(async (trash) => {
    const res = await sendMessage({ type: 'VAULT_LIST', payload: { trash } });
    if (res?.success) {
      setItems(res.items || []);
      setFailed(res.failed || []);
    } else if (res?.locked) {
      setStatus((s) => (s ? { ...s, unlocked: false } : s));
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await refreshStatus();
      if (res?.unlocked) await loadItems(false);
      setLoading(false);
    })();
  }, [refreshStatus, loadItems]);

  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const onUnlocked = async () => {
    await refreshStatus();
    await loadItems(showTrash);
  };

  const onSave = async (type, fields, existing) => {
    const res = await sendMessage({
      type: 'VAULT_SAVE_ITEM',
      payload: { type, fields, existing },
    });
    if (res?.success) {
      setEditing(null);
      await loadItems(showTrash);
      notify('Saved');
    }
    return res;
  };

  const onTrash = async (item) => {
    const res = await sendMessage({ type: 'VAULT_TRASH_ITEM', payload: { id: item.id } });
    if (res?.success) {
      await loadItems(showTrash);
      notify('Moved to trash');
    } else notify(res?.error || 'Could not move to trash');
  };

  const onRestore = async (item) => {
    const res = await sendMessage({ type: 'VAULT_RESTORE_ITEM', payload: { id: item.id } });
    if (res?.success) {
      await loadItems(showTrash);
      notify('Restored');
    } else notify(res?.error || 'Could not restore');
  };

  const onDelete = async (item) => {
    const res = await sendMessage({ type: 'VAULT_DELETE_ITEM', payload: { id: item.id } });
    if (res?.success) {
      await loadItems(showTrash);
      notify('Deleted permanently');
    } else notify(res?.error || 'Could not delete');
  };

  const onLock = async () => {
    await sendMessage({ type: 'VAULT_LOCK' });
    setItems([]);
    await refreshStatus();
  };

  const onImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    const text = await file.text();
    const { source, items: parsed, skipped } = parseImport(text);

    if (!parsed.length) {
      notify(skipped[0]?.reason || 'Nothing to import');
      return;
    }

    const res = await sendMessage({ type: 'VAULT_IMPORT', payload: { items: parsed } });
    if (res?.success) {
      await loadItems(showTrash);
      notify(`Imported ${res.imported} from ${source}`);
    } else {
      notify(res?.error || 'Import failed');
    }
  };

  const visible = useMemo(() => filterItems(items, query), [items, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-500">
        Loading vault…
      </div>
    );
  }

  if (status?.sessionSupported === false) {
    return (
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        This browser cannot hold an unlocked vault safely in memory, so the vault is unavailable
        here.
      </div>
    );
  }

  if (!status?.unlocked) {
    return (
      <VaultUnlock
        exists={Boolean(status?.exists)}
        onSetup={(password) => sendMessage({ type: 'VAULT_SETUP', payload: { password } })}
        onUnlock={(password) => sendMessage({ type: 'VAULT_UNLOCK', payload: { password } })}
        onRecover={(recoveryKey, newPassword) =>
          sendMessage({ type: 'VAULT_RECOVER', payload: { recoveryKey, newPassword } })
        }
        onUnlocked={onUnlocked}
      />
    );
  }

  if (editing) {
    return (
      <VaultItemEditor
        item={editing.item || null}
        type={editing.type}
        onSave={onSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={showTrash ? 'Search trash…' : 'Search vault…'}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="button"
          onClick={onLock}
          className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Lock the vault"
        >
          Lock
        </button>
      </div>

      {!showTrash && (
        <div className="flex gap-1.5">
          {['login', 'card', 'identity'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEditing({ type })}
              className="flex-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-medium text-slate-600 hover:border-primary-400 hover:text-primary-700"
            >
              + {TYPE_META[type].label}
            </button>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {failed.length} {failed.length === 1 ? 'item' : 'items'} could not be decrypted and are
          hidden.
        </p>
      )}

      <div className="space-y-1.5">
        {visible.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
            {query
              ? 'Nothing matches that search.'
              : showTrash
                ? 'The trash is empty.'
                : 'Your vault is empty. Add a login, or import from another manager.'}
          </p>
        ) : (
          visible.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              trash={showTrash}
              onOpen={(it) => setEditing({ item: it })}
              onCopy={(value) => copySecret(value, (err) => notify(err || 'Password copied'))}
              onTrash={onTrash}
              onRestore={onRestore}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-2">
        <button
          type="button"
          onClick={async () => {
            const next = !showTrash;
            setShowTrash(next);
            setQuery('');
            await loadItems(next);
          }}
          className="text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          {showTrash ? '← Back to vault' : 'Trash'}
        </button>

        {!showTrash && (
          <label className="cursor-pointer text-xs font-medium text-primary-600 hover:underline">
            Import
            <input type="file" accept=".csv,text/csv" onChange={onImport} className="hidden" />
          </label>
        )}
      </div>

      {toast && (
        <p className="rounded-lg bg-slate-800 px-3 py-2 text-center text-xs text-white" role="status">
          {toast}
        </p>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        Everything here is encrypted on this device before it is saved. MarkSyncr cannot read your
        vault, and cannot reset your vault password. Copied passwords clear from the clipboard after
        30 seconds.
      </p>
    </div>
  );
}
