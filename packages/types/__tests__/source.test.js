import { describe, it, expect } from 'vitest';
import {
  SOURCE_TYPE,
  SOURCE_TIER,
  SOURCE_INFO,
  createSourceConfig,
  sourceRequiresAuth,
  isFreeTierSource,
  getFreeTierSources,
  getPaidTierSources,
} from '../src/source.js';

describe('source types', () => {
  describe('constants', () => {
    it('should have correct SOURCE_TYPE values', () => {
      expect(SOURCE_TYPE.LOCAL).toBe('local');
      expect(SOURCE_TYPE.GITHUB).toBe('github');
      expect(SOURCE_TYPE.DROPBOX).toBe('dropbox');
      expect(SOURCE_TYPE.GOOGLE_DRIVE).toBe('google-drive');
      expect(SOURCE_TYPE.SUPABASE_CLOUD).toBe('supabase-cloud');
    });

    it('should have correct SOURCE_TIER values', () => {
      expect(SOURCE_TIER.FREE).toBe('free');
      expect(SOURCE_TIER.PAID).toBe('paid');
    });
  });

  describe('SOURCE_INFO', () => {
    it('should have info for all source types', () => {
      expect(SOURCE_INFO[SOURCE_TYPE.LOCAL]).toBeDefined();
      expect(SOURCE_INFO[SOURCE_TYPE.GITHUB]).toBeDefined();
      expect(SOURCE_INFO[SOURCE_TYPE.DROPBOX]).toBeDefined();
      expect(SOURCE_INFO[SOURCE_TYPE.GOOGLE_DRIVE]).toBeDefined();
      expect(SOURCE_INFO[SOURCE_TYPE.SUPABASE_CLOUD]).toBeDefined();
    });

    it('should have correct tier assignments', () => {
      expect(SOURCE_INFO[SOURCE_TYPE.LOCAL].tier).toBe(SOURCE_TIER.FREE);
      expect(SOURCE_INFO[SOURCE_TYPE.GITHUB].tier).toBe(SOURCE_TIER.FREE);
      expect(SOURCE_INFO[SOURCE_TYPE.DROPBOX].tier).toBe(SOURCE_TIER.FREE);
      expect(SOURCE_INFO[SOURCE_TYPE.GOOGLE_DRIVE].tier).toBe(SOURCE_TIER.FREE);
      expect(SOURCE_INFO[SOURCE_TYPE.SUPABASE_CLOUD].tier).toBe(SOURCE_TIER.PAID);
    });

    it('should have correct auth requirements', () => {
      expect(SOURCE_INFO[SOURCE_TYPE.LOCAL].requiresAuth).toBe(false);
      expect(SOURCE_INFO[SOURCE_TYPE.GITHUB].requiresAuth).toBe(true);
      expect(SOURCE_INFO[SOURCE_TYPE.DROPBOX].requiresAuth).toBe(true);
      expect(SOURCE_INFO[SOURCE_TYPE.GOOGLE_DRIVE].requiresAuth).toBe(true);
      expect(SOURCE_INFO[SOURCE_TYPE.SUPABASE_CLOUD].requiresAuth).toBe(true);
    });

    it('should have auth URLs for OAuth sources', () => {
      expect(SOURCE_INFO[SOURCE_TYPE.GITHUB].authUrl).toContain('github.com');
      expect(SOURCE_INFO[SOURCE_TYPE.DROPBOX].authUrl).toContain('dropbox.com');
      expect(SOURCE_INFO[SOURCE_TYPE.GOOGLE_DRIVE].authUrl).toContain('google.com');
    });

    it('should have icons for all sources', () => {
      Object.values(SOURCE_INFO).forEach((info) => {
        expect(info.icon).toBeDefined();
        expect(typeof info.icon).toBe('string');
      });
    });
  });

  describe('createSourceConfig', () => {
    it('should create a config with type and default name', () => {
      const config = createSourceConfig(SOURCE_TYPE.GITHUB);

      expect(config.type).toBe(SOURCE_TYPE.GITHUB);
      expect(config.name).toBe('GitHub');
    });

    it('should allow overriding name', () => {
      const config = createSourceConfig(SOURCE_TYPE.GITHUB, { name: 'My GitHub' });

      expect(config.name).toBe('My GitHub');
    });

    it('should accept additional config properties', () => {
      const config = createSourceConfig(SOURCE_TYPE.GITHUB, {
        repository: 'user/bookmarks',
        branch: 'main',
        path: 'bookmarks.json',
      });

      expect(config.repository).toBe('user/bookmarks');
      expect(config.branch).toBe('main');
      expect(config.path).toBe('bookmarks.json');
    });

    it('should handle unknown source types gracefully', () => {
      const config = createSourceConfig('unknown');

      expect(config.type).toBe('unknown');
      expect(config.name).toBe('unknown');
    });
  });

  describe('sourceRequiresAuth', () => {
    it('should return false for local source', () => {
      expect(sourceRequiresAuth(SOURCE_TYPE.LOCAL)).toBe(false);
    });

    it('should return true for OAuth sources', () => {
      expect(sourceRequiresAuth(SOURCE_TYPE.GITHUB)).toBe(true);
      expect(sourceRequiresAuth(SOURCE_TYPE.DROPBOX)).toBe(true);
      expect(sourceRequiresAuth(SOURCE_TYPE.GOOGLE_DRIVE)).toBe(true);
    });

    it('should return true for cloud source', () => {
      expect(sourceRequiresAuth(SOURCE_TYPE.SUPABASE_CLOUD)).toBe(true);
    });

    it('should return false for unknown source types', () => {
      expect(sourceRequiresAuth('unknown')).toBe(false);
    });
  });

  describe('isFreeTierSource', () => {
    it('should return true for free tier sources', () => {
      expect(isFreeTierSource(SOURCE_TYPE.LOCAL)).toBe(true);
      expect(isFreeTierSource(SOURCE_TYPE.GITHUB)).toBe(true);
      expect(isFreeTierSource(SOURCE_TYPE.DROPBOX)).toBe(true);
      expect(isFreeTierSource(SOURCE_TYPE.GOOGLE_DRIVE)).toBe(true);
    });

    it('should return false for paid tier sources', () => {
      expect(isFreeTierSource(SOURCE_TYPE.SUPABASE_CLOUD)).toBe(false);
    });

    it('should return false for unknown source types', () => {
      expect(isFreeTierSource('unknown')).toBe(false);
    });
  });

  describe('getFreeTierSources', () => {
    it('should return all free tier sources', () => {
      const freeSources = getFreeTierSources();

      expect(freeSources).toHaveLength(4);
      expect(freeSources.map((s) => s.type)).toContain(SOURCE_TYPE.LOCAL);
      expect(freeSources.map((s) => s.type)).toContain(SOURCE_TYPE.GITHUB);
      expect(freeSources.map((s) => s.type)).toContain(SOURCE_TYPE.DROPBOX);
      expect(freeSources.map((s) => s.type)).toContain(SOURCE_TYPE.GOOGLE_DRIVE);
    });

    it('should not include paid tier sources', () => {
      const freeSources = getFreeTierSources();

      expect(freeSources.map((s) => s.type)).not.toContain(SOURCE_TYPE.SUPABASE_CLOUD);
    });
  });

  describe('getPaidTierSources', () => {
    it('should return all paid tier sources', () => {
      const paidSources = getPaidTierSources();

      expect(paidSources).toHaveLength(1);
      expect(paidSources[0].type).toBe(SOURCE_TYPE.SUPABASE_CLOUD);
    });

    it('should not include free tier sources', () => {
      const paidSources = getPaidTierSources();

      expect(paidSources.map((s) => s.type)).not.toContain(SOURCE_TYPE.LOCAL);
      expect(paidSources.map((s) => s.type)).not.toContain(SOURCE_TYPE.GITHUB);
    });
  });
});
