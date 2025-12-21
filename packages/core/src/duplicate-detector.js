/**
 * @fileoverview Duplicate Detection Engine
 * Finds and manages duplicate bookmarks using URL normalization and title similarity
 */

/**
 * Common tracking parameters to remove from URLs
 */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
];

/**
 * Normalize a URL for comparison
 * - Removes trailing slashes
 * - Removes www prefix
 * - Converts to lowercase
 * - Removes common tracking parameters
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);

    // Remove www prefix
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }

    // Remove tracking parameters
    const params = new URLSearchParams(parsed.search);
    for (const param of TRACKING_PARAMS) {
      params.delete(param);
    }

    // Reconstruct URL
    let normalized = `${parsed.protocol}//${hostname}`;

    // Add path without trailing slash
    let path = parsed.pathname.toLowerCase();
    // Remove trailing slash unless it's the root path
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    // Don't add "/" for root path
    if (path !== '/') {
      normalized += path;
    }

    // Add remaining query params
    const queryString = params.toString();
    if (queryString) {
      normalized += `?${queryString}`;
    }

    return normalized;
  } catch {
    // Return original if URL parsing fails
    return url;
  }
}

/**
 * Calculate similarity between two strings using Dice coefficient
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
export function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Create bigrams
  const getBigrams = (str) => {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);

  if (bigrams1.size === 0 && bigrams2.size === 0) return 1;

  // Calculate intersection
  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++;
    }
  }

  // Dice coefficient
  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Find duplicate bookmarks by URL (exact match after normalization)
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Array} Array of duplicate groups (each group is an array of bookmarks)
 */
export function findDuplicatesByUrl(bookmarks) {
  const urlMap = new Map();

  // Group bookmarks by normalized URL
  for (const bookmark of bookmarks) {
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, []);
    }
    urlMap.get(normalizedUrl).push(bookmark);
  }

  // Filter to only groups with duplicates
  const duplicates = [];
  for (const group of urlMap.values()) {
    if (group.length > 1) {
      duplicates.push(group);
    }
  }

  return duplicates;
}

/**
 * Find duplicate bookmarks by title (exact match, case-insensitive)
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Array} Array of duplicate groups
 */
export function findDuplicatesByTitle(bookmarks) {
  const titleMap = new Map();

  // Group bookmarks by normalized title
  for (const bookmark of bookmarks) {
    const normalizedTitle = bookmark.title?.toLowerCase().trim() || '';
    if (!normalizedTitle) continue;

    if (!titleMap.has(normalizedTitle)) {
      titleMap.set(normalizedTitle, []);
    }
    titleMap.get(normalizedTitle).push(bookmark);
  }

  // Filter to only groups with duplicates
  const duplicates = [];
  for (const group of titleMap.values()) {
    if (group.length > 1) {
      duplicates.push(group);
    }
  }

  return duplicates;
}

/**
 * Find similar bookmarks by title (fuzzy matching)
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} options - Options
 * @param {number} options.threshold - Similarity threshold (0-1), default 0.7
 * @returns {Array} Array of similar bookmark pairs with similarity scores
 */
export function findSimilarBookmarks(bookmarks, options = {}) {
  const { threshold = 0.7 } = options;
  const similar = [];
  const processed = new Set();

  for (let i = 0; i < bookmarks.length; i++) {
    for (let j = i + 1; j < bookmarks.length; j++) {
      const b1 = bookmarks[i];
      const b2 = bookmarks[j];

      // Skip if already found as exact duplicates
      const pairKey = [b1.id, b2.id].sort().join('-');
      if (processed.has(pairKey)) continue;

      // Calculate title similarity
      const titleSimilarity = calculateSimilarity(b1.title || '', b2.title || '');

      // Calculate URL similarity (for same domain)
      let urlSimilarity = 0;
      try {
        const url1 = new URL(b1.url);
        const url2 = new URL(b2.url);
        if (url1.hostname === url2.hostname) {
          urlSimilarity = calculateSimilarity(url1.pathname, url2.pathname);
        }
      } catch {
        // Ignore URL parsing errors
      }

      // Combined similarity (weighted average)
      const combinedSimilarity = titleSimilarity * 0.7 + urlSimilarity * 0.3;

      if (combinedSimilarity >= threshold) {
        similar.push({
          bookmarks: [b1, b2],
          similarity: combinedSimilarity,
          titleSimilarity,
          urlSimilarity,
        });
        processed.add(pairKey);
      }
    }
  }

  // Sort by similarity (highest first)
  return similar.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find all types of duplicates
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} options - Options
 * @param {number} options.similarityThreshold - Threshold for similar bookmarks
 * @returns {Object} Object with exact and similar duplicates
 */
export function findDuplicates(bookmarks, options = {}) {
  const { similarityThreshold = 0.7 } = options;

  const urlDuplicates = findDuplicatesByUrl(bookmarks);
  const titleDuplicates = findDuplicatesByTitle(bookmarks);
  const similarBookmarks = findSimilarBookmarks(bookmarks, { threshold: similarityThreshold });

  // Merge URL and title duplicates, removing overlaps
  const exactDuplicates = [...urlDuplicates];
  const urlDuplicateIds = new Set(urlDuplicates.flat().map((b) => b.id));

  for (const group of titleDuplicates) {
    // Only add if not already covered by URL duplicates
    const hasOverlap = group.some((b) => urlDuplicateIds.has(b.id));
    if (!hasOverlap) {
      exactDuplicates.push(group);
    }
  }

  // Count total duplicates (excluding the "keep" bookmark from each group)
  let total = 0;
  for (const group of exactDuplicates) {
    total += group.length - 1;
  }

  return {
    exact: exactDuplicates,
    similar: similarBookmarks,
    total,
  };
}

/**
 * Group all bookmarks by normalized URL
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Map} Map of normalized URL to array of bookmarks
 */
export function groupDuplicates(bookmarks) {
  const groups = new Map();

  for (const bookmark of bookmarks) {
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (!groups.has(normalizedUrl)) {
      groups.set(normalizedUrl, []);
    }
    groups.get(normalizedUrl).push(bookmark);
  }

  return groups;
}

/**
 * Calculate metadata score for a bookmark
 * @param {Object} bookmark - Bookmark object
 * @returns {number} Metadata score
 */
function calculateMetadataScore(bookmark) {
  let score = 0;

  if (bookmark.title && bookmark.title.length > 10) score += 1;
  if (bookmark.notes && bookmark.notes.length > 0) score += 2;
  if (bookmark.tags && bookmark.tags.length > 0) score += bookmark.tags.length;

  return score;
}

/**
 * Suggest which bookmark to keep and which to remove
 * @param {Array} duplicates - Array of duplicate bookmarks
 * @param {Object} options - Options
 * @param {boolean} options.preferMetadata - Prefer bookmarks with more metadata
 * @param {boolean} options.preferRecent - Prefer more recently added bookmarks
 * @returns {Object} Suggestion with keep, remove, and reason
 */
export function suggestMerge(duplicates, options = {}) {
  const { preferMetadata = false, preferRecent = true } = options;

  if (duplicates.length === 0) {
    return { keep: null, remove: [], reason: 'No bookmarks provided' };
  }

  if (duplicates.length === 1) {
    return { keep: duplicates[0], remove: [], reason: 'Only one bookmark' };
  }

  // Sort bookmarks by preference
  const sorted = [...duplicates].sort((a, b) => {
    // First, compare by metadata if preferred
    if (preferMetadata) {
      const metaScoreA = calculateMetadataScore(a);
      const metaScoreB = calculateMetadataScore(b);
      if (metaScoreA !== metaScoreB) {
        return metaScoreB - metaScoreA;
      }
    }

    // Then, compare by date
    if (preferRecent) {
      const dateA = new Date(a.dateAdded || 0);
      const dateB = new Date(b.dateAdded || 0);
      return dateB - dateA;
    }

    return 0;
  });

  const keep = sorted[0];
  const remove = sorted.slice(1);

  // Generate reason
  let reason = 'Keeping ';
  if (preferMetadata && calculateMetadataScore(keep) > 0) {
    reason += 'bookmark with most metadata';
  } else if (preferRecent) {
    reason += 'most recently added bookmark';
  } else {
    reason += 'first bookmark';
  }

  return { keep, remove, reason };
}

/**
 * Get duplicate statistics
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Object} Statistics about duplicates
 */
export function getDuplicateStats(bookmarks) {
  const duplicates = findDuplicates(bookmarks);
  const groups = groupDuplicates(bookmarks);

  let uniqueUrls = 0;
  let duplicateUrls = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      uniqueUrls++;
    } else {
      duplicateUrls++;
    }
  }

  return {
    totalBookmarks: bookmarks.length,
    uniqueUrls,
    duplicateUrls,
    exactDuplicateGroups: duplicates.exact.length,
    similarPairs: duplicates.similar.length,
    potentialSavings: duplicates.total,
  };
}

export default {
  normalizeUrl,
  calculateSimilarity,
  findDuplicatesByUrl,
  findDuplicatesByTitle,
  findSimilarBookmarks,
  findDuplicates,
  groupDuplicates,
  suggestMerge,
  getDuplicateStats,
};
