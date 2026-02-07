/**
 * Tests for folder move descendant tracking
 *
 * When a folder is moved in the browser, only the folder itself fires an onMoved
 * event. The bookmarks inside the folder don't fire individual events, but their
 * effective folderPath changes. Without marking descendants as locally modified,
 * sync would detect the folderPath mismatch and move them back to the cloud's
 * (old) folder path — undoing the user's folder move.
 *
 * This test file validates:
 * 1. Moving a folder marks all its descendants as locally modified
 * 2. categorizeCloudBookmarks skips cloud→local updates for those descendants
 * 3. Nested folders (folder-within-folder moves) are handled recursively
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Functions under test (copied from background/index.js to test in isolation)
// ============================================================================

function normalizeFolderPath(path) {
  if (!path) return '';
  return path
    .replace(/^Bookmarks Bar\/?/i, 'toolbar/')
    .replace(/^Bookmarks Toolbar\/?/i, 'toolbar/')
    .replace(/^Speed Dial\/?/i, 'toolbar/')
    .replace(/^Other Bookmarks\/?/i, 'other/')
    .replace(/^Unsorted Bookmarks\/?/i, 'other/')
    .replace(/^Bookmarks Menu\/?/i, 'menu/')
    .replace(/\/$/, '');
}

function bookmarkNeedsUpdate(cloudBm, localBm) {
  if ((cloudBm.title ?? '') !== (localBm.title ?? '')) return true;
  const cloudFolder = normalizeFolderPath(cloudBm.folderPath);
  const localFolder = normalizeFolderPath(localBm.folderPath);
  if (cloudFolder !== localFolder) return true;
  if (
    cloudBm.index !== undefined &&
    localBm.index !== undefined &&
    cloudBm.index !== localBm.index
  )
    return true;
  return false;
}

function categorizeCloudBookmarks(cloudBookmarks, localBookmarks, tombstones, modifiedLocalIds) {
  const localByUrl = new Map(localBookmarks.filter((b) => b.url).map((b) => [b.url, b]));

  const toAdd = [];
  const toUpdate = [];
  const skippedByTombstone = [];
  const skippedByLocalModification = [];

  for (const cloudBm of cloudBookmarks) {
    if (!cloudBm.url) continue;

    const tombstone = tombstones.find((t) => t.url === cloudBm.url);
    if (tombstone) {
      const rawDate = cloudBm.dateAdded;
      const bookmarkDate =
        typeof rawDate === 'string' ? new Date(rawDate).getTime() : rawDate || 0;
      const tombstoneDate = tombstone.deletedAt || 0;
      if (isNaN(bookmarkDate) || bookmarkDate <= tombstoneDate) {
        skippedByTombstone.push(cloudBm);
        continue;
      }
    }

    const localBm = localByUrl.get(cloudBm.url);
    if (!localBm) {
      toAdd.push(cloudBm);
    } else if (modifiedLocalIds?.has(localBm.id)) {
      skippedByLocalModification.push(cloudBm.url);
    } else if (bookmarkNeedsUpdate(cloudBm, localBm)) {
      toUpdate.push({ cloud: cloudBm, local: localBm });
    }
  }

  return { toAdd, toUpdate, skippedByTombstone, skippedByLocalModification };
}

/**
 * Simulate the onMoved handler's descendant marking logic.
 * In the real code, this uses browser.bookmarks.getSubTree(id).
 * Here we simulate the same recursive walk over a mock subtree.
 */
function markDescendantsAsModified(subtreeChildren, locallyModifiedIds) {
  let count = 0;
  const walk = (nodes) => {
    for (const node of nodes) {
      locallyModifiedIds.add(node.id);
      count++;
      if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(subtreeChildren);
  return count;
}

// ============================================================================
// Tests
// ============================================================================

describe('Folder move: descendant tracking', () => {
  it('should mark all descendants of a moved folder as locally modified', () => {
    // Simulate a folder "Work" with 3 bookmarks inside it
    const movedFolderSubtree = [
      { id: 'bm-1', url: 'https://a.com', title: 'A' },
      { id: 'bm-2', url: 'https://b.com', title: 'B' },
      { id: 'bm-3', url: 'https://c.com', title: 'C' },
    ];

    const locallyModifiedIds = new Set();
    const count = markDescendantsAsModified(movedFolderSubtree, locallyModifiedIds);

    expect(count).toBe(3);
    expect(locallyModifiedIds.has('bm-1')).toBe(true);
    expect(locallyModifiedIds.has('bm-2')).toBe(true);
    expect(locallyModifiedIds.has('bm-3')).toBe(true);
  });

  it('should recursively mark nested folder descendants', () => {
    // Folder "Projects" contains subfolder "Work" which contains bookmarks
    const movedFolderSubtree = [
      { id: 'bm-1', url: 'https://a.com', title: 'A' },
      {
        id: 'subfolder-1',
        title: 'Subfolder',
        children: [
          { id: 'bm-2', url: 'https://b.com', title: 'B' },
          { id: 'bm-3', url: 'https://c.com', title: 'C' },
          {
            id: 'sub-subfolder',
            title: 'Deep',
            children: [{ id: 'bm-4', url: 'https://d.com', title: 'D' }],
          },
        ],
      },
    ];

    const locallyModifiedIds = new Set();
    const count = markDescendantsAsModified(movedFolderSubtree, locallyModifiedIds);

    expect(count).toBe(6); // bm-1, subfolder-1, bm-2, bm-3, sub-subfolder, bm-4
    expect(locallyModifiedIds.size).toBe(6);
    expect(locallyModifiedIds.has('bm-1')).toBe(true);
    expect(locallyModifiedIds.has('subfolder-1')).toBe(true);
    expect(locallyModifiedIds.has('bm-2')).toBe(true);
    expect(locallyModifiedIds.has('bm-3')).toBe(true);
    expect(locallyModifiedIds.has('sub-subfolder')).toBe(true);
    expect(locallyModifiedIds.has('bm-4')).toBe(true);
  });

  it('should handle empty folder (no children)', () => {
    const locallyModifiedIds = new Set();
    const count = markDescendantsAsModified([], locallyModifiedIds);

    expect(count).toBe(0);
    expect(locallyModifiedIds.size).toBe(0);
  });
});

describe('Folder move: sync protection for descendants', () => {
  it('should prevent cloud from reverting bookmarks inside a moved folder (the bug)', () => {
    // Scenario: User moves folder "Work" from "Other Bookmarks" to "Bookmarks Bar"
    // Cloud still has bookmarks under "Other Bookmarks/Work"
    // Local now has them under "Bookmarks Bar/Work"
    // Without the fix, cloud would move them back.

    const cloudBookmarks = [
      {
        url: 'https://work1.com',
        title: 'Work 1',
        folderPath: 'Other Bookmarks/Work',
        index: 0,
      },
      {
        url: 'https://work2.com',
        title: 'Work 2',
        folderPath: 'Other Bookmarks/Work',
        index: 1,
      },
      {
        url: 'https://work3.com',
        title: 'Work 3',
        folderPath: 'Other Bookmarks/Work',
        index: 2,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-w1',
        url: 'https://work1.com',
        title: 'Work 1',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      },
      {
        id: 'bm-w2',
        url: 'https://work2.com',
        title: 'Work 2',
        folderPath: 'Bookmarks Bar/Work',
        index: 1,
      },
      {
        id: 'bm-w3',
        url: 'https://work3.com',
        title: 'Work 3',
        folderPath: 'Bookmarks Bar/Work',
        index: 2,
      },
    ];

    // With the fix: all descendants of the moved folder are marked as locally modified
    const modifiedLocalIds = new Set(['bm-w1', 'bm-w2', 'bm-w3']);

    const { toAdd, toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    // Nothing should be moved back — all are protected
    expect(toAdd).toHaveLength(0);
    expect(toUpdate).toHaveLength(0);
    expect(skippedByLocalModification).toHaveLength(3);
  });

  it('should demonstrate the bug WITHOUT descendant tracking', () => {
    // Same scenario but without the fix — descendants are NOT marked as modified
    // This shows what was happening before: cloud overrides the local folder path

    const cloudBookmarks = [
      {
        url: 'https://work1.com',
        title: 'Work 1',
        folderPath: 'Other Bookmarks/Work',
        index: 0,
      },
      {
        url: 'https://work2.com',
        title: 'Work 2',
        folderPath: 'Other Bookmarks/Work',
        index: 1,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-w1',
        url: 'https://work1.com',
        title: 'Work 1',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      },
      {
        id: 'bm-w2',
        url: 'https://work2.com',
        title: 'Work 2',
        folderPath: 'Bookmarks Bar/Work',
        index: 1,
      },
    ];

    // BUG: only the folder itself was tracked, NOT its children
    const modifiedLocalIds = new Set(['folder-work']); // folder ID, not bookmark IDs

    const { toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    // Without the fix: cloud detects folderPath mismatch and queues updates
    // that would move bookmarks BACK to Other Bookmarks/Work
    expect(toUpdate).toHaveLength(2);
    expect(toUpdate[0].cloud.folderPath).toBe('Other Bookmarks/Work');
    expect(toUpdate[0].local.folderPath).toBe('Bookmarks Bar/Work');
    expect(skippedByLocalModification).toHaveLength(0);
  });

  it('should protect nested folder contents during parent folder move', () => {
    // Scenario: User moves "Projects" folder which contains "Projects/Frontend" subfolder
    // All bookmarks inside both levels should be protected

    const cloudBookmarks = [
      {
        url: 'https://react.com',
        title: 'React',
        folderPath: 'Other Bookmarks/Projects/Frontend',
        index: 0,
      },
      {
        url: 'https://vue.com',
        title: 'Vue',
        folderPath: 'Other Bookmarks/Projects/Frontend',
        index: 1,
      },
      {
        url: 'https://node.com',
        title: 'Node',
        folderPath: 'Other Bookmarks/Projects',
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-react',
        url: 'https://react.com',
        title: 'React',
        folderPath: 'Bookmarks Bar/Projects/Frontend',
        index: 0,
      },
      {
        id: 'bm-vue',
        url: 'https://vue.com',
        title: 'Vue',
        folderPath: 'Bookmarks Bar/Projects/Frontend',
        index: 1,
      },
      {
        id: 'bm-node',
        url: 'https://node.com',
        title: 'Node',
        folderPath: 'Bookmarks Bar/Projects',
        index: 0,
      },
    ];

    // All descendants marked (including subfolder items)
    const modifiedLocalIds = new Set(['bm-react', 'bm-vue', 'bm-node', 'folder-frontend']);

    const { toAdd, toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    expect(toAdd).toHaveLength(0);
    expect(toUpdate).toHaveLength(0);
    expect(skippedByLocalModification).toHaveLength(3);
  });

  it('should protect descendants while still allowing unrelated cloud updates', () => {
    // Some bookmarks are inside the moved folder (protected),
    // others are in different folders (should still sync from cloud)

    const cloudBookmarks = [
      {
        url: 'https://moved.com',
        title: 'Moved',
        folderPath: 'Other Bookmarks/Work',
        index: 0,
      },
      {
        url: 'https://unrelated.com',
        title: 'Updated Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-moved',
        url: 'https://moved.com',
        title: 'Moved',
        folderPath: 'Bookmarks Bar/Work',
        index: 0,
      },
      {
        id: 'bm-unrelated',
        url: 'https://unrelated.com',
        title: 'Old Title',
        folderPath: 'Bookmarks Bar',
        index: 0,
      },
    ];

    // Only the moved folder's descendants are protected
    const modifiedLocalIds = new Set(['bm-moved']);

    const { toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    // Moved bookmark is protected
    expect(skippedByLocalModification).toContain('https://moved.com');
    // Unrelated bookmark should still get the title update from cloud
    expect(toUpdate).toHaveLength(1);
    expect(toUpdate[0].cloud.url).toBe('https://unrelated.com');
    expect(toUpdate[0].cloud.title).toBe('Updated Title');
  });

  it('should handle folder move where folder is moved within same root', () => {
    // Folder moved from "Bookmarks Bar/Old" to "Bookmarks Bar/New/Old"
    // Same root, different subfolder path

    const cloudBookmarks = [
      {
        url: 'https://inside.com',
        title: 'Inside',
        folderPath: 'Bookmarks Bar/Old',
        index: 0,
      },
    ];

    const localBookmarks = [
      {
        id: 'bm-inside',
        url: 'https://inside.com',
        title: 'Inside',
        folderPath: 'Bookmarks Bar/New/Old',
        index: 0,
      },
    ];

    const modifiedLocalIds = new Set(['bm-inside']);

    const { toUpdate, skippedByLocalModification } = categorizeCloudBookmarks(
      cloudBookmarks,
      localBookmarks,
      [],
      modifiedLocalIds
    );

    expect(toUpdate).toHaveLength(0);
    expect(skippedByLocalModification).toContain('https://inside.com');
  });
});

describe('Folder move: markDescendantsAsModified correctness', () => {
  it('should not count the root folder itself (only children)', () => {
    // The root of the moved subtree is already tracked by the onMoved handler.
    // markDescendants only walks children, not the root.
    const subtreeChildren = [{ id: 'child-1', url: 'https://a.com' }];
    const ids = new Set();
    // Set already contains the folder itself
    ids.add('folder-root');

    markDescendantsAsModified(subtreeChildren, ids);

    expect(ids.size).toBe(2); // folder-root + child-1
    expect(ids.has('folder-root')).toBe(true);
    expect(ids.has('child-1')).toBe(true);
  });

  it('should handle deeply nested structure', () => {
    const subtree = [
      {
        id: 'level1',
        title: 'L1',
        children: [
          {
            id: 'level2',
            title: 'L2',
            children: [
              {
                id: 'level3',
                title: 'L3',
                children: [{ id: 'deep-bm', url: 'https://deep.com' }],
              },
            ],
          },
        ],
      },
    ];

    const ids = new Set();
    const count = markDescendantsAsModified(subtree, ids);

    expect(count).toBe(4); // level1, level2, level3, deep-bm
    expect(ids.has('deep-bm')).toBe(true);
  });

  it('should handle folder with mix of bookmarks and subfolders', () => {
    const subtree = [
      { id: 'bm-1', url: 'https://a.com' },
      {
        id: 'sub-folder',
        title: 'Sub',
        children: [
          { id: 'bm-2', url: 'https://b.com' },
          { id: 'bm-3', url: 'https://c.com' },
        ],
      },
      { id: 'bm-4', url: 'https://d.com' },
    ];

    const ids = new Set();
    markDescendantsAsModified(subtree, ids);

    expect(ids.size).toBe(5); // bm-1, sub-folder, bm-2, bm-3, bm-4
  });
});
