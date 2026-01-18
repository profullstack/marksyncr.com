/**
 * Tests for BaseSource class and createSource factory
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseSource, createSource } from '../src/base-source.js';
import { SOURCE_TYPE } from '@marksyncr/types';

// Create a concrete implementation for testing
class TestSource extends BaseSource {
  constructor(config, credentials) {
    super(config, credentials);
  }

  async read() {
    return {
      version: '1.0.0',
      metadata: {
        checksum: 'test-checksum',
        lastModified: new Date().toISOString(),
      },
      bookmarks: {
        toolbar: [],
        menu: [],
        other: [],
      },
    };
  }

  async write(data) {
    // Mock write
  }
}

describe('BaseSource', () => {
  describe('constructor', () => {
    it('should throw when instantiated directly', () => {
      expect(() => new BaseSource({ type: 'test' })).toThrow(
        'BaseSource is abstract and cannot be instantiated directly'
      );
    });

    it('should allow subclass instantiation', () => {
      const config = { type: 'test', name: 'Test Source' };
      const source = new TestSource(config);
      expect(source.config).toEqual(config);
      expect(source.type).toBe('test');
    });

    it('should store credentials', () => {
      const config = { type: 'test' };
      const credentials = { accessToken: 'token123' };
      const source = new TestSource(config, credentials);
      expect(source.credentials).toEqual(credentials);
    });
  });

  describe('read()', () => {
    it('should return bookmark data from subclass', async () => {
      const source = new TestSource({ type: 'test' });
      const data = await source.read();
      expect(data.version).toBe('1.0.0');
      expect(data.bookmarks).toBeDefined();
    });
  });

  describe('getChecksum()', () => {
    it('should return checksum from read data', async () => {
      const source = new TestSource({ type: 'test' });
      const checksum = await source.getChecksum();
      expect(checksum).toBe('test-checksum');
    });
  });

  describe('isAvailable()', () => {
    it('should return true when read succeeds', async () => {
      const source = new TestSource({ type: 'test' });
      const available = await source.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when read fails', async () => {
      const source = new TestSource({ type: 'test' });
      source.read = vi.fn().mockRejectedValue(new Error('Failed'));
      const available = await source.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('validateConfig()', () => {
    it('should return true for valid config', () => {
      const source = new TestSource({ type: 'test' });
      expect(source.validateConfig()).toBe(true);
    });

    it('should return false for missing type', () => {
      const source = new TestSource({});
      expect(source.validateConfig()).toBe(false);
    });
  });

  describe('validateCredentials()', () => {
    it('should return true by default', async () => {
      const source = new TestSource({ type: 'test' });
      const valid = await source.validateCredentials();
      expect(valid).toBe(true);
    });
  });

  describe('refreshCredentials()', () => {
    it('should return existing credentials by default', async () => {
      const credentials = { accessToken: 'token' };
      const source = new TestSource({ type: 'test' }, credentials);
      const refreshed = await source.refreshCredentials();
      expect(refreshed).toEqual(credentials);
    });
  });

  describe('getMetadata()', () => {
    it('should return source metadata', async () => {
      const source = new TestSource({ type: 'test', name: 'My Source' });
      const metadata = await source.getMetadata();
      expect(metadata.type).toBe('test');
      expect(metadata.name).toBe('My Source');
    });
  });

  describe('error helpers', () => {
    it('should create not found error', () => {
      const source = new TestSource({ type: 'test' });
      const error = source.createNotFoundError('File not found');
      expect(error.message).toBe('File not found');
      expect(error.code).toBe('NOT_FOUND');
    });

    it('should create unauthorized error', () => {
      const source = new TestSource({ type: 'test' });
      const error = source.createUnauthorizedError();
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should create network error', () => {
      const source = new TestSource({ type: 'test' });
      const error = source.createNetworkError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
    });
  });
});

describe('createSource', () => {
  it('should throw for unknown source type', async () => {
    await expect(createSource({ type: 'unknown' })).rejects.toThrow('Unknown source type: unknown');
  });

  // Note: Other source types require mocking their implementations
  // which would be done in integration tests
});
