import { describe, it, expect } from 'vitest';
import {
  sha256,
  generateBookmarkId,
  generateFolderId,
  generateChecksum,
  generateDeviceId,
  hasContentChanged,
} from '../src/hash-utils.js';

describe('hash-utils', () => {
  describe('sha256', () => {
    it('should generate a valid SHA-256 hash', async () => {
      const hash = await sha256('hello world');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should generate consistent hashes for the same input', async () => {
      const hash1 = await sha256('test input');
      const hash2 = await sha256('test input');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', async () => {
      const hash1 = await sha256('input 1');
      const hash2 = await sha256('input 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const hash = await sha256('');

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it('should handle unicode characters', async () => {
      const hash = await sha256('こんにちは世界 🌍');

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('generateBookmarkId', () => {
    it('should generate a stable ID for a bookmark with URL', async () => {
      const id = await generateBookmarkId({
        url: 'https://example.com',
        title: 'Example',
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id).toHaveLength(16);
    });

    it('should generate consistent IDs for the same bookmark', async () => {
      const id1 = await generateBookmarkId({
        url: 'https://example.com',
        title: 'Example',
      });
      const id2 = await generateBookmarkId({
        url: 'https://example.com',
        title: 'Example',
      });

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different URLs', async () => {
      const id1 = await generateBookmarkId({
        url: 'https://example1.com',
        title: 'Example',
      });
      const id2 = await generateBookmarkId({
        url: 'https://example2.com',
        title: 'Example',
      });

      expect(id1).not.toBe(id2);
    });

    it('should use URL as primary identifier (title changes dont affect ID)', async () => {
      const id1 = await generateBookmarkId({
        url: 'https://example.com',
        title: 'Title 1',
      });
      const id2 = await generateBookmarkId({
        url: 'https://example.com',
        title: 'Title 2',
      });

      expect(id1).toBe(id2);
    });

    it('should generate ID for folder (no URL) using title and path', async () => {
      const id = await generateBookmarkId({
        title: 'Work',
        parentPath: 'toolbar',
      });

      expect(id).toBeDefined();
      expect(id).toHaveLength(16);
    });

    it('should generate different IDs for folders with same name but different paths', async () => {
      const id1 = await generateBookmarkId({
        title: 'Projects',
        parentPath: 'toolbar/Work',
      });
      const id2 = await generateBookmarkId({
        title: 'Projects',
        parentPath: 'toolbar/Personal',
      });

      expect(id1).not.toBe(id2);
    });
  });

  describe('generateFolderId', () => {
    it('should generate a stable ID for a folder path', async () => {
      const id = await generateFolderId('toolbar/Work/Projects');

      expect(id).toBeDefined();
      expect(id).toHaveLength(16);
    });

    it('should generate consistent IDs for the same path', async () => {
      const id1 = await generateFolderId('toolbar/Work');
      const id2 = await generateFolderId('toolbar/Work');

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different paths', async () => {
      const id1 = await generateFolderId('toolbar/Work');
      const id2 = await generateFolderId('toolbar/Personal');

      expect(id1).not.toBe(id2);
    });
  });

  describe('generateChecksum', () => {
    it('should generate a checksum for bookmark data', async () => {
      const bookmarkFile = {
        bookmarks: {
          toolbar: { id: 'toolbar', title: 'Toolbar', children: [] },
          menu: { id: 'menu', title: 'Menu', children: [] },
          other: { id: 'other', title: 'Other', children: [] },
        },
      };

      const checksum = await generateChecksum(bookmarkFile);

      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64);
    });

    it('should generate consistent checksums for the same data', async () => {
      const bookmarkFile = {
        bookmarks: {
          toolbar: { id: 'toolbar', title: 'Toolbar', children: [] },
          menu: { id: 'menu', title: 'Menu', children: [] },
          other: { id: 'other', title: 'Other', children: [] },
        },
      };

      const checksum1 = await generateChecksum(bookmarkFile);
      const checksum2 = await generateChecksum(bookmarkFile);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', async () => {
      const file1 = {
        bookmarks: {
          toolbar: { id: 'toolbar', title: 'Toolbar', children: [] },
          menu: { id: 'menu', title: 'Menu', children: [] },
          other: { id: 'other', title: 'Other', children: [] },
        },
      };

      const file2 = {
        bookmarks: {
          toolbar: {
            id: 'toolbar',
            title: 'Toolbar',
            children: [{ id: 'b1', title: 'Bookmark', url: 'https://example.com' }],
          },
          menu: { id: 'menu', title: 'Menu', children: [] },
          other: { id: 'other', title: 'Other', children: [] },
        },
      };

      const checksum1 = await generateChecksum(file1);
      const checksum2 = await generateChecksum(file2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('generateDeviceId', () => {
    it('should generate a UUID-like device ID', async () => {
      const deviceId = await generateDeviceId();

      expect(deviceId).toBeDefined();
      expect(typeof deviceId).toBe('string');
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(deviceId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    });

    it('should generate unique IDs on each call', async () => {
      const id1 = await generateDeviceId();
      const id2 = await generateDeviceId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('hasContentChanged', () => {
    it('should return true when checksums are different', () => {
      expect(hasContentChanged('abc123', 'def456')).toBe(true);
    });

    it('should return false when checksums are the same', () => {
      expect(hasContentChanged('abc123', 'abc123')).toBe(false);
    });

    it('should return true when first checksum is empty', () => {
      expect(hasContentChanged('', 'abc123')).toBe(true);
    });

    it('should return true when second checksum is empty', () => {
      expect(hasContentChanged('abc123', '')).toBe(true);
    });

    it('should return true when first checksum is null', () => {
      expect(hasContentChanged(null, 'abc123')).toBe(true);
    });

    it('should return true when second checksum is null', () => {
      expect(hasContentChanged('abc123', null)).toBe(true);
    });

    it('should return true when both checksums are empty', () => {
      expect(hasContentChanged('', '')).toBe(true);
    });
  });
});
