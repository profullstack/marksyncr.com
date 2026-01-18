/**
 * Tests to verify checksum consistency between flat array and nested format
 *
 * The extension sends bookmarks in two formats:
 * 1. Flat array to /api/bookmarks (via flattenBookmarkTree)
 * 2. Nested format to /api/versions (via convertBrowserBookmarks)
 *
 * Both APIs compute checksums, and they MUST match for deduplication to work.
 * If they don't match, the versions API will create duplicate entries.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Normalize items for checksum (same as server-side)
 */
function normalizeItemsForChecksum(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (item.type === 'folder') {
        return {
          type: 'folder',
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      } else {
        return {
          type: 'bookmark',
          url: item.url,
          title: item.title ?? '',
          folderPath: item.folderPath || item.folder_path || '',
          index: item.index ?? 0,
        };
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      const folderCompare = a.folderPath.localeCompare(b.folderPath);
      if (folderCompare !== 0) return folderCompare;
      return (a.index ?? 0) - (b.index ?? 0);
    });
}

/**
 * Generate checksum from flat array (same as bookmarks API)
 */
function generateChecksumFromFlat(items) {
  const normalized = normalizeItemsForChecksum(items);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Extract flat array from nested format (same as versions API)
 */
function extractBookmarksFromNested(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;

  if (data.roots) {
    const bookmarks = [];

    function extractFromNode(node, path = '', index = 0) {
      if (!node) return;

      if (node.url) {
        bookmarks.push({
          type: 'bookmark',
          url: node.url,
          title: node.title ?? '',
          folderPath: path,
          index: node.index ?? index,
        });
        return;
      }

      if (node.children && Array.isArray(node.children)) {
        const newPath = node.title ? (path ? `${path}/${node.title}` : node.title) : path;

        // Add folder entry if it has a title and is not a root
        if (node.title && path) {
          bookmarks.push({
            type: 'folder',
            title: node.title,
            folderPath: path,
            index: node.index ?? index,
          });
        }

        for (let i = 0; i < node.children.length; i++) {
          extractFromNode(node.children[i], newPath, i);
        }
      }
    }

    for (const [rootKey, rootNode] of Object.entries(data.roots)) {
      if (rootNode && rootNode.children) {
        const rootPath = rootNode.title || rootKey;
        for (let i = 0; i < rootNode.children.length; i++) {
          extractFromNode(rootNode.children[i], rootPath, i);
        }
      }
    }

    return bookmarks;
  }

  return [];
}

/**
 * Generate checksum from nested format (same as versions API)
 */
function generateChecksumFromNested(nestedData) {
  const items = extractBookmarksFromNested(nestedData);
  const normalized = normalizeItemsForChecksum(items);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Simulate extension's flattenBookmarkTree
 */
function flattenBookmarkTree(tree) {
  const items = [];

  function traverse(nodes, parentPath = '') {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeIndex = node.index ?? i;

      if (node.url) {
        items.push({
          type: 'bookmark',
          id: node.id,
          url: node.url,
          title: node.title ?? '',
          folderPath: parentPath,
          dateAdded: node.dateAdded,
          index: nodeIndex,
        });
      } else if (node.children) {
        const folderPath = node.title
          ? parentPath
            ? `${parentPath}/${node.title}`
            : node.title
          : parentPath;

        // Only add folder entry if it has a title and is not a root
        if (node.title && parentPath) {
          items.push({
            type: 'folder',
            id: node.id,
            title: node.title,
            folderPath: parentPath,
            dateAdded: node.dateAdded,
            index: nodeIndex,
          });
        }

        traverse(node.children, folderPath);
      }
    }
  }

  traverse(tree);
  return items;
}

/**
 * Simulate extension's convertBrowserBookmarks
 */
function convertBrowserBookmarks(tree) {
  const result = {
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    browser: 'test',
    roots: {
      toolbar: { children: [] },
      menu: { children: [] },
      other: { children: [] },
    },
  };

  function convertNode(node, index = 0) {
    if (node.url) {
      return {
        type: 'bookmark',
        title: node.title || '',
        url: node.url,
        dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
        index: node.index ?? index,
      };
    }

    return {
      type: 'folder',
      title: node.title || '',
      children: (node.children || []).map((child, i) => convertNode(child, i)),
      dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : undefined,
      index: node.index ?? index,
    };
  }

  if (tree[0]?.children) {
    for (let i = 0; i < tree[0].children.length; i++) {
      const root = tree[0].children[i];
      const title = root.title?.toLowerCase() || '';

      if (title.includes('toolbar') || title.includes('bar')) {
        result.roots.toolbar = convertNode(root, i);
      } else if (title.includes('menu')) {
        result.roots.menu = convertNode(root, i);
      } else if (title.includes('other') || title.includes('unsorted')) {
        result.roots.other = convertNode(root, i);
      }
    }
  }

  return result;
}

describe('Checksum Consistency: Flat vs Nested Format', () => {
  it('should produce same checksum from flat array and nested format for simple bookmarks', () => {
    // Simulate browser bookmark tree
    const browserTree = [
      {
        children: [
          {
            id: '1',
            title: 'Bookmarks Toolbar',
            children: [
              {
                id: 'b1',
                url: 'https://example.com',
                title: 'Example',
                dateAdded: 1700000000000,
                index: 0,
              },
              {
                id: 'b2',
                url: 'https://test.com',
                title: 'Test',
                dateAdded: 1700000001000,
                index: 1,
              },
            ],
          },
          {
            id: '2',
            title: 'Other Bookmarks',
            children: [],
          },
        ],
      },
    ];

    // Get flat array (like extension's flattenBookmarkTree)
    const flatArray = flattenBookmarkTree(browserTree);

    // Get nested format (like extension's convertBrowserBookmarks)
    const nestedFormat = convertBrowserBookmarks(browserTree);

    // Compute checksums
    const flatChecksum = generateChecksumFromFlat(flatArray);
    const nestedChecksum = generateChecksumFromNested(nestedFormat);

    console.log('Flat array:', JSON.stringify(flatArray, null, 2));
    console.log('Nested format:', JSON.stringify(nestedFormat, null, 2));
    console.log(
      'Extracted from nested:',
      JSON.stringify(extractBookmarksFromNested(nestedFormat), null, 2)
    );
    console.log('Flat checksum:', flatChecksum);
    console.log('Nested checksum:', nestedChecksum);

    expect(flatChecksum).toBe(nestedChecksum);
  });

  it('should produce same checksum with folders', () => {
    const browserTree = [
      {
        children: [
          {
            id: '1',
            title: 'Bookmarks Toolbar',
            children: [
              {
                id: 'b1',
                url: 'https://example.com',
                title: 'Example',
                dateAdded: 1700000000000,
                index: 0,
              },
              {
                id: 'f1',
                title: 'Work',
                dateAdded: 1700000002000,
                index: 1,
                children: [
                  {
                    id: 'b3',
                    url: 'https://work.com',
                    title: 'Work Site',
                    dateAdded: 1700000003000,
                    index: 0,
                  },
                ],
              },
              {
                id: 'b2',
                url: 'https://test.com',
                title: 'Test',
                dateAdded: 1700000001000,
                index: 2,
              },
            ],
          },
        ],
      },
    ];

    const flatArray = flattenBookmarkTree(browserTree);
    const nestedFormat = convertBrowserBookmarks(browserTree);

    const flatChecksum = generateChecksumFromFlat(flatArray);
    const nestedChecksum = generateChecksumFromNested(nestedFormat);

    console.log('Flat array with folders:', JSON.stringify(flatArray, null, 2));
    console.log(
      'Extracted from nested with folders:',
      JSON.stringify(extractBookmarksFromNested(nestedFormat), null, 2)
    );
    console.log('Flat checksum:', flatChecksum);
    console.log('Nested checksum:', nestedChecksum);

    expect(flatChecksum).toBe(nestedChecksum);
  });

  it('should produce same checksum regardless of dateAdded differences', () => {
    const browserTree1 = [
      {
        children: [
          {
            id: '1',
            title: 'Bookmarks Toolbar',
            children: [
              {
                id: 'b1',
                url: 'https://example.com',
                title: 'Example',
                dateAdded: 1700000000000,
                index: 0,
              },
            ],
          },
        ],
      },
    ];

    const browserTree2 = [
      {
        children: [
          {
            id: '1',
            title: 'Bookmarks Toolbar',
            children: [
              {
                id: 'b1',
                url: 'https://example.com',
                title: 'Example',
                dateAdded: 9999999999999,
                index: 0,
              },
            ],
          },
        ],
      },
    ];

    const flatChecksum1 = generateChecksumFromFlat(flattenBookmarkTree(browserTree1));
    const flatChecksum2 = generateChecksumFromFlat(flattenBookmarkTree(browserTree2));

    expect(flatChecksum1).toBe(flatChecksum2);
  });

  it('should detect order changes via index', () => {
    const browserTree1 = [
      {
        children: [
          {
            id: '1',
            title: 'Bookmarks Toolbar',
            children: [
              { id: 'b1', url: 'https://example.com', title: 'Example', index: 0 },
              { id: 'b2', url: 'https://test.com', title: 'Test', index: 1 },
            ],
          },
        ],
      },
    ];

    const browserTree2 = [
      {
        children: [
          {
            id: '1',
            title: 'Bookmarks Toolbar',
            children: [
              { id: 'b2', url: 'https://test.com', title: 'Test', index: 0 },
              { id: 'b1', url: 'https://example.com', title: 'Example', index: 1 },
            ],
          },
        ],
      },
    ];

    const flatChecksum1 = generateChecksumFromFlat(flattenBookmarkTree(browserTree1));
    const flatChecksum2 = generateChecksumFromFlat(flattenBookmarkTree(browserTree2));

    expect(flatChecksum1).not.toBe(flatChecksum2);
  });
});

describe('extractBookmarksFromNested', () => {
  it('should extract bookmarks with correct folderPath', () => {
    const nested = {
      roots: {
        toolbar: {
          title: 'Bookmarks Toolbar',
          children: [{ type: 'bookmark', url: 'https://example.com', title: 'Example', index: 0 }],
        },
      },
    };

    const extracted = extractBookmarksFromNested(nested);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].folderPath).toBe('Bookmarks Toolbar');
  });

  it('should extract folders with correct folderPath', () => {
    const nested = {
      roots: {
        toolbar: {
          title: 'Bookmarks Toolbar',
          children: [
            {
              type: 'folder',
              title: 'Work',
              index: 0,
              children: [{ type: 'bookmark', url: 'https://work.com', title: 'Work', index: 0 }],
            },
          ],
        },
      },
    };

    const extracted = extractBookmarksFromNested(nested);

    // Should have folder and bookmark
    expect(extracted).toHaveLength(2);

    // Folder should have folderPath = 'Bookmarks Toolbar' (its parent)
    const folder = extracted.find((i) => i.type === 'folder');
    expect(folder.folderPath).toBe('Bookmarks Toolbar');
    expect(folder.title).toBe('Work');

    // Bookmark should have folderPath = 'Bookmarks Toolbar/Work'
    const bookmark = extracted.find((i) => i.type === 'bookmark');
    expect(bookmark.folderPath).toBe('Bookmarks Toolbar/Work');
  });

  it('should use rootKey as fallback when root has no title', () => {
    const nested = {
      roots: {
        toolbar: {
          children: [{ type: 'bookmark', url: 'https://example.com', title: 'Example', index: 0 }],
        },
      },
    };

    const extracted = extractBookmarksFromNested(nested);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].folderPath).toBe('toolbar');
  });
});
