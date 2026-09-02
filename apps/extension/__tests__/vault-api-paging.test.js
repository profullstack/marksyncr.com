/**
 * Paging in the vault items fetch.
 *
 * The server has always capped one response at MAX_PAGE_SIZE (1000) and the
 * client only ever made one request, so a vault larger than a page was listed
 * short with no error anywhere: the items were stored and simply never shown.
 * An OpenCreds import of a few thousand keys hits this immediately.
 * @module __tests__/vault-api-paging.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchRef } = vi.hoisted(() => ({ fetchRef: { calls: [], pages: [], paged: true } }));

vi.mock('../src/lib/api.js', () => ({
  apiRequest: vi.fn(async (path) => {
    fetchRef.calls.push(path);
    const url = new URL(path, 'https://example.test');
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 1000);
    const items = fetchRef.pages.slice(offset, offset + limit);
    return {
      ok: true,
      status: 200,
      json: async () => (fetchRef.paged ? { items, paged: true } : { items }),
    };
  }),
}));

const load = async () => import('../src/lib/vault-api.js');

beforeEach(() => {
  fetchRef.calls = [];
  fetchRef.paged = true;
  vi.resetModules();
});

describe('fetchVaultItems paging', () => {
  it('returns every item of a vault larger than one page', async () => {
    fetchRef.pages = Array.from({ length: 3122 }, (_, i) => ({ id: `id-${i}` }));
    const { fetchVaultItems } = await load();

    const items = await fetchVaultItems();

    expect(items).toHaveLength(3122);
    // No duplicates and nothing dropped.
    expect(new Set(items.map((i) => i.id)).size).toBe(3122);
    expect(fetchRef.calls).toHaveLength(4);
  });

  it('makes exactly one request when everything fits in a page', async () => {
    fetchRef.pages = Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}` }));
    const { fetchVaultItems } = await load();

    expect(await fetchVaultItems()).toHaveLength(12);
    expect(fetchRef.calls).toHaveLength(1);
  });

  it('stops after one page against a server that does not understand offset', async () => {
    // An older deployment ignores `offset` and returns the same full page every
    // time. Without the `paged` flag to tell them apart, the client would ask
    // forever and accumulate the same 1000 rows.
    fetchRef.paged = false;
    fetchRef.pages = Array.from({ length: 3122 }, (_, i) => ({ id: `id-${i}` }));
    const { fetchVaultItems } = await load();

    const items = await fetchVaultItems();

    expect(items).toHaveLength(1000);
    expect(fetchRef.calls).toHaveLength(1);
  });
});
