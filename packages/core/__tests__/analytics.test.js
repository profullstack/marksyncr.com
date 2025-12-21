/**
 * @fileoverview Tests for bookmark analytics module
 * Tests aggregation functions, statistics calculations, and insights generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateBookmarkStats,
  getTopDomains,
  getBookmarksByAge,
  getBookmarksByFolder,
  getTagDistribution,
  getGrowthTrend,
  getActivityHeatmap,
  generateInsights,
  calculateHealthScore,
} from '../src/analytics.js';

describe('Analytics Module', () => {
  // Sample bookmark data for testing
  const sampleBookmarks = [
    {
      id: '1',
      title: 'GitHub',
      url: 'https://github.com/user/repo',
      dateAdded: new Date('2024-01-15').getTime(),
      parentId: 'folder1',
      tags: ['dev', 'code'],
      visitCount: 50,
    },
    {
      id: '2',
      title: 'Stack Overflow',
      url: 'https://stackoverflow.com/questions/123',
      dateAdded: new Date('2024-02-20').getTime(),
      parentId: 'folder1',
      tags: ['dev', 'help'],
      visitCount: 30,
    },
    {
      id: '3',
      title: 'Google',
      url: 'https://google.com',
      dateAdded: new Date('2024-03-10').getTime(),
      parentId: 'folder2',
      tags: ['search'],
      visitCount: 100,
    },
    {
      id: '4',
      title: 'GitHub Docs',
      url: 'https://docs.github.com/en/actions',
      dateAdded: new Date('2024-03-15').getTime(),
      parentId: 'folder1',
      tags: ['dev', 'docs'],
      visitCount: 20,
    },
    {
      id: '5',
      title: 'Old Bookmark',
      url: 'https://example.com/old',
      dateAdded: new Date('2023-01-01').getTime(),
      parentId: 'folder3',
      tags: [],
      visitCount: 0,
    },
    {
      id: '6',
      title: 'Another Google',
      url: 'https://google.com/search?q=test',
      dateAdded: new Date('2024-04-01').getTime(),
      parentId: 'folder2',
      tags: ['search'],
      visitCount: 15,
    },
  ];

  const folderMap = {
    folder1: { id: 'folder1', title: 'Development' },
    folder2: { id: 'folder2', title: 'Search Engines' },
    folder3: { id: 'folder3', title: 'Archive' },
  };

  describe('calculateBookmarkStats', () => {
    it('should calculate total bookmark count', () => {
      const stats = calculateBookmarkStats(sampleBookmarks);
      expect(stats.totalBookmarks).toBe(6);
    });

    it('should calculate total unique domains', () => {
      const stats = calculateBookmarkStats(sampleBookmarks);
      expect(stats.uniqueDomains).toBe(5); // github.com, docs.github.com, stackoverflow.com, google.com, example.com
    });

    it('should calculate total tags used', () => {
      const stats = calculateBookmarkStats(sampleBookmarks);
      expect(stats.totalTags).toBe(5); // dev, code, help, search, docs
    });

    it('should calculate bookmarks with tags percentage', () => {
      const stats = calculateBookmarkStats(sampleBookmarks);
      expect(stats.bookmarksWithTags).toBe(5); // 5 out of 6 have tags
      expect(stats.taggedPercentage).toBeCloseTo(83.33, 1);
    });

    it('should calculate average bookmarks per folder', () => {
      const stats = calculateBookmarkStats(sampleBookmarks, folderMap);
      expect(stats.avgBookmarksPerFolder).toBe(2); // 6 bookmarks / 3 folders
    });

    it('should handle empty bookmark array', () => {
      const stats = calculateBookmarkStats([]);
      expect(stats.totalBookmarks).toBe(0);
      expect(stats.uniqueDomains).toBe(0);
      expect(stats.totalTags).toBe(0);
    });

    it('should calculate total visit count', () => {
      const stats = calculateBookmarkStats(sampleBookmarks);
      expect(stats.totalVisits).toBe(215); // 50+30+100+20+0+15
    });

    it('should find most visited bookmark', () => {
      const stats = calculateBookmarkStats(sampleBookmarks);
      expect(stats.mostVisited.title).toBe('Google');
      expect(stats.mostVisited.visitCount).toBe(100);
    });
  });

  describe('getTopDomains', () => {
    it('should return domains sorted by bookmark count', () => {
      const domains = getTopDomains(sampleBookmarks);
      expect(domains[0].domain).toBe('google.com');
      expect(domains[0].count).toBe(2);
    });

    it('should limit results to specified count', () => {
      const domains = getTopDomains(sampleBookmarks, 2);
      expect(domains).toHaveLength(2);
    });

    it('should include visit count per domain', () => {
      const domains = getTopDomains(sampleBookmarks);
      const googleDomain = domains.find((d) => d.domain === 'google.com');
      expect(googleDomain.totalVisits).toBe(115); // 100 + 15
    });

    it('should handle empty bookmarks', () => {
      const domains = getTopDomains([]);
      expect(domains).toHaveLength(0);
    });

    it('should extract domain correctly from various URLs', () => {
      const bookmarks = [
        { url: 'https://www.example.com/path' },
        { url: 'http://example.com/other' },
        { url: 'https://example.com:8080/page' },
      ];
      const domains = getTopDomains(bookmarks);
      expect(domains[0].domain).toBe('example.com');
      expect(domains[0].count).toBe(3);
    });
  });

  describe('getBookmarksByAge', () => {
    it('should categorize bookmarks by age', () => {
      const now = new Date('2024-04-15');
      const byAge = getBookmarksByAge(sampleBookmarks, now);

      expect(byAge.thisWeek).toBeGreaterThanOrEqual(0);
      expect(byAge.thisMonth).toBeGreaterThanOrEqual(0);
      expect(byAge.thisYear).toBeGreaterThanOrEqual(0);
      expect(byAge.older).toBeGreaterThanOrEqual(0);
    });

    it('should count old bookmarks correctly', () => {
      const now = new Date('2024-04-15');
      const byAge = getBookmarksByAge(sampleBookmarks, now);
      expect(byAge.older).toBe(1); // Only the 2023 bookmark
    });

    it('should handle empty bookmarks', () => {
      const byAge = getBookmarksByAge([]);
      expect(byAge.thisWeek).toBe(0);
      expect(byAge.thisMonth).toBe(0);
      expect(byAge.thisYear).toBe(0);
      expect(byAge.older).toBe(0);
    });

    it('should include percentage breakdown', () => {
      const now = new Date('2024-04-15');
      const byAge = getBookmarksByAge(sampleBookmarks, now);
      const total =
        byAge.thisWeekPercent + byAge.thisMonthPercent + byAge.thisYearPercent + byAge.olderPercent;
      expect(total).toBeCloseTo(100, 0);
    });
  });

  describe('getBookmarksByFolder', () => {
    it('should count bookmarks per folder', () => {
      const byFolder = getBookmarksByFolder(sampleBookmarks, folderMap);
      expect(byFolder).toHaveLength(3);
    });

    it('should include folder names', () => {
      const byFolder = getBookmarksByFolder(sampleBookmarks, folderMap);
      const devFolder = byFolder.find((f) => f.folderId === 'folder1');
      expect(devFolder.folderName).toBe('Development');
      expect(devFolder.count).toBe(3);
    });

    it('should sort by count descending', () => {
      const byFolder = getBookmarksByFolder(sampleBookmarks, folderMap);
      expect(byFolder[0].count).toBeGreaterThanOrEqual(byFolder[1].count);
    });

    it('should handle unknown folders', () => {
      const bookmarksWithUnknown = [...sampleBookmarks, { id: '7', parentId: 'unknown' }];
      const byFolder = getBookmarksByFolder(bookmarksWithUnknown, folderMap);
      const unknown = byFolder.find((f) => f.folderId === 'unknown');
      expect(unknown.folderName).toBe('Unknown');
    });
  });

  describe('getTagDistribution', () => {
    it('should count tag usage', () => {
      const tags = getTagDistribution(sampleBookmarks);
      const devTag = tags.find((t) => t.tag === 'dev');
      expect(devTag.count).toBe(3);
    });

    it('should sort by count descending', () => {
      const tags = getTagDistribution(sampleBookmarks);
      expect(tags[0].count).toBeGreaterThanOrEqual(tags[1].count);
    });

    it('should limit results', () => {
      const tags = getTagDistribution(sampleBookmarks, 2);
      expect(tags).toHaveLength(2);
    });

    it('should handle bookmarks without tags', () => {
      const bookmarks = [{ id: '1', tags: [] }, { id: '2' }];
      const tags = getTagDistribution(bookmarks);
      expect(tags).toHaveLength(0);
    });

    it('should include percentage of total', () => {
      const tags = getTagDistribution(sampleBookmarks);
      const devTag = tags.find((t) => t.tag === 'dev');
      expect(devTag.percentage).toBeCloseTo(50, 0); // 3 out of 6 bookmarks
    });
  });

  describe('getGrowthTrend', () => {
    it('should calculate monthly growth', () => {
      const trend = getGrowthTrend(sampleBookmarks, 'month', 6);
      expect(trend).toBeInstanceOf(Array);
      expect(trend.length).toBeLessThanOrEqual(6);
    });

    it('should include period labels', () => {
      const trend = getGrowthTrend(sampleBookmarks, 'month', 3);
      expect(trend[0]).toHaveProperty('period');
      expect(trend[0]).toHaveProperty('count');
    });

    it('should calculate weekly growth', () => {
      const trend = getGrowthTrend(sampleBookmarks, 'week', 4);
      expect(trend).toBeInstanceOf(Array);
    });

    it('should show cumulative totals', () => {
      const trend = getGrowthTrend(sampleBookmarks, 'month', 12);
      // Each period should have cumulative count
      for (let i = 1; i < trend.length; i++) {
        expect(trend[i].cumulative).toBeGreaterThanOrEqual(trend[i - 1].cumulative);
      }
    });

    it('should handle empty bookmarks', () => {
      const trend = getGrowthTrend([], 'month', 6);
      expect(trend).toHaveLength(0);
    });
  });

  describe('getActivityHeatmap', () => {
    it('should return activity by day of week', () => {
      const heatmap = getActivityHeatmap(sampleBookmarks);
      expect(heatmap.byDayOfWeek).toHaveLength(7);
    });

    it('should return activity by hour', () => {
      const heatmap = getActivityHeatmap(sampleBookmarks);
      expect(heatmap.byHour).toHaveLength(24);
    });

    it('should identify most active day', () => {
      const heatmap = getActivityHeatmap(sampleBookmarks);
      expect(heatmap.mostActiveDay).toBeDefined();
      expect(heatmap.mostActiveDay.dayName).toBeDefined();
    });

    it('should handle empty bookmarks', () => {
      const heatmap = getActivityHeatmap([]);
      expect(heatmap.byDayOfWeek.every((d) => d.count === 0)).toBe(true);
    });
  });

  describe('generateInsights', () => {
    it('should generate insights array', () => {
      const insights = generateInsights(sampleBookmarks, folderMap);
      expect(insights).toBeInstanceOf(Array);
    });

    it('should include insight type and message', () => {
      const insights = generateInsights(sampleBookmarks, folderMap);
      if (insights.length > 0) {
        expect(insights[0]).toHaveProperty('type');
        expect(insights[0]).toHaveProperty('message');
      }
    });

    it('should detect untagged bookmarks', () => {
      const bookmarksWithUntagged = [
        { id: '1', tags: [] },
        { id: '2', tags: [] },
        { id: '3', tags: ['test'] },
      ];
      const insights = generateInsights(bookmarksWithUntagged, {});
      const untaggedInsight = insights.find((i) => i.type === 'untagged');
      expect(untaggedInsight).toBeDefined();
    });

    it('should detect stale bookmarks', () => {
      const oldBookmarks = [
        { id: '1', dateAdded: new Date('2020-01-01').getTime(), visitCount: 0 },
      ];
      const insights = generateInsights(oldBookmarks, {});
      const staleInsight = insights.find((i) => i.type === 'stale');
      expect(staleInsight).toBeDefined();
    });

    it('should suggest folder organization', () => {
      const manyBookmarks = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        parentId: 'folder1',
        tags: [],
      }));
      const insights = generateInsights(manyBookmarks, { folder1: { title: 'Big Folder' } });
      const organizeInsight = insights.find((i) => i.type === 'organize');
      expect(organizeInsight).toBeDefined();
    });

    it('should handle empty bookmarks', () => {
      const insights = generateInsights([], {});
      expect(insights).toBeInstanceOf(Array);
    });
  });

  describe('calculateHealthScore', () => {
    it('should return score between 0 and 100', () => {
      const score = calculateHealthScore(sampleBookmarks);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(100);
    });

    it('should include component scores', () => {
      const score = calculateHealthScore(sampleBookmarks);
      expect(score).toHaveProperty('organization');
      expect(score).toHaveProperty('freshness');
      expect(score).toHaveProperty('engagement');
    });

    it('should penalize untagged bookmarks', () => {
      const taggedBookmarks = [
        { id: '1', tags: ['a'], visitCount: 10, dateAdded: Date.now() },
        { id: '2', tags: ['b'], visitCount: 10, dateAdded: Date.now() },
      ];
      const untaggedBookmarks = [
        { id: '1', tags: [], visitCount: 10, dateAdded: Date.now() },
        { id: '2', tags: [], visitCount: 10, dateAdded: Date.now() },
      ];

      const taggedScore = calculateHealthScore(taggedBookmarks);
      const untaggedScore = calculateHealthScore(untaggedBookmarks);

      expect(taggedScore.organization).toBeGreaterThan(untaggedScore.organization);
    });

    it('should reward recent bookmarks', () => {
      const recentBookmarks = [{ id: '1', dateAdded: Date.now(), tags: [], visitCount: 0 }];
      const oldBookmarks = [
        { id: '1', dateAdded: new Date('2020-01-01').getTime(), tags: [], visitCount: 0 },
      ];

      const recentScore = calculateHealthScore(recentBookmarks);
      const oldScore = calculateHealthScore(oldBookmarks);

      expect(recentScore.freshness).toBeGreaterThan(oldScore.freshness);
    });

    it('should handle empty bookmarks', () => {
      const score = calculateHealthScore([]);
      expect(score.overall).toBe(0);
    });

    it('should include recommendations', () => {
      const score = calculateHealthScore(sampleBookmarks);
      expect(score.recommendations).toBeInstanceOf(Array);
    });
  });
});
