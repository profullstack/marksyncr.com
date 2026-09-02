/**
 * Tests for the extension's vault session.
 *
 * The properties that matter here are about *where the key lives*: in session
 * storage so it survives a service-worker restart, out of local storage so it
 * never touches disk, and gone on lock, auto-lock and sign-out.
 * @module __tests__/vault-session.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockBrowser, localRef, sessionRef, alarmRef } = vi.hoisted(() => {
  const localRef = { data: {} };
  const sessionRef = { data: {}, supported: true, accessLevel: null };
  const alarmRef = { alarms: {} };

  const area = (ref) => ({
    get: vi.fn(async (key) =>
      typeof key === 'string' ? (key in ref.data ? { [key]: ref.data[key] } : {}) : { ...ref.data }
    ),
    set: vi.fn(async (obj) => {
      Object.assign(ref.data, obj);
    }),
    remove: vi.fn(async (key) => {
      for (const k of [].concat(key)) delete ref.data[k];
    }),
    clear: vi.fn(async () => {
      ref.data = {};
    }),
  });

  const mockBrowser = {
    storage: {
      local: area(localRef),
      session: {
        ...area(sessionRef),
        setAccessLevel: vi.fn(async ({ accessLevel }) => {
          sessionRef.accessLevel = accessLevel;
        }),
      },
    },
    alarms: {
      create: vi.fn(async (name, opts) => {
        alarmRef.alarms[name] = opts;
      }),
      clear: vi.fn(async (name) => {
        delete alarmRef.alarms[name];
      }),
    },
  };
  return { mockBrowser, localRef, sessionRef, alarmRef };
});

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

// The API layer is mocked: these tests are about session handling, not HTTP.
const { serverRef } = vi.hoisted(() => ({ serverRef: { meta: null, items: [], nextId: 1 } }));
vi.mock('../src/lib/vault-api.js', () => ({
  fetchVaultMeta: vi.fn(async () =>
    serverRef.meta ? { exists: true, meta: serverRef.meta } : { exists: false, meta: null }
  ),
  saveVaultMeta: vi.fn(async (meta) => {
    serverRef.meta = meta;
    return true;
  }),
  fetchVaultItems: vi.fn(async ({ trash } = {}) =>
    serverRef.items.filter((row) => Boolean(row.deleted_at) === Boolean(trash))
  ),
  createVaultItem: vi.fn(async (row) => {
    // Mirrors the real route: the id is chosen by the client, so a second
    // create of the same id is a 409 rather than a duplicate row. Import
    // resume depends on that being reported as a conflict, not an error.
    if (serverRef.items.some((r) => r.id === row.id)) return { conflict: true };
    const stored = { ...row, revision: 1, deleted_at: null };
    serverRef.items.push(stored);
    return stored;
  }),
  updateVaultItem: vi.fn(async (id, row) => {
    const existing = serverRef.items.find((r) => r.id === id);
    if (!existing) return null;
    if (existing.revision !== row.revision) return { conflict: true };
    Object.assign(existing, row, { revision: existing.revision + 1 });
    return existing;
  }),
  patchVaultItem: vi.fn(async (id, action) => {
    const existing = serverRef.items.find((r) => r.id === id);
    if (!existing) return false;
    existing.deleted_at = action === 'trash' ? new Date().toISOString() : null;
    return true;
  }),
  deleteVaultItem: vi.fn(async (id) => {
    serverRef.items = serverRef.items.filter((r) => r.id !== id);
    return true;
  }),
}));

async function loadModule() {
  vi.resetModules();
  return import('../src/background/vault-session.js');
}

const PASSWORD = 'a-long-enough-master-password';

beforeEach(() => {
  localRef.data = {};
  sessionRef.data = {};
  sessionRef.accessLevel = null;
  alarmRef.alarms = {};
  serverRef.meta = null;
  serverRef.items = [];
});

describe('setup and unlock', () => {
  it('creates a vault, unlocks it, and returns a recovery key once', async () => {
    const mod = await loadModule();
    const res = await mod.setupVault(PASSWORD);

    expect(res.success).toBe(true);
    expect(res.unlocked).toBe(true);
    expect(res.recoveryKey).toMatch(/^[0-9A-F-]+$/);
    expect((await mod.getVaultStatus()).unlocked).toBe(true);
  }, 30_000);

  it('refuses to create a second vault over an existing one', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    const again = await mod.setupVault('another-password-entirely');
    expect(again.success).toBe(false);
    expect(again.error).toMatch(/already exists/);
  }, 30_000);

  it('unlocks with the right password after a lock', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.lockVault();
    expect((await mod.getVaultStatus()).unlocked).toBe(false);

    expect((await mod.unlock(PASSWORD)).success).toBe(true);
    expect((await mod.getVaultStatus()).unlocked).toBe(true);
  }, 30_000);

  it('rejects the wrong password', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.lockVault();

    const res = await mod.unlock('not the password');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Incorrect password/);
    expect((await mod.getVaultStatus()).unlocked).toBe(false);
  }, 30_000);

  it('reports that no vault exists before setup', async () => {
    const mod = await loadModule();
    const status = await mod.getVaultStatus();
    expect(status.exists).toBe(false);
    expect(status.unlocked).toBe(false);
  });
});

describe('where the key lives', () => {
  it('keeps the unlocked key in session storage, never in local', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    // Session storage is memory-only and cleared when the browser closes.
    expect(Object.keys(sessionRef.data)).toContain('vault-user-key');
    // Local storage is on disk — the key must never be written there.
    expect(JSON.stringify(localRef.data)).not.toContain('vault-user-key');
  }, 30_000);

  it('never stores the master password anywhere', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    expect(JSON.stringify(localRef.data)).not.toContain(PASSWORD);
    expect(JSON.stringify(sessionRef.data)).not.toContain(PASSWORD);
    expect(JSON.stringify(serverRef.meta)).not.toContain(PASSWORD);
  }, 30_000);

  it('restricts session storage to trusted contexts, so content scripts cannot read it', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    expect(sessionRef.accessLevel).toBe('TRUSTED_CONTEXTS');
  }, 30_000);

  it('survives a service-worker restart', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    // Re-importing the module is what a worker restart looks like: module state
    // is gone, session storage is not.
    const restarted = await loadModule();
    expect((await restarted.getVaultStatus()).unlocked).toBe(true);
  }, 30_000);

  it('forgets the key on lock', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.lockVault();
    expect(sessionRef.data['vault-user-key']).toBeUndefined();
  }, 30_000);
});

describe('auto-lock', () => {
  it('arms an alarm when the vault is unlocked', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    expect(alarmRef.alarms['marksyncr-vault-autolock']).toBeDefined();
  }, 30_000);

  it('uses an alarm and not a timer, so it survives the worker dying', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    expect(mockBrowser.alarms.create).toHaveBeenCalledWith(
      'marksyncr-vault-autolock',
      expect.objectContaining({ delayInMinutes: expect.any(Number) })
    );
  }, 30_000);

  it('clears the alarm on lock', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.lockVault();
    expect(alarmRef.alarms['marksyncr-vault-autolock']).toBeUndefined();
  }, 30_000);

  it('arms no alarm when the timeout is "never"', async () => {
    const mod = await loadModule();
    await mod.setVaultPrefs({ lockMinutes: 0 });
    await mod.setupVault(PASSWORD);
    expect(alarmRef.alarms['marksyncr-vault-autolock']).toBeUndefined();
  }, 30_000);

  it('recognises its own alarm and no other', async () => {
    const mod = await loadModule();
    expect(mod.isVaultLockAlarm('marksyncr-vault-autolock')).toBe(true);
    expect(mod.isVaultLockAlarm('marksyncr-auto-sync')).toBe(false);
  });
});

describe('items', () => {
  it('refuses to list while locked', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.lockVault();

    const res = await mod.listItems();
    expect(res.success).toBe(false);
    expect(res.locked).toBe(true);
  }, 30_000);

  it('round-trips an item through encryption', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    const item = mod.buildItem('login', {
      name: 'GitHub',
      login: { username: 'anthony', password: 'hunter2' },
    });
    expect((await mod.saveItem(item)).success).toBe(true);

    const { items } = await mod.listItems();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('GitHub');
    expect(items[0].login.password).toBe('hunter2');
  }, 30_000);

  it('stores only ciphertext on the server', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.saveItem(
      mod.buildItem('login', { name: 'My Bank', login: { username: 'me', password: 'hunter2' } })
    );

    const wire = JSON.stringify(serverRef.items);
    expect(wire).not.toContain('hunter2');
    expect(wire).not.toContain('My Bank');
  }, 30_000);

  it('reports a conflict rather than overwriting another device', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.saveItem(mod.buildItem('login', { name: 'GitHub' }));

    const { items } = await mod.listItems();
    const stale = { ...items[0], revision: 99 };

    const res = await mod.saveItem(stale);
    expect(res.success).toBe(false);
    expect(res.conflict).toBe(true);
  }, 30_000);

  it('moves to trash, restores, and deletes', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.saveItem(mod.buildItem('login', { name: 'GitHub' }));

    const { items } = await mod.listItems();
    const id = items[0].id;

    await mod.trashItem(id);
    expect((await mod.listItems()).items).toHaveLength(0);
    expect((await mod.listItems({ trash: true })).items).toHaveLength(1);

    await mod.restoreItem(id);
    expect((await mod.listItems()).items).toHaveLength(1);

    await mod.destroyItem(id);
    expect((await mod.listItems()).items).toHaveLength(0);
    expect((await mod.listItems({ trash: true })).items).toHaveLength(0);
  }, 30_000);

  it('imports many items and reports the count', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    const batch = [
      mod.buildItem('login', { name: 'One' }),
      mod.buildItem('login', { name: 'Two' }),
    ];
    const res = await mod.importItems(batch);

    expect(res.success).toBe(true);
    expect(res.imported).toBe(2);
    expect((await mod.listItems()).items).toHaveLength(2);
  }, 30_000);

  /**
   * A database of a few thousand keys is a few thousand POSTs. Blocking the
   * caller for that long is what made a large import impossible: the popup that
   * was awaiting it had already been dismissed, so the result went nowhere. A
   * big import is scheduled and reported through progress instead.
   */
  it('schedules a large import and finishes it in the background', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    const batch = Array.from({ length: 120 }, (_, i) =>
      mod.buildItem('login', { name: `Item ${i}` })
    );
    const res = await mod.importItems(batch);

    // Returns immediately, before the writes are done.
    expect(res.success).toBe(true);
    expect(res.started).toBe(true);
    expect(res.total).toBe(120);

    await vi.waitFor(
      () => {
        const { job } = mod.getImportProgress();
        expect(job.running).toBe(false);
      },
      { timeout: 30_000, interval: 50 }
    );

    const { job } = mod.getImportProgress();
    expect(job.imported).toBe(120);
    expect(job.failed).toBe(0);
    expect(job.done).toBe(120);
    expect((await mod.listItems()).items).toHaveLength(120);
  }, 60_000);

  /**
   * The service worker can be killed mid-import and the job is lost with it, so
   * the recovery is to import the same file again. That is only safe if an item
   * already stored counts as done rather than as a failure.
   */
  it('counts already-stored items as present, so re-running resumes', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    const batch = Array.from({ length: 120 }, (_, i) =>
      mod.buildItem('login', { name: `Item ${i}` })
    );

    await mod.importItems(batch);
    await vi.waitFor(() => expect(mod.getImportProgress().job.running).toBe(false), {
      timeout: 30_000,
      interval: 50,
    });

    // The same file again: every id is already on the server.
    await mod.importItems(batch);
    await vi.waitFor(() => expect(mod.getImportProgress().job.running).toBe(false), {
      timeout: 30_000,
      interval: 50,
    });

    const { job } = mod.getImportProgress();
    expect(job.already).toBe(120);
    expect(job.imported).toBe(0);
    expect(job.failed).toBe(0);
    // Re-running must not duplicate anything.
    expect((await mod.listItems()).items).toHaveLength(120);
  }, 60_000);

  it('refuses to start a second import while one is running', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    const batch = Array.from({ length: 120 }, (_, i) =>
      mod.buildItem('login', { name: `Item ${i}` })
    );
    const first = await mod.importItems(batch);
    expect(first.started).toBe(true);

    const second = await mod.importItems(batch);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already running/i);

    await vi.waitFor(() => expect(mod.getImportProgress().job.running).toBe(false), {
      timeout: 30_000,
      interval: 50,
    });
  }, 60_000);
});

describe('buildItem', () => {
  it('creates a new item with an id', async () => {
    const mod = await loadModule();
    const item = mod.buildItem('login', { name: 'New' });
    expect(item.id).toBeTruthy();
    expect(item.name).toBe('New');
  });

  it('keeps the replaced password in history when editing', async () => {
    const mod = await loadModule();
    const original = mod.buildItem('login', { login: { password: 'old-one' } });
    const edited = mod.buildItem('login', { login: { password: 'new-one' } }, original);

    expect(edited.login.password).toBe('new-one');
    expect(edited.history[0].password).toBe('old-one');
    expect(edited.id).toBe(original.id);
  });

  it('does not add history when the password is unchanged', async () => {
    const mod = await loadModule();
    const original = mod.buildItem('login', { name: 'x', login: { password: 'same' } });
    const edited = mod.buildItem('login', { name: 'renamed', login: { password: 'same' } }, original);

    expect(edited.history).toHaveLength(0);
    expect(edited.name).toBe('renamed');
  });
});

describe('changing the master password', () => {
  it('works with the current password and keeps the items readable', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.saveItem(mod.buildItem('login', { name: 'GitHub', login: { password: 'p' } }));

    expect((await mod.changeMasterPassword(PASSWORD, 'a-new-master-password')).success).toBe(true);

    await mod.lockVault();
    expect((await mod.unlock('a-new-master-password')).success).toBe(true);
    expect((await mod.listItems()).items[0].login.password).toBe('p');
  }, 60_000);

  it('refuses when the current password is wrong', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);

    const res = await mod.changeMasterPassword('wrong', 'a-new-master-password');
    expect(res.success).toBe(false);
  }, 30_000);
});

describe('recovery', () => {
  it('gets back in with the recovery key and a new password', async () => {
    const mod = await loadModule();
    const { recoveryKey } = await mod.setupVault(PASSWORD);
    await mod.saveItem(mod.buildItem('login', { name: 'GitHub', login: { password: 'p' } }));
    await mod.lockVault();

    const res = await mod.recoverVault(recoveryKey, 'a-brand-new-password');
    expect(res.success).toBe(true);
    expect((await mod.listItems()).items[0].login.password).toBe('p');

    // The old password no longer works.
    await mod.lockVault();
    expect((await mod.unlock(PASSWORD)).success).toBe(false);
  }, 60_000);

  it('rejects a wrong recovery key', async () => {
    const mod = await loadModule();
    await mod.setupVault(PASSWORD);
    await mod.lockVault();

    const res = await mod.recoverVault('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FFFFF-11111-22222', 'new-password-here');
    expect(res.success).toBe(false);
  }, 30_000);
});
