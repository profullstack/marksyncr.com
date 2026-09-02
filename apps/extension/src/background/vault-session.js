/**
 * MarkSyncr Vault — unlock session and item operations.
 *
 * All vault crypto happens here, in the background, and the popup never holds a
 * key: it sends a message and gets back either plaintext items or an error.
 *
 * The unlocked user key lives in `chrome.storage.session`, which matters under
 * MV3 for a specific reason. The service worker is killed after ~30 seconds
 * idle, so a module-level variable holding the key would be lost between one
 * popup opening and the next — the vault would appear to lock itself at random.
 * Session storage is memory-only, never written to disk, cleared when the
 * browser closes, and survives service-worker restarts within a session, which
 * is exactly the lifetime a vault unlock should have.
 *
 * Auto-lock runs off `chrome.alarms` rather than setTimeout for the same
 * reason: a timer dies with the worker, an alarm does not.
 */

import browser from 'webextension-polyfill';
import {
  createVault,
  unlockVault,
  unlockWithRecoveryKey,
  rewrapUserKey,
  createItem,
  recordPasswordChange,
  encryptItem,
  decryptItems,
  toBase64,
  fromBase64,
  ITEM_TYPE,
  ITEM_TYPE_NAME,
} from '@marksyncr/vault';
import {
  fetchVaultMeta,
  saveVaultMeta,
  fetchVaultItems,
  createVaultItem,
  updateVaultItem,
  patchVaultItem,
  deleteVaultItem,
} from '../lib/vault-api.js';

/** Where the unlocked key lives. Session storage only — never storage.local. */
const SESSION_KEY = 'vault-user-key';
/** Local, non-secret preferences. */
const PREFS_KEY = 'vault-prefs';
const LOCK_ALARM_NAME = 'marksyncr-vault-autolock';

/** Auto-lock choices offered in the UI, in minutes. 0 means "never". */
export const LOCK_TIMEOUT_OPTIONS = [1, 5, 15, 30, 60, 0];
const DEFAULT_LOCK_MINUTES = 15;

/**
 * Session storage is memory-only but still shared across extension contexts, so
 * restrict it to trusted ones. Content scripts must never be able to read the
 * vault key — this is the setting that guarantees it, and Phase 3's autofill
 * will add content scripts.
 */
async function hardenSessionStorage() {
  try {
    await browser.storage.session?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    /* not supported everywhere; TRUSTED_CONTEXTS is already the default */
  }
}

/** @returns {Promise<{lockMinutes: number}>} */
export async function getVaultPrefs() {
  const stored = await browser.storage.local.get(PREFS_KEY);
  const prefs = stored?.[PREFS_KEY] || {};
  return {
    lockMinutes: Number.isFinite(prefs.lockMinutes) ? prefs.lockMinutes : DEFAULT_LOCK_MINUTES,
  };
}

/** @param {{lockMinutes: number}} prefs */
export async function setVaultPrefs(prefs) {
  await browser.storage.local.set({ [PREFS_KEY]: prefs });
  await scheduleAutoLock();
  return prefs;
}

/** The unlocked user key, or null when locked. */
async function getSessionKey() {
  if (!browser.storage.session) return null;
  const stored = await browser.storage.session.get(SESSION_KEY);
  const b64 = stored?.[SESSION_KEY];
  return b64 ? fromBase64(b64) : null;
}

/** @param {Uint8Array} userKey */
async function setSessionKey(userKey) {
  await hardenSessionStorage();
  await browser.storage.session.set({ [SESSION_KEY]: toBase64(userKey) });
  await scheduleAutoLock();
}

/** Re-arm the auto-lock alarm from now. */
async function scheduleAutoLock() {
  const { lockMinutes } = await getVaultPrefs();
  try {
    await browser.alarms.clear(LOCK_ALARM_NAME);
    if (lockMinutes > 0) {
      await browser.alarms.create(LOCK_ALARM_NAME, { delayInMinutes: lockMinutes });
    }
  } catch (err) {
    console.warn('[MarkSyncr] Could not schedule vault auto-lock:', err?.message);
  }
}

/** True when the alarm belongs to this module. */
export function isVaultLockAlarm(alarmName) {
  return alarmName === LOCK_ALARM_NAME;
}

/** Forget the key. Called by the alarm, by sign-out, and by the Lock button. */
export async function lockVault() {
  try {
    await browser.storage.session?.remove(SESSION_KEY);
  } catch {
    /* already gone */
  }
  try {
    await browser.alarms.clear(LOCK_ALARM_NAME);
  } catch {
    /* ignore */
  }
  return { success: true, unlocked: false };
}

/**
 * Whether a vault exists for this account and whether it is currently open.
 * @returns {Promise<Object>}
 */
export async function getVaultStatus() {
  const [key, prefs] = await Promise.all([getSessionKey(), getVaultPrefs()]);

  // A locked vault still needs to know whether one exists, to choose between
  // "unlock" and "set up" — but that is the only reason to call the API here.
  let exists = null;
  if (!key) {
    const meta = await fetchVaultMeta().catch(() => null);
    exists = meta ? Boolean(meta.exists) : null;
  } else {
    exists = true;
  }

  return {
    success: true,
    exists,
    unlocked: Boolean(key),
    lockMinutes: prefs.lockMinutes,
    sessionSupported: Boolean(browser.storage.session),
  };
}

/**
 * Create a vault and unlock it.
 * @param {string} password
 * @returns {Promise<Object>} includes the recovery key, shown once
 */
export async function setupVault(password) {
  const existing = await fetchVaultMeta();
  if (existing?.exists) {
    return { success: false, error: 'A vault already exists for this account' };
  }

  const { meta, userKey, recoveryKey } = await createVault(password);
  const saved = await saveVaultMeta(meta);
  if (!saved) {
    return { success: false, error: 'Could not save the vault. Check your connection.' };
  }

  await setSessionKey(userKey);
  return { success: true, unlocked: true, recoveryKey };
}

/**
 * Unlock with the master password.
 * @param {string} password
 */
export async function unlock(password) {
  const res = await fetchVaultMeta();
  if (!res?.exists) {
    return { success: false, error: 'No vault has been set up yet' };
  }

  try {
    const { userKey } = await unlockVault(password, res.meta);
    await setSessionKey(userKey);
    return { success: true, unlocked: true };
  } catch (err) {
    // unlockVault throws a deliberately uninformative "Incorrect password" for
    // both a wrong password and a tampered blob.
    return { success: false, error: err.message || 'Incorrect password' };
  }
}

/**
 * Unlock with the recovery key, then set a new master password.
 * @param {string} recoveryKey
 * @param {string} newPassword
 */
export async function recoverVault(recoveryKey, newPassword) {
  const res = await fetchVaultMeta();
  if (!res?.exists) {
    return { success: false, error: 'No vault has been set up yet' };
  }

  try {
    const { userKey } = await unlockWithRecoveryKey(recoveryKey, res.meta);
    const { meta } = await rewrapUserKey(userKey, newPassword, res.meta);
    const saved = await saveVaultMeta(meta);
    if (!saved) return { success: false, error: 'Could not save the new password' };

    await setSessionKey(userKey);
    return { success: true, unlocked: true };
  } catch (err) {
    return { success: false, error: err.message || 'Incorrect recovery key' };
  }
}

/**
 * Change the master password. Requires the vault to be unlocked, so the user
 * key is already available and no item has to be re-encrypted.
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changeMasterPassword(currentPassword, newPassword) {
  const res = await fetchVaultMeta();
  if (!res?.exists) return { success: false, error: 'No vault has been set up yet' };

  try {
    // Verify the current password by unlocking with it, rather than trusting
    // the session — otherwise anyone at an unlocked browser could change it.
    const { userKey } = await unlockVault(currentPassword, res.meta);
    const { meta } = await rewrapUserKey(userKey, newPassword, res.meta);
    const saved = await saveVaultMeta(meta);
    if (!saved) return { success: false, error: 'Could not save the new password' };

    await setSessionKey(userKey);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Incorrect password' };
  }
}

/** Require an unlocked vault, or explain why the caller cannot proceed. */
async function requireKey() {
  const key = await getSessionKey();
  if (!key) throw new Error('LOCKED');
  return key;
}

/**
 * List decrypted items.
 * @param {{ trash?: boolean }} [options]
 */
export async function listItems({ trash = false } = {}) {
  try {
    const userKey = await requireKey();
    const rows = await fetchVaultItems({ trash });
    const { items, failed } = await decryptItems(userKey, rows);

    // Sort by name for a stable list; the API orders by updated_at, which
    // reshuffles the list every time the user edits something.
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Carry the server's revision and trash state alongside each item — the
    // client needs the revision to write, and it is not inside the ciphertext.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const withMeta = items.map((item) => ({
      ...item,
      revision: byId.get(item.id)?.revision ?? 1,
      deletedAt: byId.get(item.id)?.deleted_at ?? null,
    }));

    return { success: true, items: withMeta, failed, unlocked: true };
  } catch (err) {
    if (err.message === 'LOCKED') return { success: false, locked: true, error: 'Vault is locked' };
    return { success: false, error: err.message || 'Could not load the vault' };
  }
}

/**
 * Create or update an item.
 *
 * `item.revision` decides which: absent means create. A stale revision comes
 * back from the API as a conflict rather than overwriting another device.
 * @param {Object} item a plaintext item
 */
export async function saveItem(item) {
  try {
    const userKey = await requireKey();
    const row = await encryptItem(userKey, item);

    if (item.revision) {
      const result = await updateVaultItem(item.id, { ...row, revision: item.revision });
      if (result?.conflict) {
        return {
          success: false,
          conflict: true,
          error: 'This item was changed on another device. Reload to see the current version.',
        };
      }
      if (!result) return { success: false, error: 'Could not save the item' };
      return { success: true, item: { ...item, revision: result.revision } };
    }

    const created = await createVaultItem(row);
    if (!created) return { success: false, error: 'Could not save the item' };
    return { success: true, item: { ...item, revision: created.revision } };
  } catch (err) {
    if (err.message === 'LOCKED') return { success: false, locked: true, error: 'Vault is locked' };
    return { success: false, error: err.message || 'Could not save the item' };
  }
}

/**
 * Build a new item, applying password history when one is being replaced.
 * @param {string} type
 * @param {Object} fields
 * @param {Object} [existing] the item being edited, if any
 */
export function buildItem(type, fields, existing) {
  if (!existing) return createItem(type, fields);

  const merged = {
    ...existing,
    ...fields,
    [type]: { ...existing[type], ...(fields[type] || {}) },
    updatedAt: new Date().toISOString(),
  };

  // A changed login password goes through recordPasswordChange so the old one
  // is kept in history rather than lost.
  const nextPassword = fields[type]?.password;
  if (type === 'login' && typeof nextPassword === 'string') {
    return recordPasswordChange({ ...merged, login: { ...existing.login } }, nextPassword);
  }
  return merged;
}

/** Move an item to the trash. */
export async function trashItem(id) {
  try {
    await requireKey();
    const ok = await patchVaultItem(id, 'trash');
    return ok ? { success: true } : { success: false, error: 'Could not move the item to trash' };
  } catch (err) {
    if (err.message === 'LOCKED') return { success: false, locked: true, error: 'Vault is locked' };
    return { success: false, error: err.message };
  }
}

/** Restore an item from the trash. */
export async function restoreItem(id) {
  try {
    await requireKey();
    const ok = await patchVaultItem(id, 'restore');
    return ok ? { success: true } : { success: false, error: 'Could not restore the item' };
  } catch (err) {
    if (err.message === 'LOCKED') return { success: false, locked: true, error: 'Vault is locked' };
    return { success: false, error: err.message };
  }
}

/** Delete an item permanently. */
export async function destroyItem(id) {
  try {
    await requireKey();
    const ok = await deleteVaultItem(id);
    return ok ? { success: true } : { success: false, error: 'Could not delete the item' };
  } catch (err) {
    if (err.message === 'LOCKED') return { success: false, locked: true, error: 'Vault is locked' };
    return { success: false, error: err.message };
  }
}

/**
 * How many item writes are in flight at once.
 *
 * Every item is a separate POST -- the API creates one item per request -- so a
 * database of a few thousand keys is a few thousand round trips. Sequentially
 * that is minutes of wall clock; the popup that started it is long gone and the
 * user is looking at an empty vault. Eight is enough to make the trip
 * network-bound rather than latency-bound without looking like a flood.
 */
const IMPORT_CONCURRENCY = 8;

/**
 * Progress for the running (or last) import.
 *
 * Deliberately module-level and deliberately free of item data. The service
 * worker can be killed mid-import, and the one thing that must never happen is
 * plaintext items being written somewhere to survive that. Losing the job on a
 * worker restart is fine because re-running the same file resumes: every item
 * carries its own id, so an item already stored comes back 409 and is counted
 * as done rather than as an error.
 *
 * @type {{total: number, done: number, imported: number, already: number,
 *   failed: number, running: boolean, failures: Array, error: string|null}|null}
 */
let importJob = null;

/** Progress for the popup/options page to poll. */
export function getImportProgress() {
  if (!importJob) return { success: true, job: null };
  return { success: true, job: { ...importJob, failures: importJob.failures.slice(0, 20) } };
}

/**
 * Import parsed items, encrypting each one.
 *
 * Returns as soon as the work is scheduled rather than when it finishes: the
 * caller is a popup or an options tab, and neither is guaranteed to still be
 * open in three minutes. Progress is polled through {@link getImportProgress},
 * and closing the page no longer abandons the import.
 *
 * Reports per-item failures instead of stopping, so one bad row out of five
 * hundred does not abandon the other four hundred and ninety-nine.
 *
 * @param {Object[]} items plaintext items from parseImport
 */
export async function importItems(items) {
  if (importJob?.running) {
    return { success: false, error: 'An import is already running' };
  }

  let userKey;
  try {
    userKey = await requireKey();
  } catch (err) {
    if (err.message === 'LOCKED') return { success: false, locked: true, error: 'Vault is locked' };
    return { success: false, error: err.message };
  }

  const queue = Array.isArray(items) ? items.slice() : [];
  importJob = {
    total: queue.length,
    done: 0,
    imported: 0,
    already: 0,
    failed: 0,
    running: true,
    failures: [],
    error: null,
  };
  const job = importJob;

  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= queue.length) return;
      const item = queue[index];
      try {
        const row = await encryptItem(userKey, item);
        const created = await createVaultItem(row);
        if (created?.conflict) job.already += 1;
        else if (created) job.imported += 1;
        else {
          job.failed += 1;
          job.failures.push({ name: item.name, reason: 'Server rejected the item' });
        }
      } catch (err) {
        job.failed += 1;
        job.failures.push({ name: item.name, reason: err.message });
      }
      job.done += 1;
    }
  };

  const run = Promise.all(
    Array.from({ length: Math.min(IMPORT_CONCURRENCY, queue.length) }, worker)
  )
    .catch((err) => {
      job.error = err.message;
    })
    .finally(() => {
      job.running = false;
    });

  // Awaited only so a caller that wants the old blocking behaviour -- the tests,
  // and a small CSV where waiting is nicer than polling -- still gets a result.
  if (queue.length <= IMPORT_CONCURRENCY * 4) {
    await run;
    return {
      success: true,
      imported: job.imported,
      already: job.already,
      failures: job.failures,
      finished: true,
    };
  }

  return { success: true, started: true, total: job.total };
}

/**
 * Register the listeners the vault needs. Called synchronously at top level, so
 * the alarm handler exists before any alarm can fire.
 */
export function initVaultSession() {
  hardenSessionStorage().catch(() => {});
}

export { ITEM_TYPE, ITEM_TYPE_NAME };
