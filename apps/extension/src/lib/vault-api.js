/**
 * Vault API client.
 *
 * Every payload crossing this boundary is already ciphertext — this module
 * never sees a plaintext item, a password, or a key. It reuses `apiRequest`
 * from api.js so vault calls get the same Bearer token and the same automatic
 * refresh as the rest of the extension.
 */

import { apiRequest } from './api.js';

/**
 * Fetch the caller's vault key material.
 * @returns {Promise<{exists: boolean, meta: Object|null}|null>} null on failure
 */
export async function fetchVaultMeta() {
  try {
    const response = await apiRequest('/api/vault/meta', { method: 'GET' });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('[MarkSyncr] Vault meta fetch failed:', err?.message);
    return null;
  }
}

/**
 * Create a vault, or re-wrap it after a password change.
 * @param {Object} meta
 * @returns {Promise<boolean>}
 */
export async function saveVaultMeta(meta) {
  try {
    const response = await apiRequest('/api/vault/meta', {
      method: 'POST',
      body: JSON.stringify(meta),
    });
    return response.ok;
  } catch (err) {
    console.error('[MarkSyncr] Vault meta save failed:', err?.message);
    return false;
  }
}

/**
 * List encrypted item rows.
 * @param {{ trash?: boolean, since?: string }} [options]
 * @returns {Promise<Object[]>}
 */
export async function fetchVaultItems({ trash = false, since } = {}) {
  // The server caps one response at MAX_PAGE_SIZE (1000) and always has, so a
  // single request silently truncated any vault larger than that -- the items
  // were stored and simply never listed. Page until a short response says the
  // end has been reached.
  const PAGE = 1000;
  const all = [];

  try {
    for (let offset = 0; ; offset += PAGE) {
      const params = new URLSearchParams();
      if (trash) params.set('trash', '1');
      if (since) params.set('since', since);
      params.set('limit', String(PAGE));
      if (offset) params.set('offset', String(offset));

      const response = await apiRequest(`/api/vault/items?${params.toString()}`, {
        method: 'GET',
      });
      if (!response.ok) return all;
      const data = await response.json();
      const page = data.items || [];
      all.push(...page);

      // Short page means the end. A full page from a server that does not yet
      // understand `offset` would repeat itself forever, so stop unless the
      // response actually advanced past what we already hold.
      if (page.length < PAGE) break;
      if (!data.paged) break;
    }
    return all;
  } catch (err) {
    console.error('[MarkSyncr] Vault items fetch failed:', err?.message);
    return all;
  }
}

/**
 * Create an item.
 *
 * A 409 means this id is already stored, which during an import is not a
 * failure: the item arrived on an earlier run. It is reported as
 * `{conflict: true}` so a re-run of an interrupted import can count it as
 * already-done rather than as an error — that is what makes re-running the
 * same file a safe way to resume.
 *
 * @param {{id: string, type: number, ciphertext: string, iv: string}} row
 * @returns {Promise<Object|{conflict: true}|null>} the created row, a conflict, or null
 */
export async function createVaultItem(row) {
  try {
    const response = await apiRequest('/api/vault/items', {
      method: 'POST',
      body: JSON.stringify(row),
    });
    if (response.status === 409) return { conflict: true };
    if (!response.ok) return null;
    const data = await response.json();
    return data.item || null;
  } catch (err) {
    console.error('[MarkSyncr] Vault item create failed:', err?.message);
    return null;
  }
}

/**
 * Replace an item's ciphertext.
 *
 * A 409 means another device wrote first. That is surfaced as `{conflict: true}`
 * rather than an error, because the caller has to do something different about
 * it — reload and merge, not retry.
 *
 * @param {string} id
 * @param {{type: number, ciphertext: string, iv: string, revision: number}} row
 * @returns {Promise<Object|{conflict: true}|null>}
 */
export async function updateVaultItem(id, row) {
  try {
    const response = await apiRequest(`/api/vault/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(row),
    });
    if (response.status === 409) return { conflict: true };
    if (!response.ok) return null;
    const data = await response.json();
    return data.item || null;
  } catch (err) {
    console.error('[MarkSyncr] Vault item update failed:', err?.message);
    return null;
  }
}

/**
 * Move an item to the trash, or restore it.
 * @param {string} id
 * @param {'trash'|'restore'} action
 * @returns {Promise<boolean>}
 */
export async function patchVaultItem(id, action) {
  try {
    const response = await apiRequest(`/api/vault/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    return response.ok;
  } catch (err) {
    console.error(`[MarkSyncr] Vault item ${action} failed:`, err?.message);
    return false;
  }
}

/**
 * Delete an item permanently.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteVaultItem(id) {
  try {
    const response = await apiRequest(`/api/vault/items/${id}`, { method: 'DELETE' });
    return response.ok;
  } catch (err) {
    console.error('[MarkSyncr] Vault item delete failed:', err?.message);
    return false;
  }
}
