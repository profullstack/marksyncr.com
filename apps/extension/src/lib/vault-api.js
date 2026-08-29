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
  const params = new URLSearchParams();
  if (trash) params.set('trash', '1');
  if (since) params.set('since', since);
  const query = params.toString();

  try {
    const response = await apiRequest(`/api/vault/items${query ? `?${query}` : ''}`, {
      method: 'GET',
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (err) {
    console.error('[MarkSyncr] Vault items fetch failed:', err?.message);
    return [];
  }
}

/**
 * Create an item.
 * @param {{id: string, type: number, ciphertext: string, iv: string}} row
 * @returns {Promise<Object|null>} the created row, or null
 */
export async function createVaultItem(row) {
  try {
    const response = await apiRequest('/api/vault/items', {
      method: 'POST',
      body: JSON.stringify(row),
    });
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
