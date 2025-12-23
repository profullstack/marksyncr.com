/**
 * @fileoverview Tests for import/export module
 * Uses Vitest for testing
 */

import { describe, it, expect } from 'vitest';
import {
  // Import parsers
  parseNetscapeHtml,
  parseMarkSyncrJson,
  parsePocketExport,
  parseRaindropExport,
  parsePinboardJson,
  parseCsv,
  // Export formatters
  formatToNetscapeHtml,
  formatToJson,
  formatToCsv,
  formatToMarkdown,
  // Utilities
  detectImportFormat,
  validateImportData,
  parseImportFile,
  IMPORT_FORMATS,
  EXPORT_FORMATS,
} from '../src/import-export.js';

describe('Import/Export Module', () => {
  describe('IMPORT_FORMATS', () => {
    it('should have all supported import formats', () => {
      expect(IMPORT_FORMATS.NETSCAPE_HTML).toBe('netscape_html');
      expect(IMPORT_FORMATS.JSON).toBe('json');
      expect(IMPORT_FORMATS.POCKET).toBe('pocket');
      expect(IMPORT_FORMATS.RAINDROP).toBe('raindrop');
      expect(IMPORT_FORMATS.PINBOARD).toBe('pinboard');
      expect(IMPORT_FORMATS.CSV).toBe('csv');
    });
  });

  describe('EXPORT_FORMATS', () => {
    it('should have all supported export formats', () => {
      expect(EXPORT_FORMATS.HTML).toBe('html');
      expect(EXPORT_FORMATS.JSON).toBe('json');
      expect(EXPORT_FORMATS.CSV).toBe('csv');
      expect(EXPORT_FORMATS.MARKDOWN).toBe('markdown');
    });
  });

  describe('parseNetscapeHtml', () => {
    it('should parse basic Netscape HTML bookmark file', () => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Bookmarks Bar</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1609459200">Example Site</A>
        <DT><A HREF="https://test.com" ADD_DATE="1609545600">Test Site</A>
    </DL><p>
</DL><p>`;

      const result = parseNetscapeHtml(html);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Bookmarks Bar');
      expect(result.bookmarks[0].children).toHaveLength(2);
      expect(result.bookmarks[0].children[0].title).toBe('Example Site');
      expect(result.bookmarks[0].children[0].url).toBe('https://example.com');
    });

    it('should parse nested folders', () => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>Parent Folder</H3>
    <DL><p>
        <DT><H3>Child Folder</H3>
        <DL><p>
            <DT><A HREF="https://nested.com">Nested Bookmark</A>
        </DL><p>
    </DL><p>
</DL><p>`;

      const result = parseNetscapeHtml(html);

      expect(result.bookmarks[0].title).toBe('Parent Folder');
      // The parser flattens nested structures - verify bookmark exists
      expect(result.totalCount).toBeGreaterThan(0);
      // Find the nested bookmark somewhere in the structure
      const findBookmark = (items, title) => {
        for (const item of items) {
          if (item.title === title) return item;
          if (item.children) {
            const found = findBookmark(item.children, title);
            if (found) return found;
          }
        }
        return null;
      };
      expect(findBookmark(result.bookmarks, 'Nested Bookmark')).toBeTruthy();
    });

    it('should extract ADD_DATE as dateAdded', () => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1609459200">Example</A>
</DL><p>`;

      const result = parseNetscapeHtml(html);

      expect(result.bookmarks[0].dateAdded).toBeDefined();
    });

    it('should handle empty bookmark file', () => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
</DL><p>`;

      const result = parseNetscapeHtml(html);

      expect(result.bookmarks).toHaveLength(0);
    });

    it('should return metadata', () => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>My Bookmarks</TITLE>
<DL><p>
    <DT><A HREF="https://example.com">Example</A>
</DL><p>`;

      const result = parseNetscapeHtml(html);

      expect(result.format).toBe(IMPORT_FORMATS.NETSCAPE_HTML);
      expect(result.totalCount).toBeGreaterThan(0);
    });
  });

  describe('parsePocketExport', () => {
    it('should parse Pocket HTML export', () => {
      const html = `<!DOCTYPE html>
<html>
<head><title>Pocket Export</title></head>
<body>
<h1>Unread</h1>
<ul>
    <li><a href="https://article1.com" time_added="1609459200">Article 1</a></li>
    <li><a href="https://article2.com" time_added="1609545600">Article 2</a></li>
</ul>
<h1>Read Archive</h1>
<ul>
    <li><a href="https://article3.com" time_added="1609632000">Article 3</a></li>
</ul>
</body>
</html>`;

      const result = parsePocketExport(html);

      expect(result.bookmarks).toHaveLength(2); // Unread and Read Archive folders
      expect(result.format).toBe(IMPORT_FORMATS.POCKET);
    });

    it('should handle empty Pocket export', () => {
      const html = `<!DOCTYPE html>
<html>
<body>
<h1>Unread</h1>
<ul></ul>
</body>
</html>`;

      const result = parsePocketExport(html);

      expect(result.bookmarks).toBeDefined();
    });
  });

  describe('parseRaindropExport', () => {
    it('should parse Raindrop.io JSON export', () => {
      const json = JSON.stringify({
        items: [
          {
            title: 'Bookmark 1',
            link: 'https://example1.com',
            created: '2021-01-01T00:00:00Z',
            tags: ['tag1', 'tag2'],
            collection: { title: 'My Collection' },
          },
          {
            title: 'Bookmark 2',
            link: 'https://example2.com',
            created: '2021-01-02T00:00:00Z',
            tags: [],
            collection: { title: 'My Collection' },
          },
        ],
      });

      const result = parseRaindropExport(json);

      expect(result.bookmarks).toHaveLength(1); // One collection folder
      expect(result.bookmarks[0].title).toBe('My Collection');
      expect(result.bookmarks[0].children).toHaveLength(2);
      expect(result.format).toBe(IMPORT_FORMATS.RAINDROP);
    });

    it('should preserve tags from Raindrop', () => {
      const json = JSON.stringify({
        items: [
          {
            title: 'Tagged Bookmark',
            link: 'https://example.com',
            tags: ['important', 'work'],
            collection: { title: 'Default' },
          },
        ],
      });

      const result = parseRaindropExport(json);

      expect(result.bookmarks[0].children[0].tags).toEqual(['important', 'work']);
    });

    it('should handle empty Raindrop export', () => {
      const json = JSON.stringify({ items: [] });

      const result = parseRaindropExport(json);

      expect(result.bookmarks).toHaveLength(0);
    });
  });

  describe('parsePinboardJson', () => {
    it('should parse Pinboard JSON export', () => {
      const json = JSON.stringify([
        {
          href: 'https://example1.com',
          description: 'Example 1',
          extended: 'Extended description',
          time: '2021-01-01T00:00:00Z',
          tags: 'tag1 tag2',
          toread: 'no',
        },
        {
          href: 'https://example2.com',
          description: 'Example 2',
          extended: '',
          time: '2021-01-02T00:00:00Z',
          tags: 'tag3',
          toread: 'yes',
        },
      ]);

      const result = parsePinboardJson(json);

      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0].title).toBe('Example 1');
      expect(result.bookmarks[0].url).toBe('https://example1.com');
      expect(result.bookmarks[0].notes).toBe('Extended description');
      expect(result.format).toBe(IMPORT_FORMATS.PINBOARD);
    });

    it('should parse tags from space-separated string', () => {
      const json = JSON.stringify([
        {
          href: 'https://example.com',
          description: 'Example',
          tags: 'tag1 tag2 tag3',
        },
      ]);

      const result = parsePinboardJson(json);

      expect(result.bookmarks[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle empty Pinboard export', () => {
      const json = JSON.stringify([]);

      const result = parsePinboardJson(json);

      expect(result.bookmarks).toHaveLength(0);
    });
  });

  describe('parseMarkSyncrJson', () => {
    it('should parse MarkSyncr JSON export format', () => {
      const json = JSON.stringify({
        version: '1.1',
        source: 'MarkSyncr',
        exportedAt: '2024-01-01T00:00:00Z',
        bookmarks: [
          {
            id: '1',
            title: 'Example 1',
            url: 'https://example1.com',
            type: 'bookmark',
            dateAdded: 1609459200000,
          },
          {
            id: '2',
            title: 'Example 2',
            url: 'https://example2.com',
            type: 'bookmark',
            tags: ['tag1', 'tag2'],
            notes: 'Some notes',
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0].title).toBe('Example 1');
      expect(result.bookmarks[0].url).toBe('https://example1.com');
      expect(result.bookmarks[1].tags).toEqual(['tag1', 'tag2']);
      expect(result.bookmarks[1].notes).toBe('Some notes');
      expect(result.format).toBe(IMPORT_FORMATS.JSON);
      expect(result.totalCount).toBe(2);
    });

    it('should parse MarkSyncr JSON with nested folders', () => {
      const json = JSON.stringify({
        version: '1.1',
        source: 'MarkSyncr',
        bookmarks: [
          {
            id: '1',
            title: 'Folder',
            type: 'folder',
            children: [
              {
                id: '2',
                title: 'Nested Bookmark',
                url: 'https://nested.com',
                type: 'bookmark',
              },
            ],
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Folder');
      expect(result.bookmarks[0].type).toBe('folder');
      expect(result.bookmarks[0].children).toHaveLength(1);
      expect(result.bookmarks[0].children[0].title).toBe('Nested Bookmark');
      // totalCount only counts actual bookmarks, not folders
      expect(result.totalCount).toBe(1);
    });

    it('should parse generic JSON array of bookmarks', () => {
      const json = JSON.stringify([
        {
          title: 'Bookmark 1',
          url: 'https://example1.com',
        },
        {
          title: 'Bookmark 2',
          url: 'https://example2.com',
          tags: ['work'],
        },
      ]);

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0].title).toBe('Bookmark 1');
      expect(result.bookmarks[0].url).toBe('https://example1.com');
      expect(result.bookmarks[1].tags).toEqual(['work']);
      expect(result.format).toBe(IMPORT_FORMATS.JSON);
    });

    it('should handle empty MarkSyncr export', () => {
      const json = JSON.stringify({
        version: '1.1',
        source: 'MarkSyncr',
        bookmarks: [],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('should handle empty JSON array', () => {
      const json = JSON.stringify([]);

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('should throw error for invalid JSON format', () => {
      const json = JSON.stringify({ invalid: 'data' });

      expect(() => parseMarkSyncrJson(json)).toThrow('Invalid JSON bookmark format');
    });

    it('should throw error for non-JSON string', () => {
      const notJson = 'this is not json';

      expect(() => parseMarkSyncrJson(notJson)).toThrow();
    });

    it('should preserve all bookmark properties', () => {
      const json = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [
          {
            id: 'custom-id',
            title: 'Full Bookmark',
            url: 'https://example.com',
            type: 'bookmark',
            dateAdded: 1609459200000,
            dateModified: 1609545600000,
            tags: ['tag1', 'tag2'],
            notes: 'Detailed notes',
            favicon: 'https://example.com/favicon.ico',
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks[0].id).toBe('custom-id');
      expect(result.bookmarks[0].dateAdded).toBe(1609459200000);
      expect(result.bookmarks[0].dateModified).toBe(1609545600000);
      expect(result.bookmarks[0].favicon).toBe('https://example.com/favicon.ico');
    });

    it('should parse GitHub repo format with folderPath', () => {
      // GitHub repo sync format uses flat bookmarks with folderPath
      const json = JSON.stringify({
        version: '1.0',
        metadata: {
          createdAt: '2024-01-01T00:00:00Z',
          lastModified: '2024-01-02T00:00:00Z',
          source: 'MarkSyncr',
        },
        bookmarks: [
          {
            url: 'https://example1.com',
            title: 'Root Bookmark',
            dateAdded: 1609459200000,
          },
          {
            url: 'https://example2.com',
            title: 'Work Bookmark',
            folderPath: 'Work',
            dateAdded: 1609545600000,
          },
          {
            url: 'https://example3.com',
            title: 'Nested Bookmark',
            folderPath: 'Work/Projects',
            dateAdded: 1609632000000,
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      // Should convert to nested structure
      expect(result.format).toBe(IMPORT_FORMATS.JSON);
      expect(result.totalCount).toBe(3);
      
      // Root bookmark should be at top level
      const rootBookmark = result.bookmarks.find(b => b.title === 'Root Bookmark');
      expect(rootBookmark).toBeDefined();
      expect(rootBookmark.url).toBe('https://example1.com');
      expect(rootBookmark.id).toBeDefined(); // Should have generated ID
      
      // Work folder should exist
      const workFolder = result.bookmarks.find(b => b.title === 'Work' && b.type === 'folder');
      expect(workFolder).toBeDefined();
      expect(workFolder.id).toBeDefined();
      expect(workFolder.children).toBeDefined();
      
      // Work bookmark should be inside Work folder
      const workBookmark = workFolder.children.find(b => b.title === 'Work Bookmark');
      expect(workBookmark).toBeDefined();
      expect(workBookmark.url).toBe('https://example2.com');
      expect(workBookmark.id).toBeDefined();
      
      // Projects folder should be inside Work folder
      const projectsFolder = workFolder.children.find(b => b.title === 'Projects' && b.type === 'folder');
      expect(projectsFolder).toBeDefined();
      
      // Nested bookmark should be inside Projects folder
      const nestedBookmark = projectsFolder.children.find(b => b.title === 'Nested Bookmark');
      expect(nestedBookmark).toBeDefined();
      expect(nestedBookmark.url).toBe('https://example3.com');
      expect(nestedBookmark.id).toBeDefined();
    });

    it('should generate IDs for bookmarks without IDs', () => {
      const json = JSON.stringify({
        version: '1.0',
        bookmarks: [
          {
            title: 'No ID Bookmark',
            url: 'https://example.com',
            type: 'bookmark',
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks[0].id).toBeDefined();
      expect(result.bookmarks[0].id).toMatch(/^import-/);
    });

    it('should generate IDs for nested bookmarks without IDs', () => {
      const json = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [
          {
            title: 'Folder',
            type: 'folder',
            children: [
              {
                title: 'Child Bookmark',
                url: 'https://example.com',
                type: 'bookmark',
              },
            ],
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks[0].id).toBeDefined();
      expect(result.bookmarks[0].children[0].id).toBeDefined();
    });

    it('should handle GitHub repo format with empty folderPath', () => {
      const json = JSON.stringify({
        version: '1.0',
        bookmarks: [
          {
            url: 'https://example.com',
            title: 'Bookmark',
            folderPath: '',
          },
        ],
      });

      const result = parseMarkSyncrJson(json);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Bookmark');
      expect(result.bookmarks[0].id).toBeDefined();
    });

    it('should handle mixed folderPath depths', () => {
      const json = JSON.stringify({
        version: '1.0',
        bookmarks: [
          { url: 'https://a.com', title: 'A', folderPath: 'Folder1' },
          { url: 'https://b.com', title: 'B', folderPath: 'Folder1/Sub1' },
          { url: 'https://c.com', title: 'C', folderPath: 'Folder1/Sub1/Deep' },
          { url: 'https://d.com', title: 'D', folderPath: 'Folder2' },
        ],
      });

      const result = parseMarkSyncrJson(json);

      // Should have 2 top-level folders
      const folders = result.bookmarks.filter(b => b.type === 'folder');
      expect(folders).toHaveLength(2);
      
      const folder1 = folders.find(f => f.title === 'Folder1');
      expect(folder1).toBeDefined();
      
      // Folder1 should have bookmark A and subfolder Sub1
      expect(folder1.children.find(c => c.title === 'A')).toBeDefined();
      const sub1 = folder1.children.find(c => c.title === 'Sub1');
      expect(sub1).toBeDefined();
      
      // Sub1 should have bookmark B and subfolder Deep
      expect(sub1.children.find(c => c.title === 'B')).toBeDefined();
      const deep = sub1.children.find(c => c.title === 'Deep');
      expect(deep).toBeDefined();
      
      // Deep should have bookmark C
      expect(deep.children.find(c => c.title === 'C')).toBeDefined();
      
      // Folder2 should have bookmark D
      const folder2 = folders.find(f => f.title === 'Folder2');
      expect(folder2.children.find(c => c.title === 'D')).toBeDefined();
    });
  });

  describe('parseCsv', () => {
    it('should parse CSV with headers', () => {
      const csv = `title,url,folder,tags,notes
"Example 1","https://example1.com","Folder A","tag1,tag2","Some notes"
"Example 2","https://example2.com","Folder B","tag3",""`;

      const result = parseCsv(csv);

      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0].title).toBe('Example 1');
      expect(result.bookmarks[0].url).toBe('https://example1.com');
      expect(result.format).toBe(IMPORT_FORMATS.CSV);
    });

    it('should handle CSV without quotes', () => {
      const csv = `title,url
Example,https://example.com`;

      const result = parseCsv(csv);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Example');
    });

    it('should handle empty CSV', () => {
      const csv = `title,url`;

      const result = parseCsv(csv);

      expect(result.bookmarks).toHaveLength(0);
    });

    it('should parse tags from comma-separated string', () => {
      const csv = `title,url,tags
"Example","https://example.com","tag1,tag2,tag3"`;

      const result = parseCsv(csv);

      expect(result.bookmarks[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('formatToNetscapeHtml', () => {
    it('should format bookmarks to Netscape HTML', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Folder',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Example',
              url: 'https://example.com',
              type: 'bookmark',
              dateAdded: 1609459200000,
            },
          ],
        },
      ];

      const html = formatToNetscapeHtml(bookmarks);

      expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
      expect(html).toContain('<H3 ADD_DATE=');
      expect(html).toContain('>Folder</H3>');
      expect(html).toContain('HREF="https://example.com"');
      expect(html).toContain('>Example</A>');
    });

    it('should handle nested folders', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Parent',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Child',
              type: 'folder',
              children: [
                {
                  id: '3',
                  title: 'Nested',
                  url: 'https://nested.com',
                  type: 'bookmark',
                },
              ],
            },
          ],
        },
      ];

      const html = formatToNetscapeHtml(bookmarks);

      expect(html).toContain('>Parent</H3>');
      expect(html).toContain('>Child</H3>');
      expect(html).toContain('https://nested.com');
    });

    it('should handle empty bookmarks array', () => {
      const html = formatToNetscapeHtml([]);

      expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    });
  });

  describe('formatToJson', () => {
    it('should format bookmarks to JSON', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example',
          url: 'https://example.com',
          type: 'bookmark',
        },
      ];

      const json = formatToJson(bookmarks);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.1');
      expect(parsed.bookmarks).toHaveLength(1);
      expect(parsed.bookmarks[0].title).toBe('Example');
    });

    it('should include metadata', () => {
      const bookmarks = [];
      const json = formatToJson(bookmarks);
      const parsed = JSON.parse(json);

      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.source).toBe('MarkSyncr');
    });

    it('should preserve tags and notes', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example',
          url: 'https://example.com',
          tags: [{ id: 't1', name: 'tag1' }],
          notes: 'Some notes',
        },
      ];

      const json = formatToJson(bookmarks);
      const parsed = JSON.parse(json);

      expect(parsed.bookmarks[0].tags).toHaveLength(1);
      expect(parsed.bookmarks[0].notes).toBe('Some notes');
    });
  });

  describe('formatToCsv', () => {
    it('should format bookmarks to CSV', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example',
          url: 'https://example.com',
          type: 'bookmark',
        },
      ];

      const csv = formatToCsv(bookmarks);

      expect(csv).toContain('title,url,folder,tags,notes,dateAdded');
      expect(csv).toContain('"Example"');
      expect(csv).toContain('"https://example.com"');
    });

    it('should escape quotes in values', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example "with quotes"',
          url: 'https://example.com',
        },
      ];

      const csv = formatToCsv(bookmarks);

      expect(csv).toContain('""with quotes""');
    });

    it('should flatten nested folders', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Folder',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Bookmark',
              url: 'https://example.com',
              type: 'bookmark',
            },
          ],
        },
      ];

      const csv = formatToCsv(bookmarks);

      expect(csv).toContain('"Folder"'); // folder path
      expect(csv).toContain('"Bookmark"');
    });

    it('should include tags as comma-separated string', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example',
          url: 'https://example.com',
          tags: [{ name: 'tag1' }, { name: 'tag2' }],
        },
      ];

      const csv = formatToCsv(bookmarks);

      expect(csv).toContain('"tag1,tag2"');
    });
  });

  describe('formatToMarkdown', () => {
    it('should format bookmarks to Markdown', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Folder',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Example',
              url: 'https://example.com',
              type: 'bookmark',
            },
          ],
        },
      ];

      const md = formatToMarkdown(bookmarks);

      expect(md).toContain('# Bookmarks');
      expect(md).toContain('## Folder');
      expect(md).toContain('- [Example](https://example.com)');
    });

    it('should handle nested folders with proper heading levels', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Level 1',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Level 2',
              type: 'folder',
              children: [
                {
                  id: '3',
                  title: 'Bookmark',
                  url: 'https://example.com',
                  type: 'bookmark',
                },
              ],
            },
          ],
        },
      ];

      const md = formatToMarkdown(bookmarks);

      expect(md).toContain('## Level 1');
      expect(md).toContain('### Level 2');
    });

    it('should include notes as blockquote', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example',
          url: 'https://example.com',
          notes: 'Some notes about this bookmark',
        },
      ];

      const md = formatToMarkdown(bookmarks);

      expect(md).toContain('> Some notes about this bookmark');
    });

    it('should include tags', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Example',
          url: 'https://example.com',
          tags: [{ name: 'tag1' }, { name: 'tag2' }],
        },
      ];

      const md = formatToMarkdown(bookmarks);

      expect(md).toContain('`tag1`');
      expect(md).toContain('`tag2`');
    });
  });

  describe('detectImportFormat', () => {
    it('should detect Netscape HTML format', () => {
      const content = '<!DOCTYPE NETSCAPE-Bookmark-file-1>';
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.NETSCAPE_HTML);
    });

    it('should detect Pocket export format', () => {
      const content = '<html><body><h1>Unread</h1><ul>';
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.POCKET);
    });

    it('should detect MarkSyncr JSON format with source property', () => {
      const content = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [{ title: 'Test', url: 'https://example.com' }],
      });
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.JSON);
    });

    it('should detect MarkSyncr JSON format with version property', () => {
      const content = JSON.stringify({
        version: '1.1',
        bookmarks: [{ title: 'Test', url: 'https://example.com' }],
      });
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.JSON);
    });

    it('should detect generic JSON array with url property', () => {
      const content = JSON.stringify([
        { title: 'Test', url: 'https://example.com' },
      ]);
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.JSON);
    });

    it('should detect Raindrop JSON format', () => {
      const content = JSON.stringify({ items: [] });
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.RAINDROP);
    });

    it('should detect Pinboard JSON format', () => {
      const content = JSON.stringify([{ href: 'https://example.com' }]);
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.PINBOARD);
    });

    it('should detect CSV format', () => {
      const content = 'title,url\nExample,https://example.com';
      expect(detectImportFormat(content)).toBe(IMPORT_FORMATS.CSV);
    });

    it('should return null for unknown format', () => {
      const content = 'random content that is not a bookmark file';
      expect(detectImportFormat(content)).toBe(null);
    });
  });

  describe('parseImportFile', () => {
    it('should parse MarkSyncr JSON format', () => {
      const content = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [
          { title: 'Test', url: 'https://example.com' },
        ],
      });

      const result = parseImportFile(content, IMPORT_FORMATS.JSON);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Test');
      expect(result.format).toBe(IMPORT_FORMATS.JSON);
    });

    it('should auto-detect and parse MarkSyncr JSON format', () => {
      const content = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [
          { title: 'Auto-detected', url: 'https://example.com' },
        ],
      });

      const result = parseImportFile(content);

      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Auto-detected');
      expect(result.format).toBe(IMPORT_FORMATS.JSON);
    });

    it('should parse Netscape HTML format', () => {
      const content = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://example.com">Example</A>
</DL><p>`;

      const result = parseImportFile(content, IMPORT_FORMATS.NETSCAPE_HTML);

      expect(result.bookmarks).toBeDefined();
      expect(result.format).toBe(IMPORT_FORMATS.NETSCAPE_HTML);
    });
  });

  describe('validateImportData', () => {
    it('should validate correct import data', () => {
      const data = {
        format: IMPORT_FORMATS.NETSCAPE_HTML,
        bookmarks: [
          { title: 'Example', url: 'https://example.com' },
        ],
        totalCount: 1,
      };

      const result = validateImportData(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject data without bookmarks array', () => {
      const data = { format: IMPORT_FORMATS.NETSCAPE_HTML };

      const result = validateImportData(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing bookmarks array');
    });

    it('should reject bookmarks without URLs', () => {
      const data = {
        format: IMPORT_FORMATS.NETSCAPE_HTML,
        bookmarks: [
          { title: 'No URL' },
        ],
        totalCount: 1,
      };

      const result = validateImportData(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('URL'))).toBe(true);
    });

    it('should allow folders without URLs', () => {
      const data = {
        format: IMPORT_FORMATS.NETSCAPE_HTML,
        bookmarks: [
          {
            title: 'Folder',
            type: 'folder',
            children: [
              { title: 'Bookmark', url: 'https://example.com' },
            ],
          },
        ],
        totalCount: 2,
      };

      const result = validateImportData(data);

      expect(result.valid).toBe(true);
    });
  });
});
