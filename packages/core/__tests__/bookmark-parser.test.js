/**
 * Tests for bookmark-parser.js
 * Using Vitest
 */

import { describe, it, expect } from 'vitest';
import {
  BROWSER_TYPES,
  detectBrowser,
  parseBrowserBookmarks,
  serializeToBrowserFormat,
  getBrowserRootIds,
  flattenBookmarks,
  findBookmarkById,
  findBookmarksByUrl,
  countBookmarks,
  validateBookmarkFile,
} from '../src/bookmark-parser.js';

// Mock Chrome bookmark tree
const mockChromeTree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks Bar',
        dateAdded: 1609459200000,
        children: [
          {
            id: '10',
            title: 'Google',
            url: 'https://google.com',
            dateAdded: 1609459200000,
          },
          {
            id: '11',
            title: 'Dev Tools',
            dateAdded: 1609459200000,
            children: [
              {
                id: '110',
                title: 'GitHub',
                url: 'https://github.com',
                dateAdded: 1609459200000,
              },
            ],
          },
        ],
      },
      {
        id: '2',
        title: 'Other Bookmarks',
        dateAdded: 1609459200000,
        children: [
          {
            id: '20',
            title: 'News',
            url: 'https://news.ycombinator.com',
            dateAdded: 1609459200000,
          },
        ],
      },
    ],
  },
];

// Mock Firefox bookmark tree
const mockFirefoxTree = [
  {
    id: 'root________',
    title: '',
    children: [
      {
        id: 'toolbar_____',
        title: 'Bookmarks Toolbar',
        dateAdded: 1609459200000,
        children: [
          {
            id: 'abc123',
            title: 'MDN',
            url: 'https://developer.mozilla.org',
            dateAdded: 1609459200000,
          },
        ],
      },
      {
        id: 'menu________',
        title: 'Bookmarks Menu',
        dateAdded: 1609459200000,
        children: [],
      },
      {
        id: 'unfiled_____',
        title: 'Other Bookmarks',
        dateAdded: 1609459200000,
        children: [],
      },
    ],
  },
];

// Valid bookmark file for testing
const validBookmarkFile = {
  version: '1.0.0',
  exportedAt: '2024-01-01T00:00:00.000Z',
  browser: 'chrome',
  checksum: 'abc123',
  roots: {
    toolbar: {
      id: 'root-toolbar',
      type: 'folder',
      title: 'Bookmarks Toolbar',
      children: [
        {
          id: 'bm-1',
          type: 'bookmark',
          title: 'Google',
          url: 'https://google.com',
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'folder-1',
          type: 'folder',
          title: 'Dev',
          children: [
            {
              id: 'bm-2',
              type: 'bookmark',
              title: 'GitHub',
              url: 'https://github.com',
              dateAdded: '2024-01-01T00:00:00.000Z',
            },
          ],
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
      ],
      dateAdded: '2024-01-01T00:00:00.000Z',
    },
    menu: {
      id: 'root-menu',
      type: 'folder',
      title: 'Bookmarks Menu',
      children: [],
      dateAdded: '2024-01-01T00:00:00.000Z',
    },
    other: {
      id: 'root-other',
      type: 'folder',
      title: 'Other Bookmarks',
      children: [
        {
          id: 'bm-3',
          type: 'bookmark',
          title: 'HN',
          url: 'https://news.ycombinator.com',
          dateAdded: '2024-01-01T00:00:00.000Z',
        },
      ],
      dateAdded: '2024-01-01T00:00:00.000Z',
    },
  },
};

describe('bookmark-parser', () => {
  describe('BROWSER_TYPES', () => {
    it('should export browser type constants', () => {
      expect(BROWSER_TYPES.CHROME).toBe('chrome');
      expect(BROWSER_TYPES.FIREFOX).toBe('firefox');
      expect(BROWSER_TYPES.SAFARI).toBe('safari');
      expect(BROWSER_TYPES.EDGE).toBe('edge');
      expect(BROWSER_TYPES.UNKNOWN).toBe('unknown');
    });
  });

  describe('detectBrowser', () => {
    it('should detect Chrome from bookmark structure', () => {
      const browser = detectBrowser(mockChromeTree);
      expect(browser).toBe(BROWSER_TYPES.CHROME);
    });

    it('should detect Firefox from bookmark structure', () => {
      const browser = detectBrowser(mockFirefoxTree);
      expect(browser).toBe(BROWSER_TYPES.FIREFOX);
    });

    it('should return unknown for empty tree', () => {
      const browser = detectBrowser([]);
      expect(browser).toBe(BROWSER_TYPES.UNKNOWN);
    });

    it('should return unknown for null input', () => {
      const browser = detectBrowser(null);
      expect(browser).toBe(BROWSER_TYPES.UNKNOWN);
    });
  });

  describe('parseBrowserBookmarks', () => {
    it('should parse Chrome bookmarks correctly', () => {
      const result = parseBrowserBookmarks(mockChromeTree, {
        browser: BROWSER_TYPES.CHROME,
      });

      expect(result.version).toBe('1.0.0');
      expect(result.browser).toBe(BROWSER_TYPES.CHROME);
      expect(result.roots).toBeDefined();
      expect(result.roots.toolbar).toBeDefined();
      expect(result.roots.menu).toBeDefined();
      expect(result.roots.other).toBeDefined();
      expect(result.checksum).toBeTruthy();
    });

    it('should preserve toolbar bookmarks', () => {
      const result = parseBrowserBookmarks(mockChromeTree, {
        browser: BROWSER_TYPES.CHROME,
      });

      expect(result.roots.toolbar.children).toHaveLength(2);
      expect(result.roots.toolbar.children[0].title).toBe('Google');
      expect(result.roots.toolbar.children[0].url).toBe('https://google.com');
      expect(result.roots.toolbar.children[0].type).toBe('bookmark');
    });

    it('should preserve folder structure', () => {
      const result = parseBrowserBookmarks(mockChromeTree, {
        browser: BROWSER_TYPES.CHROME,
      });

      const devFolder = result.roots.toolbar.children[1];
      expect(devFolder.type).toBe('folder');
      expect(devFolder.title).toBe('Dev Tools');
      expect(devFolder.children).toHaveLength(1);
      expect(devFolder.children[0].title).toBe('GitHub');
    });

    it('should parse Firefox bookmarks correctly', () => {
      const result = parseBrowserBookmarks(mockFirefoxTree, {
        browser: BROWSER_TYPES.FIREFOX,
      });

      expect(result.browser).toBe(BROWSER_TYPES.FIREFOX);
      expect(result.roots.toolbar.children).toHaveLength(1);
      expect(result.roots.toolbar.children[0].title).toBe('MDN');
    });

    it('should generate unique IDs for bookmarks', () => {
      const result = parseBrowserBookmarks(mockChromeTree, {
        browser: BROWSER_TYPES.CHROME,
      });

      const ids = new Set();
      function collectIds(items) {
        for (const item of items) {
          ids.add(item.id);
          if (item.children) {
            collectIds(item.children);
          }
        }
      }

      collectIds(result.roots.toolbar.children);
      collectIds(result.roots.other.children);

      // All IDs should be unique
      expect(ids.size).toBe(4); // Google, Dev Tools folder, GitHub, News
    });

    it('should convert dates to ISO strings', () => {
      const result = parseBrowserBookmarks(mockChromeTree, {
        browser: BROWSER_TYPES.CHROME,
      });

      const bookmark = result.roots.toolbar.children[0];
      expect(bookmark.dateAdded).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getBrowserRootIds', () => {
    it('should get Chrome root IDs', () => {
      const rootIds = getBrowserRootIds(mockChromeTree, BROWSER_TYPES.CHROME);

      expect(rootIds.toolbar).toBe('1');
      expect(rootIds.menu).toBe('2'); // "Other Bookmarks" maps to menu in Chrome
    });

    it('should get Firefox root IDs', () => {
      const rootIds = getBrowserRootIds(mockFirefoxTree, BROWSER_TYPES.FIREFOX);

      expect(rootIds.toolbar).toBe('toolbar_____');
      expect(rootIds.menu).toBe('menu________');
      expect(rootIds.other).toBe('unfiled_____');
    });
  });

  describe('serializeToBrowserFormat', () => {
    it('should create browser operations from bookmark file', () => {
      const rootIds = {
        toolbar: '1',
        menu: '2',
        other: '3',
      };

      const operations = serializeToBrowserFormat(validBookmarkFile, rootIds);

      expect(operations).toBeInstanceOf(Array);
      expect(operations.length).toBeGreaterThan(0);
    });

    it('should include parent IDs in operations', () => {
      const rootIds = {
        toolbar: '1',
        menu: '2',
        other: '3',
      };

      const operations = serializeToBrowserFormat(validBookmarkFile, rootIds);

      // First operation should be for toolbar
      const toolbarOps = operations.filter((op) => op.parentId === '1');
      expect(toolbarOps.length).toBeGreaterThan(0);
    });

    it('should mark folders correctly', () => {
      const rootIds = {
        toolbar: '1',
        menu: '2',
        other: '3',
      };

      const operations = serializeToBrowserFormat(validBookmarkFile, rootIds);

      const folderOp = operations.find((op) => op.isFolder);
      expect(folderOp).toBeDefined();
      expect(folderOp.item.title).toBe('Dev');
    });
  });

  describe('flattenBookmarks', () => {
    it('should flatten all bookmarks with paths', () => {
      const flattened = flattenBookmarks(validBookmarkFile);

      expect(flattened).toBeInstanceOf(Array);
      expect(flattened.length).toBe(3); // Google, GitHub, HN
    });

    it('should include correct paths', () => {
      const flattened = flattenBookmarks(validBookmarkFile);

      const google = flattened.find((b) => b.bookmark.title === 'Google');
      expect(google.path).toEqual(['toolbar', 'Google']);

      const github = flattened.find((b) => b.bookmark.title === 'GitHub');
      expect(github.path).toEqual(['toolbar', 'Dev', 'GitHub']);
    });

    it('should only include bookmarks, not folders', () => {
      const flattened = flattenBookmarks(validBookmarkFile);

      const hasFolder = flattened.some((b) => b.bookmark.type === 'folder');
      expect(hasFolder).toBe(false);
    });
  });

  describe('findBookmarkById', () => {
    it('should find bookmark by ID', () => {
      const bookmark = findBookmarkById(validBookmarkFile, 'bm-1');

      expect(bookmark).toBeDefined();
      expect(bookmark.title).toBe('Google');
    });

    it('should find nested bookmark by ID', () => {
      const bookmark = findBookmarkById(validBookmarkFile, 'bm-2');

      expect(bookmark).toBeDefined();
      expect(bookmark.title).toBe('GitHub');
    });

    it('should find folder by ID', () => {
      const folder = findBookmarkById(validBookmarkFile, 'folder-1');

      expect(folder).toBeDefined();
      expect(folder.type).toBe('folder');
      expect(folder.title).toBe('Dev');
    });

    it('should return null for non-existent ID', () => {
      const bookmark = findBookmarkById(validBookmarkFile, 'non-existent');

      expect(bookmark).toBeNull();
    });
  });

  describe('findBookmarksByUrl', () => {
    it('should find bookmarks by URL', () => {
      const bookmarks = findBookmarksByUrl(validBookmarkFile, 'https://google.com');

      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].title).toBe('Google');
    });

    it('should return empty array for non-existent URL', () => {
      const bookmarks = findBookmarksByUrl(validBookmarkFile, 'https://nonexistent.com');

      expect(bookmarks).toHaveLength(0);
    });

    it('should find multiple bookmarks with same URL', () => {
      const fileWithDuplicates = {
        ...validBookmarkFile,
        roots: {
          ...validBookmarkFile.roots,
          other: {
            ...validBookmarkFile.roots.other,
            children: [
              ...validBookmarkFile.roots.other.children,
              {
                id: 'bm-dup',
                type: 'bookmark',
                title: 'Google Duplicate',
                url: 'https://google.com',
                dateAdded: '2024-01-01T00:00:00.000Z',
              },
            ],
          },
        },
      };

      const bookmarks = findBookmarksByUrl(fileWithDuplicates, 'https://google.com');

      expect(bookmarks).toHaveLength(2);
    });
  });

  describe('countBookmarks', () => {
    it('should count bookmarks and folders correctly', () => {
      const counts = countBookmarks(validBookmarkFile);

      expect(counts.bookmarks).toBe(3); // Google, GitHub, HN
      expect(counts.folders).toBe(1); // Dev folder
      expect(counts.total).toBe(4);
    });

    it('should handle empty bookmark file', () => {
      const emptyFile = {
        version: '1.0.0',
        roots: {
          toolbar: { children: [] },
          menu: { children: [] },
          other: { children: [] },
        },
      };

      const counts = countBookmarks(emptyFile);

      expect(counts.bookmarks).toBe(0);
      expect(counts.folders).toBe(0);
      expect(counts.total).toBe(0);
    });
  });

  describe('validateBookmarkFile', () => {
    it('should validate correct bookmark file', () => {
      const result = validateBookmarkFile(validBookmarkFile);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null input', () => {
      const result = validateBookmarkFile(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Bookmark file must be an object');
    });

    it('should reject missing version', () => {
      const invalid = { ...validBookmarkFile };
      delete invalid.version;

      const result = validateBookmarkFile(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing version field');
    });

    it('should reject missing roots', () => {
      const invalid = { version: '1.0.0' };

      const result = validateBookmarkFile(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid roots field');
    });

    it('should reject missing root folders', () => {
      const invalid = {
        version: '1.0.0',
        roots: {
          toolbar: { children: [] },
          // missing menu and other
        },
      };

      const result = validateBookmarkFile(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing root folder: menu');
      expect(result.errors).toContain('Missing root folder: other');
    });

    it('should reject roots without children array', () => {
      const invalid = {
        version: '1.0.0',
        roots: {
          toolbar: { children: [] },
          menu: { children: [] },
          other: { title: 'Other' }, // missing children
        },
      };

      const result = validateBookmarkFile(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Root folder other must have children array');
    });
  });
});
