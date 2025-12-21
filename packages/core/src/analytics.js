/**
 * @fileoverview Bookmark analytics module
 * Provides aggregation functions, statistics calculations, and insights generation
 * for Pro users to understand their bookmark collection
 */

/**
 * @typedef {Object} BookmarkStats
 * @property {number} totalBookmarks - Total number of bookmarks
 * @property {number} uniqueDomains - Number of unique domains
 * @property {number} totalTags - Number of unique tags used
 * @property {number} bookmarksWithTags - Number of bookmarks that have tags
 * @property {number} taggedPercentage - Percentage of bookmarks with tags
 * @property {number} avgBookmarksPerFolder - Average bookmarks per folder
 * @property {number} totalVisits - Total visit count across all bookmarks
 * @property {Object} mostVisited - Most visited bookmark
 */

/**
 * @typedef {Object} DomainStats
 * @property {string} domain - Domain name
 * @property {number} count - Number of bookmarks from this domain
 * @property {number} totalVisits - Total visits to bookmarks from this domain
 */

/**
 * @typedef {Object} AgeDistribution
 * @property {number} thisWeek - Bookmarks added this week
 * @property {number} thisMonth - Bookmarks added this month
 * @property {number} thisYear - Bookmarks added this year
 * @property {number} older - Bookmarks older than a year
 * @property {number} thisWeekPercent - Percentage added this week
 * @property {number} thisMonthPercent - Percentage added this month
 * @property {number} thisYearPercent - Percentage added this year
 * @property {number} olderPercent - Percentage older than a year
 */

/**
 * Extracts domain from URL, normalizing www prefix
 * @param {string} url - URL to extract domain from
 * @returns {string} - Normalized domain
 */
const extractDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
};

/**
 * Calculates comprehensive bookmark statistics
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} [folderMap] - Map of folder IDs to folder objects
 * @returns {BookmarkStats}
 */
export const calculateBookmarkStats = (bookmarks, folderMap = {}) => {
  if (!bookmarks || bookmarks.length === 0) {
    return {
      totalBookmarks: 0,
      uniqueDomains: 0,
      totalTags: 0,
      bookmarksWithTags: 0,
      taggedPercentage: 0,
      avgBookmarksPerFolder: 0,
      totalVisits: 0,
      mostVisited: null,
    };
  }

  // Count unique domains
  const domains = new Set();
  bookmarks.forEach((b) => {
    if (b.url) {
      domains.add(extractDomain(b.url));
    }
  });

  // Count unique tags
  const allTags = new Set();
  let bookmarksWithTags = 0;
  bookmarks.forEach((b) => {
    if (b.tags && b.tags.length > 0) {
      bookmarksWithTags++;
      b.tags.forEach((tag) => allTags.add(tag));
    }
  });

  // Calculate folder stats
  const folderCount = Object.keys(folderMap).length || 1;
  const avgBookmarksPerFolder = Math.round(bookmarks.length / folderCount);

  // Calculate visit stats
  let totalVisits = 0;
  let mostVisited = null;
  bookmarks.forEach((b) => {
    const visits = b.visitCount || 0;
    totalVisits += visits;
    if (!mostVisited || visits > (mostVisited.visitCount || 0)) {
      mostVisited = b;
    }
  });

  return {
    totalBookmarks: bookmarks.length,
    uniqueDomains: domains.size,
    totalTags: allTags.size,
    bookmarksWithTags,
    taggedPercentage: (bookmarksWithTags / bookmarks.length) * 100,
    avgBookmarksPerFolder,
    totalVisits,
    mostVisited,
  };
};

/**
 * Gets top domains by bookmark count
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {number} [limit=10] - Maximum number of domains to return
 * @returns {DomainStats[]}
 */
export const getTopDomains = (bookmarks, limit = 10) => {
  if (!bookmarks || bookmarks.length === 0) {
    return [];
  }

  const domainMap = new Map();

  bookmarks.forEach((b) => {
    if (!b.url) return;

    const domain = extractDomain(b.url);
    const existing = domainMap.get(domain) || { count: 0, totalVisits: 0 };
    existing.count++;
    existing.totalVisits += b.visitCount || 0;
    domainMap.set(domain, existing);
  });

  return Array.from(domainMap.entries())
    .map(([domain, stats]) => ({
      domain,
      count: stats.count,
      totalVisits: stats.totalVisits,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

/**
 * Categorizes bookmarks by age
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Date} [now=new Date()] - Reference date for age calculation
 * @returns {AgeDistribution}
 */
export const getBookmarksByAge = (bookmarks, now = new Date()) => {
  const result = {
    thisWeek: 0,
    thisMonth: 0,
    thisYear: 0,
    older: 0,
    thisWeekPercent: 0,
    thisMonthPercent: 0,
    thisYearPercent: 0,
    olderPercent: 0,
  };

  if (!bookmarks || bookmarks.length === 0) {
    return result;
  }

  const nowTime = now.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;
  const oneYear = 365 * 24 * 60 * 60 * 1000;

  bookmarks.forEach((b) => {
    const dateAdded = b.dateAdded || 0;
    const age = nowTime - dateAdded;

    if (age <= oneWeek) {
      result.thisWeek++;
    } else if (age <= oneMonth) {
      result.thisMonth++;
    } else if (age <= oneYear) {
      result.thisYear++;
    } else {
      result.older++;
    }
  });

  const total = bookmarks.length;
  result.thisWeekPercent = (result.thisWeek / total) * 100;
  result.thisMonthPercent = (result.thisMonth / total) * 100;
  result.thisYearPercent = (result.thisYear / total) * 100;
  result.olderPercent = (result.older / total) * 100;

  return result;
};

/**
 * Gets bookmark distribution by folder
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} folderMap - Map of folder IDs to folder objects
 * @returns {Array<{folderId: string, folderName: string, count: number}>}
 */
export const getBookmarksByFolder = (bookmarks, folderMap) => {
  if (!bookmarks || bookmarks.length === 0) {
    return [];
  }

  const folderCounts = new Map();

  bookmarks.forEach((b) => {
    const folderId = b.parentId || 'root';
    const count = folderCounts.get(folderId) || 0;
    folderCounts.set(folderId, count + 1);
  });

  return Array.from(folderCounts.entries())
    .map(([folderId, count]) => ({
      folderId,
      folderName: folderMap[folderId]?.title || 'Unknown',
      count,
    }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Gets tag usage distribution
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {number} [limit=20] - Maximum number of tags to return
 * @returns {Array<{tag: string, count: number, percentage: number}>}
 */
export const getTagDistribution = (bookmarks, limit = 20) => {
  if (!bookmarks || bookmarks.length === 0) {
    return [];
  }

  const tagCounts = new Map();

  bookmarks.forEach((b) => {
    if (b.tags && Array.isArray(b.tags)) {
      b.tags.forEach((tag) => {
        const count = tagCounts.get(tag) || 0;
        tagCounts.set(tag, count + 1);
      });
    }
  });

  const total = bookmarks.length;

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      percentage: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

/**
 * Calculates bookmark growth trend over time
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {'week'|'month'} period - Period granularity
 * @param {number} [periods=12] - Number of periods to include
 * @returns {Array<{period: string, count: number, cumulative: number}>}
 */
export const getGrowthTrend = (bookmarks, period = 'month', periods = 12) => {
  if (!bookmarks || bookmarks.length === 0) {
    return [];
  }

  // Sort bookmarks by date
  const sorted = [...bookmarks].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));

  // Group by period
  const periodMap = new Map();
  const periodMs = period === 'week' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

  sorted.forEach((b) => {
    const date = new Date(b.dateAdded || 0);
    let periodKey;

    if (period === 'week') {
      // Get ISO week
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((date - startOfYear) / periodMs + startOfYear.getDay() + 1) / 7);
      periodKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    } else {
      periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const count = periodMap.get(periodKey) || 0;
    periodMap.set(periodKey, count + 1);
  });

  // Convert to array and calculate cumulative
  const result = Array.from(periodMap.entries())
    .map(([periodKey, count]) => ({
      period: periodKey,
      count,
      cumulative: 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-periods);

  // Calculate cumulative totals
  let cumulative = 0;
  result.forEach((item) => {
    cumulative += item.count;
    item.cumulative = cumulative;
  });

  return result;
};

/**
 * Generates activity heatmap data
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {{byDayOfWeek: Array, byHour: Array, mostActiveDay: Object}}
 */
export const getActivityHeatmap = (bookmarks) => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const byDayOfWeek = dayNames.map((name, index) => ({
    day: index,
    dayName: name,
    count: 0,
  }));

  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
  }));

  if (!bookmarks || bookmarks.length === 0) {
    return {
      byDayOfWeek,
      byHour,
      mostActiveDay: { day: 0, dayName: 'Sunday', count: 0 },
    };
  }

  bookmarks.forEach((b) => {
    const date = new Date(b.dateAdded || 0);
    byDayOfWeek[date.getDay()].count++;
    byHour[date.getHours()].count++;
  });

  const mostActiveDay = byDayOfWeek.reduce((max, day) => (day.count > max.count ? day : max));

  return {
    byDayOfWeek,
    byHour,
    mostActiveDay,
  };
};

/**
 * Generates actionable insights based on bookmark data
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} folderMap - Map of folder IDs to folder objects
 * @returns {Array<{type: string, message: string, severity: string, action?: string}>}
 */
export const generateInsights = (bookmarks, folderMap) => {
  const insights = [];

  if (!bookmarks || bookmarks.length === 0) {
    return insights;
  }

  // Check for untagged bookmarks
  const untaggedCount = bookmarks.filter((b) => !b.tags || b.tags.length === 0).length;
  const untaggedPercent = (untaggedCount / bookmarks.length) * 100;

  if (untaggedPercent > 30) {
    insights.push({
      type: 'untagged',
      message: `${untaggedCount} bookmarks (${Math.round(untaggedPercent)}%) don't have tags. Adding tags improves searchability.`,
      severity: 'info',
      action: 'Add tags to organize your bookmarks',
    });
  }

  // Check for stale bookmarks (old and never visited)
  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const staleBookmarks = bookmarks.filter(
    (b) => (b.dateAdded || 0) < oneYearAgo && (b.visitCount || 0) === 0
  );

  if (staleBookmarks.length > 0) {
    insights.push({
      type: 'stale',
      message: `${staleBookmarks.length} bookmarks are over a year old and have never been visited. Consider reviewing them.`,
      severity: 'warning',
      action: 'Review and clean up old bookmarks',
    });
  }

  // Check for oversized folders
  const folderCounts = new Map();
  bookmarks.forEach((b) => {
    const folderId = b.parentId || 'root';
    const count = folderCounts.get(folderId) || 0;
    folderCounts.set(folderId, count + 1);
  });

  folderCounts.forEach((count, folderId) => {
    if (count > 30) {
      const folderName = folderMap[folderId]?.title || 'Unknown folder';
      insights.push({
        type: 'organize',
        message: `"${folderName}" has ${count} bookmarks. Consider creating subfolders for better organization.`,
        severity: 'info',
        action: 'Create subfolders to organize bookmarks',
      });
    }
  });

  // Check for duplicate domains
  const domainCounts = new Map();
  bookmarks.forEach((b) => {
    if (b.url) {
      const domain = extractDomain(b.url);
      const count = domainCounts.get(domain) || 0;
      domainCounts.set(domain, count + 1);
    }
  });

  const topDomain = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  if (topDomain && topDomain[1] > 10) {
    insights.push({
      type: 'concentration',
      message: `You have ${topDomain[1]} bookmarks from ${topDomain[0]}. Consider using a dedicated folder.`,
      severity: 'info',
      action: 'Create a folder for frequently bookmarked sites',
    });
  }

  // Check for low engagement
  const visitedCount = bookmarks.filter((b) => (b.visitCount || 0) > 0).length;
  const visitedPercent = (visitedCount / bookmarks.length) * 100;

  if (visitedPercent < 20 && bookmarks.length > 10) {
    insights.push({
      type: 'engagement',
      message: `Only ${Math.round(visitedPercent)}% of your bookmarks have been visited. Many might be outdated.`,
      severity: 'info',
      action: 'Review bookmarks you haven\'t visited',
    });
  }

  return insights;
};

/**
 * Calculates a health score for the bookmark collection
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {{overall: number, organization: number, freshness: number, engagement: number, recommendations: string[]}}
 */
export const calculateHealthScore = (bookmarks) => {
  if (!bookmarks || bookmarks.length === 0) {
    return {
      overall: 0,
      organization: 0,
      freshness: 0,
      engagement: 0,
      recommendations: [],
    };
  }

  const recommendations = [];

  // Organization score (0-100) - based on tagging
  const taggedCount = bookmarks.filter((b) => b.tags && b.tags.length > 0).length;
  const taggedPercent = (taggedCount / bookmarks.length) * 100;
  const organization = Math.min(100, taggedPercent * 1.2); // Boost slightly

  if (organization < 50) {
    recommendations.push('Add tags to more bookmarks for better organization');
  }

  // Freshness score (0-100) - based on recency
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  const sixMonths = 180 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;

  let freshnessSum = 0;
  bookmarks.forEach((b) => {
    const age = now - (b.dateAdded || 0);
    if (age < oneMonth) {
      freshnessSum += 100;
    } else if (age < sixMonths) {
      freshnessSum += 70;
    } else if (age < oneYear) {
      freshnessSum += 40;
    } else {
      freshnessSum += 10;
    }
  });
  const freshness = freshnessSum / bookmarks.length;

  if (freshness < 40) {
    recommendations.push('Review and clean up old bookmarks');
  }

  // Engagement score (0-100) - based on visit counts
  const visitedCount = bookmarks.filter((b) => (b.visitCount || 0) > 0).length;
  const visitedPercent = (visitedCount / bookmarks.length) * 100;
  const engagement = Math.min(100, visitedPercent * 1.5); // Boost slightly

  if (engagement < 30) {
    recommendations.push('Many bookmarks have never been visited - consider reviewing them');
  }

  // Overall score is weighted average
  const overall = Math.round(organization * 0.3 + freshness * 0.3 + engagement * 0.4);

  return {
    overall,
    organization: Math.round(organization),
    freshness: Math.round(freshness),
    engagement: Math.round(engagement),
    recommendations,
  };
};

export default {
  calculateBookmarkStats,
  getTopDomains,
  getBookmarksByAge,
  getBookmarksByFolder,
  getTagDistribution,
  getGrowthTrend,
  getActivityHeatmap,
  generateInsights,
  calculateHealthScore,
};
