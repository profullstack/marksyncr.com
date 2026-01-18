/**
 * @fileoverview Tests for Options page Data Management functionality
 * Tests the import/export logic used in the Options component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseImportFile,
  formatToNetscapeHtml,
  formatToJson,
  detectImportFormat,
  IMPORT_FORMATS,
  EXPORT_FORMATS,
} from '@marksyncr/core';

describe('Options Data Management', () => {
  describe('Export Functionality', () => {
    const sampleBookmarks = [
      {
        id: '1',
        title: 'Bookmarks Bar',
        type: 'folder',
        children: [
          {
            id: '2',
            title: 'Example Site',
            url: 'https://example.com',
            type: 'bookmark',
            dateAdded: 1609459200000,
          },
          {
            id: '3',
            title: 'Test Site',
            url: 'https://test.com',
            type: 'bookmark',
            dateAdded: 1609545600000,
          },
        ],
      },
    ];

    it('should export bookmarks to JSON format', () => {
      const json = formatToJson(sampleBookmarks);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.1');
      expect(parsed.source).toBe('MarkSyncr');
      expect(parsed.exportedAt).toBeDefined();
      expect(parsed.bookmarks).toHaveLength(1);
      expect(parsed.bookmarks[0].title).toBe('Bookmarks Bar');
      expect(parsed.bookmarks[0].children).toHaveLength(2);
    });

    it('should export bookmarks to HTML format', () => {
      const html = formatToNetscapeHtml(sampleBookmarks);

      expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
      expect(html).toContain('Bookmarks Bar');
      expect(html).toContain('https://example.com');
      expect(html).toContain('https://test.com');
    });

    it('should preserve bookmark metadata in JSON export', () => {
      const bookmarksWithMetadata = [
        {
          id: '1',
          title: 'Tagged Bookmark',
          url: 'https://example.com',
          type: 'bookmark',
          tags: [
            { id: 't1', name: 'work' },
            { id: 't2', name: 'important' },
          ],
          notes: 'This is a test note',
          dateAdded: 1609459200000,
        },
      ];

      const json = formatToJson(bookmarksWithMetadata);
      const parsed = JSON.parse(json);

      expect(parsed.bookmarks[0].tags).toHaveLength(2);
      expect(parsed.bookmarks[0].notes).toBe('This is a test note');
    });

    it('should handle empty bookmarks array', () => {
      const json = formatToJson([]);
      const parsed = JSON.parse(json);

      expect(parsed.bookmarks).toHaveLength(0);
      expect(parsed.source).toBe('MarkSyncr');
    });

    it('should handle deeply nested folders', () => {
      const nestedBookmarks = [
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
                  title: 'Level 3',
                  type: 'folder',
                  children: [
                    {
                      id: '4',
                      title: 'Deep Bookmark',
                      url: 'https://deep.com',
                      type: 'bookmark',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const json = formatToJson(nestedBookmarks);
      const parsed = JSON.parse(json);

      expect(parsed.bookmarks[0].children[0].children[0].children[0].title).toBe('Deep Bookmark');
    });
  });

  describe('Import Functionality', () => {
    it('should detect and parse JSON format', () => {
      const jsonContent = JSON.stringify({
        source: 'MarkSyncr',
        version: '1.1',
        bookmarks: [{ title: 'Test', url: 'https://test.com' }],
      });

      const format = detectImportFormat(jsonContent);
      expect(format).toBe(IMPORT_FORMATS.JSON);

      const result = parseImportFile(jsonContent, format);
      expect(result.bookmarks).toHaveLength(1);
      expect(result.bookmarks[0].title).toBe('Test');
    });

    it('should detect and parse HTML format', () => {
      const htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1609459200">Example</A>
</DL><p>`;

      const format = detectImportFormat(htmlContent);
      expect(format).toBe(IMPORT_FORMATS.NETSCAPE_HTML);

      const result = parseImportFile(htmlContent, format);
      expect(result.bookmarks).toBeDefined();
      expect(result.format).toBe(IMPORT_FORMATS.NETSCAPE_HTML);
    });

    it('should handle JSON array format', () => {
      const jsonArray = JSON.stringify([
        { title: 'Bookmark 1', url: 'https://example1.com' },
        { title: 'Bookmark 2', url: 'https://example2.com' },
      ]);

      const format = detectImportFormat(jsonArray);
      expect(format).toBe(IMPORT_FORMATS.JSON);

      const result = parseImportFile(jsonArray, format);
      expect(result.bookmarks).toHaveLength(2);
    });

    it('should return null for unknown format', () => {
      const unknownContent = 'This is not a valid bookmark file';
      const format = detectImportFormat(unknownContent);
      expect(format).toBe(null);
    });

    it('should throw error for invalid JSON structure', () => {
      const invalidJson = JSON.stringify({ invalid: 'structure' });

      expect(() => parseImportFile(invalidJson, IMPORT_FORMATS.JSON)).toThrow(
        'Invalid JSON bookmark format'
      );
    });

    it('should preserve tags from imported JSON', () => {
      const jsonWithTags = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [
          {
            title: 'Tagged',
            url: 'https://example.com',
            tags: ['work', 'important'],
          },
        ],
      });

      const result = parseImportFile(jsonWithTags, IMPORT_FORMATS.JSON);
      expect(result.bookmarks[0].tags).toEqual(['work', 'important']);
    });

    it('should preserve notes from imported JSON', () => {
      const jsonWithNotes = JSON.stringify({
        source: 'MarkSyncr',
        bookmarks: [
          {
            title: 'With Notes',
            url: 'https://example.com',
            notes: 'Important bookmark',
          },
        ],
      });

      const result = parseImportFile(jsonWithNotes, IMPORT_FORMATS.JSON);
      expect(result.bookmarks[0].notes).toBe('Important bookmark');
    });
  });

  describe('Round-trip Export/Import', () => {
    it('should preserve data through JSON export and import', () => {
      const originalBookmarks = [
        {
          id: '1',
          title: 'Test Folder',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Test Bookmark',
              url: 'https://test.com',
              type: 'bookmark',
              tags: ['tag1', 'tag2'],
              notes: 'Test notes',
            },
          ],
        },
      ];

      // Export to JSON
      const exported = formatToJson(originalBookmarks);

      // Import back
      const imported = parseImportFile(exported, IMPORT_FORMATS.JSON);

      expect(imported.bookmarks[0].title).toBe('Test Folder');
      expect(imported.bookmarks[0].children[0].title).toBe('Test Bookmark');
      expect(imported.bookmarks[0].children[0].url).toBe('https://test.com');
    });

    it('should preserve folder structure through export/import', () => {
      const nestedStructure = [
        {
          id: '1',
          title: 'Root',
          type: 'folder',
          children: [
            {
              id: '2',
              title: 'Child Folder',
              type: 'folder',
              children: [
                {
                  id: '3',
                  title: 'Nested Bookmark',
                  url: 'https://nested.com',
                  type: 'bookmark',
                },
              ],
            },
          ],
        },
      ];

      const exported = formatToJson(nestedStructure);
      const imported = parseImportFile(exported, IMPORT_FORMATS.JSON);

      expect(imported.bookmarks[0].children[0].children[0].title).toBe('Nested Bookmark');
    });
  });

  describe('Format Constants', () => {
    it('should have JSON in IMPORT_FORMATS', () => {
      expect(IMPORT_FORMATS.JSON).toBe('json');
    });

    it('should have JSON in EXPORT_FORMATS', () => {
      expect(EXPORT_FORMATS.JSON).toBe('json');
    });

    it('should have HTML in EXPORT_FORMATS', () => {
      expect(EXPORT_FORMATS.HTML).toBe('html');
    });

    it('should have NETSCAPE_HTML in IMPORT_FORMATS', () => {
      expect(IMPORT_FORMATS.NETSCAPE_HTML).toBe('netscape_html');
    });
  });
});
