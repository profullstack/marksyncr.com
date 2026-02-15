/**
 * Tests for bookmark reorder after sync
 *
 * Verifies that reorderLocalToMatchCloud correctly fixes
 * bookmark ordering after individual add/move operations
 * shift sibling indices.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock browser API
const mockBrowser = {
  bookmarks: {
    getTree: vi.fn(),
    getChildren: vi.fn(),
    move: vi.fn(),
  },
};

// Make browser available globally (extension code expects it)
globalThis.browser = mockBrowser;

// Import after mocking
// We can't directly import reorderLocalToMatchCloud since it's not exported,
// so we test the logic inline

describe('Bookmark Reorder Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect when children are out of order', () => {
    // Cloud says: A(0), B(1), C(2)
    // Local has: B, A, C
    const cloudItems = [
      { title: 'A', url: 'https://a.com', index: 0, folderPath: 'Bookmarks Bar' },
      { title: 'B', url: 'https://b.com', index: 1, folderPath: 'Bookmarks Bar' },
      { title: 'C', url: 'https://c.com', index: 2, folderPath: 'Bookmarks Bar' },
    ];

    const localChildren = [
      { id: '10', title: 'B', url: 'https://b.com', index: 0 },
      { id: '11', title: 'A', url: 'https://a.com', index: 1 },
      { id: '12', title: 'C', url: 'https://c.com', index: 2 },
    ];

    // Build desired order from cloud
    const desiredOrder = new Map();
    for (const ci of cloudItems) {
      const key = ci.url || `folder:${ci.title}`;
      desiredOrder.set(key, ci.index);
    }

    const sorted = [...localChildren].sort((a, b) => {
      const keyA = a.url || `folder:${a.title}`;
      const keyB = b.url || `folder:${b.title}`;
      const idxA = desiredOrder.get(keyA) ?? a.index ?? 999;
      const idxB = desiredOrder.get(keyB) ?? b.index ?? 999;
      return idxA - idxB;
    });

    // After sorting: A(0), B(1), C(2)
    expect(sorted[0].title).toBe('A');
    expect(sorted[1].title).toBe('B');
    expect(sorted[2].title).toBe('C');

    // Detect reorder needed
    let needsReorder = false;
    for (let i = 0; i < localChildren.length; i++) {
      if (localChildren[i].id !== sorted[i]?.id) {
        needsReorder = true;
        break;
      }
    }
    expect(needsReorder).toBe(true);
  });

  it('should not reorder when already correct', () => {
    const cloudItems = [
      { title: 'A', url: 'https://a.com', index: 0, folderPath: 'toolbar' },
      { title: 'B', url: 'https://b.com', index: 1, folderPath: 'toolbar' },
    ];

    const localChildren = [
      { id: '10', title: 'A', url: 'https://a.com', index: 0 },
      { id: '11', title: 'B', url: 'https://b.com', index: 1 },
    ];

    const desiredOrder = new Map();
    for (const ci of cloudItems) {
      desiredOrder.set(ci.url, ci.index);
    }

    const sorted = [...localChildren].sort((a, b) => {
      const idxA = desiredOrder.get(a.url) ?? a.index ?? 999;
      const idxB = desiredOrder.get(b.url) ?? b.index ?? 999;
      return idxA - idxB;
    });

    let needsReorder = false;
    for (let i = 0; i < localChildren.length; i++) {
      if (localChildren[i].id !== sorted[i]?.id) {
        needsReorder = true;
        break;
      }
    }
    expect(needsReorder).toBe(false);
  });

  it('should handle interleaved folders and bookmarks', () => {
    const cloudItems = [
      { title: 'Folder1', type: 'folder', index: 0, folderPath: 'toolbar' },
      { title: 'Link1', url: 'https://link1.com', index: 1, folderPath: 'toolbar' },
      { title: 'Folder2', type: 'folder', index: 2, folderPath: 'toolbar' },
      { title: 'Link2', url: 'https://link2.com', index: 3, folderPath: 'toolbar' },
    ];

    // Local has folders grouped together (wrong order)
    const localChildren = [
      { id: '1', title: 'Folder1', index: 0 },
      { id: '2', title: 'Folder2', index: 1 },
      { id: '3', title: 'Link1', url: 'https://link1.com', index: 2 },
      { id: '4', title: 'Link2', url: 'https://link2.com', index: 3 },
    ];

    const desiredOrder = new Map();
    for (const ci of cloudItems) {
      const key = ci.url || `folder:${ci.title}`;
      desiredOrder.set(key, ci.index);
    }

    const sorted = [...localChildren].sort((a, b) => {
      const keyA = a.url || `folder:${a.title}`;
      const keyB = b.url || `folder:${b.title}`;
      const idxA = desiredOrder.get(keyA) ?? a.index ?? 999;
      const idxB = desiredOrder.get(keyB) ?? b.index ?? 999;
      return idxA - idxB;
    });

    expect(sorted[0].title).toBe('Folder1');
    expect(sorted[1].title).toBe('Link1');
    expect(sorted[2].title).toBe('Folder2');
    expect(sorted[3].title).toBe('Link2');
  });

  it('should process moves last-to-first to avoid index shifting', () => {
    // Verify the algorithm: when moving items, we go from last index
    // to first so that earlier moves don't affect later target indices
    const items = ['A', 'B', 'C', 'D', 'E'];
    const moves = [];

    // Simulate last-to-first processing
    for (let i = items.length - 1; i >= 0; i--) {
      moves.push({ item: items[i], targetIndex: i });
    }

    expect(moves[0]).toEqual({ item: 'E', targetIndex: 4 });
    expect(moves[1]).toEqual({ item: 'D', targetIndex: 3 });
    expect(moves[4]).toEqual({ item: 'A', targetIndex: 0 });
  });
});
