/**
 * @fileoverview Tests for link checker module
 * Uses Vitest for testing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkLink,
  checkLinks,
  categorizeStatus,
  isValidUrl,
  extractDomain,
  createLinkCheckResult,
  LINK_STATUS,
  DEFAULT_CHECK_OPTIONS,
} from '../src/link-checker.js';

describe('Link Checker', () => {
  describe('LINK_STATUS', () => {
    it('should have all required status values', () => {
      expect(LINK_STATUS.VALID).toBe('valid');
      expect(LINK_STATUS.BROKEN).toBe('broken');
      expect(LINK_STATUS.REDIRECT).toBe('redirect');
      expect(LINK_STATUS.TIMEOUT).toBe('timeout');
      expect(LINK_STATUS.UNKNOWN).toBe('unknown');
    });
  });

  describe('DEFAULT_CHECK_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CHECK_OPTIONS.timeout).toBeGreaterThan(0);
      expect(DEFAULT_CHECK_OPTIONS.followRedirects).toBe(false);
      expect(DEFAULT_CHECK_OPTIONS.maxRedirects).toBeGreaterThan(0);
      expect(typeof DEFAULT_CHECK_OPTIONS.userAgent).toBe('string');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid HTTP URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('javascript:void(0)')).toBe(false);
      expect(isValidUrl('file:///path/to/file')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://example.com/path')).toBe('example.com');
      expect(extractDomain('https://www.example.com')).toBe('www.example.com');
      expect(extractDomain('https://sub.domain.example.com')).toBe('sub.domain.example.com');
    });

    it('should return null for invalid URLs', () => {
      expect(extractDomain('')).toBe(null);
      expect(extractDomain('not-a-url')).toBe(null);
    });
  });

  describe('categorizeStatus', () => {
    it('should categorize 2xx status codes as valid', () => {
      expect(categorizeStatus(200)).toBe(LINK_STATUS.VALID);
      expect(categorizeStatus(201)).toBe(LINK_STATUS.VALID);
      expect(categorizeStatus(204)).toBe(LINK_STATUS.VALID);
      expect(categorizeStatus(299)).toBe(LINK_STATUS.VALID);
    });

    it('should categorize 3xx status codes as redirect', () => {
      expect(categorizeStatus(301)).toBe(LINK_STATUS.REDIRECT);
      expect(categorizeStatus(302)).toBe(LINK_STATUS.REDIRECT);
      expect(categorizeStatus(307)).toBe(LINK_STATUS.REDIRECT);
      expect(categorizeStatus(308)).toBe(LINK_STATUS.REDIRECT);
    });

    it('should categorize 4xx status codes as broken', () => {
      expect(categorizeStatus(400)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(401)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(403)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(404)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(410)).toBe(LINK_STATUS.BROKEN);
    });

    it('should categorize 5xx status codes as broken', () => {
      expect(categorizeStatus(500)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(502)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(503)).toBe(LINK_STATUS.BROKEN);
      expect(categorizeStatus(504)).toBe(LINK_STATUS.BROKEN);
    });

    it('should categorize unknown status codes as unknown', () => {
      expect(categorizeStatus(0)).toBe(LINK_STATUS.UNKNOWN);
      expect(categorizeStatus(null)).toBe(LINK_STATUS.UNKNOWN);
      expect(categorizeStatus(undefined)).toBe(LINK_STATUS.UNKNOWN);
      expect(categorizeStatus(100)).toBe(LINK_STATUS.UNKNOWN);
    });
  });

  describe('createLinkCheckResult', () => {
    it('should create a valid result object', () => {
      const result = createLinkCheckResult({
        bookmarkId: 'bm-123',
        url: 'https://example.com',
        status: LINK_STATUS.VALID,
        statusCode: 200,
      });

      expect(result.bookmarkId).toBe('bm-123');
      expect(result.url).toBe('https://example.com');
      expect(result.status).toBe(LINK_STATUS.VALID);
      expect(result.statusCode).toBe(200);
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('should include redirect URL when provided', () => {
      const result = createLinkCheckResult({
        bookmarkId: 'bm-123',
        url: 'https://old.example.com',
        status: LINK_STATUS.REDIRECT,
        statusCode: 301,
        redirectUrl: 'https://new.example.com',
      });

      expect(result.redirectUrl).toBe('https://new.example.com');
    });

    it('should include error message when provided', () => {
      const result = createLinkCheckResult({
        bookmarkId: 'bm-123',
        url: 'https://example.com',
        status: LINK_STATUS.TIMEOUT,
        errorMessage: 'Connection timed out',
      });

      expect(result.errorMessage).toBe('Connection timed out');
    });

    it('should default to unknown status', () => {
      const result = createLinkCheckResult({
        bookmarkId: 'bm-123',
        url: 'https://example.com',
      });

      expect(result.status).toBe(LINK_STATUS.UNKNOWN);
    });
  });

  describe('checkLink', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return valid status for successful response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
      });

      const result = await checkLink({
        bookmarkId: 'bm-123',
        url: 'https://example.com',
      });

      expect(result.status).toBe(LINK_STATUS.VALID);
      expect(result.statusCode).toBe(200);
    });

    it('should return broken status for 404 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Map(),
      });

      const result = await checkLink({
        bookmarkId: 'bm-123',
        url: 'https://example.com/not-found',
      });

      expect(result.status).toBe(LINK_STATUS.BROKEN);
      expect(result.statusCode).toBe(404);
    });

    it('should return redirect status for 301 response', async () => {
      const headers = new Map([['location', 'https://new.example.com']]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 301,
        headers: {
          get: (key) => headers.get(key.toLowerCase()),
        },
      });

      const result = await checkLink({
        bookmarkId: 'bm-123',
        url: 'https://old.example.com',
      });

      expect(result.status).toBe(LINK_STATUS.REDIRECT);
      expect(result.statusCode).toBe(301);
      expect(result.redirectUrl).toBe('https://new.example.com');
    });

    it('should return timeout status on timeout error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('AbortError'));

      const result = await checkLink({
        bookmarkId: 'bm-123',
        url: 'https://slow.example.com',
      });

      expect(result.status).toBe(LINK_STATUS.TIMEOUT);
      expect(result.errorMessage).toBeDefined();
    });

    it('should return broken status on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await checkLink({
        bookmarkId: 'bm-123',
        url: 'https://unreachable.example.com',
      });

      expect(result.status).toBe(LINK_STATUS.BROKEN);
      expect(result.errorMessage).toBe('Network error');
    });

    it('should return unknown status for invalid URL', async () => {
      const result = await checkLink({
        bookmarkId: 'bm-123',
        url: 'not-a-valid-url',
      });

      expect(result.status).toBe(LINK_STATUS.UNKNOWN);
      expect(result.errorMessage).toBeDefined();
    });

    it('should use HEAD method by default', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
      });

      await checkLink({
        bookmarkId: 'bm-123',
        url: 'https://example.com',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ method: 'HEAD' })
      );
    });
  });

  describe('checkLinks', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should check multiple links', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
      });

      const bookmarks = [
        { id: 'bm-1', url: 'https://example1.com' },
        { id: 'bm-2', url: 'https://example2.com' },
        { id: 'bm-3', url: 'https://example3.com' },
      ];

      const results = await checkLinks(bookmarks);

      expect(results).toHaveLength(3);
      expect(results[0].bookmarkId).toBe('bm-1');
      expect(results[1].bookmarkId).toBe('bm-2');
      expect(results[2].bookmarkId).toBe('bm-3');
    });

    it('should respect concurrency limit', async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCalls--;
        return { ok: true, status: 200, headers: new Map() };
      });

      const bookmarks = Array.from({ length: 10 }, (_, i) => ({
        id: `bm-${i}`,
        url: `https://example${i}.com`,
      }));

      await checkLinks(bookmarks, { concurrency: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should call progress callback', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
      });

      const bookmarks = [
        { id: 'bm-1', url: 'https://example1.com' },
        { id: 'bm-2', url: 'https://example2.com' },
      ];

      const onProgress = vi.fn();
      await checkLinks(bookmarks, { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
        completed: expect.any(Number),
        total: 2,
      }));
    });

    it('should skip bookmarks without URLs', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
      });

      const bookmarks = [
        { id: 'bm-1', url: 'https://example.com' },
        { id: 'bm-2', url: '' },
        { id: 'bm-3' }, // No URL
      ];

      const results = await checkLinks(bookmarks);

      expect(results).toHaveLength(1);
      expect(results[0].bookmarkId).toBe('bm-1');
    });

    it('should handle empty bookmark array', async () => {
      const results = await checkLinks([]);
      expect(results).toHaveLength(0);
    });

    it('should handle mixed results', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, headers: new Map() })
        .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map() })
        .mockRejectedValueOnce(new Error('Network error'));

      const bookmarks = [
        { id: 'bm-1', url: 'https://valid.com' },
        { id: 'bm-2', url: 'https://notfound.com' },
        { id: 'bm-3', url: 'https://error.com' },
      ];

      const results = await checkLinks(bookmarks);

      expect(results[0].status).toBe(LINK_STATUS.VALID);
      expect(results[1].status).toBe(LINK_STATUS.BROKEN);
      expect(results[2].status).toBe(LINK_STATUS.BROKEN);
    });
  });
});
