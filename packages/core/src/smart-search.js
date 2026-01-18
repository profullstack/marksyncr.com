/**
 * @fileoverview Smart Search Engine using Fuse.js
 * Provides fuzzy search, filtering, and advanced search capabilities for bookmarks
 */

import Fuse from 'fuse.js';

/**
 * Default Fuse.js options for bookmark search
 */
export const DEFAULT_FUSE_OPTIONS = {
  // Search in these fields
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'url', weight: 0.2 },
    { name: 'notes', weight: 0.2 },
    { name: 'tags.name', weight: 0.2 },
  ],
  // Include score in results
  includeScore: true,
  // Include matched indices
  includeMatches: true,
  // Fuzzy matching threshold (0 = exact, 1 = match anything)
  threshold: 0.4,
  // Ignore location of match in string
  ignoreLocation: true,
  // Minimum characters before search starts
  minMatchCharLength: 2,
  // Use extended search syntax
  useExtendedSearch: true,
  // Find all matches
  findAllMatches: true,
};

/**
 * Create a search engine instance for bookmarks
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} options - Optional Fuse.js configuration overrides
 * @returns {Fuse} Fuse.js instance
 */
export function createSearchEngine(bookmarks, options = {}) {
  const fuseOptions = {
    ...DEFAULT_FUSE_OPTIONS,
    ...options,
  };

  return new Fuse(bookmarks, fuseOptions);
}

/**
 * Search bookmarks using the search engine
 * @param {Fuse} engine - Fuse.js search engine instance
 * @param {string} query - Search query string
 * @param {Object} options - Search options
 * @param {number} options.limit - Maximum number of results
 * @param {number} options.threshold - Override threshold for this search
 * @returns {Array} Array of search results with scores
 */
export function searchBookmarks(engine, query, options = {}) {
  if (!query || query.trim() === '') {
    return [];
  }

  const searchOptions = {};

  if (options.limit) {
    searchOptions.limit = options.limit;
  }

  // Create a new engine with different threshold if specified
  if (options.threshold !== undefined) {
    const currentOptions = engine.options;
    const newEngine = new Fuse(engine.getIndex().docs, {
      ...currentOptions,
      threshold: options.threshold,
    });
    return newEngine.search(query.trim(), searchOptions);
  }

  return engine.search(query.trim(), searchOptions);
}

/**
 * Filter bookmarks by folder ID
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {string|null} folderId - Folder ID to filter by, or null for all
 * @returns {Array} Filtered bookmarks
 */
export function filterByFolder(bookmarks, folderId) {
  if (!folderId) {
    return bookmarks;
  }

  return bookmarks.filter((bookmark) => bookmark.parentId === folderId);
}

/**
 * Filter bookmarks by tag (ID or name)
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {string|null} tag - Tag ID or name to filter by, or null for all
 * @returns {Array} Filtered bookmarks
 */
export function filterByTag(bookmarks, tag) {
  if (!tag) {
    return bookmarks;
  }

  const tagLower = tag.toLowerCase();

  return bookmarks.filter((bookmark) => {
    if (!bookmark.tags || bookmark.tags.length === 0) {
      return false;
    }

    return bookmark.tags.some((t) => t.id === tag || t.name.toLowerCase() === tagLower);
  });
}

/**
 * Filter bookmarks by domain
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {string|null} domain - Domain to filter by, or null for all
 * @returns {Array} Filtered bookmarks
 */
export function filterByDomain(bookmarks, domain) {
  if (!domain) {
    return bookmarks;
  }

  const domainLower = domain.toLowerCase();

  return bookmarks.filter((bookmark) => {
    try {
      const url = new URL(bookmark.url);
      return url.hostname.toLowerCase().includes(domainLower);
    } catch {
      return false;
    }
  });
}

/**
 * Filter bookmarks by date range
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Date|null} startDate - Start date (inclusive), or null for no start limit
 * @param {Date|null} endDate - End date (inclusive), or null for no end limit
 * @returns {Array} Filtered bookmarks
 */
export function filterByDateRange(bookmarks, startDate, endDate) {
  if (!startDate && !endDate) {
    return bookmarks;
  }

  return bookmarks.filter((bookmark) => {
    const bookmarkDate = new Date(bookmark.dateAdded);

    if (startDate) {
      // Set start date to beginning of day for inclusive comparison
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);
      if (bookmarkDate < startOfDay) {
        return false;
      }
    }

    if (endDate) {
      // Set end date to end of day for inclusive comparison
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (bookmarkDate > endOfDay) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Apply multiple filters to bookmarks
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} filters - Filter options
 * @param {string} filters.folder - Folder ID to filter by
 * @param {string} filters.tag - Tag ID or name to filter by
 * @param {string} filters.domain - Domain to filter by
 * @param {Date} filters.startDate - Start date for date range filter
 * @param {Date} filters.endDate - End date for date range filter
 * @returns {Array} Filtered bookmarks
 */
export function applyFilters(bookmarks, filters = {}) {
  if (!filters) {
    return bookmarks;
  }

  let result = bookmarks;

  if (filters.folder) {
    result = filterByFolder(result, filters.folder);
  }

  if (filters.tag) {
    result = filterByTag(result, filters.tag);
  }

  if (filters.domain) {
    result = filterByDomain(result, filters.domain);
  }

  if (filters.startDate || filters.endDate) {
    result = filterByDateRange(result, filters.startDate, filters.endDate);
  }

  return result;
}

/**
 * Combined search and filter function
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {string} query - Search query string
 * @param {Object} filters - Filter options
 * @param {Object} searchOptions - Search options (limit, threshold)
 * @returns {Array} Search results with filters applied
 */
export function searchAndFilter(bookmarks, query, filters = {}, searchOptions = {}) {
  // First apply filters
  const filteredBookmarks = applyFilters(bookmarks, filters);

  // If no query, return filtered results as-is
  if (!query || query.trim() === '') {
    return filteredBookmarks.map((item) => ({ item, score: 0 }));
  }

  // Create search engine with filtered bookmarks
  const engine = createSearchEngine(filteredBookmarks);

  // Perform search
  return searchBookmarks(engine, query, searchOptions);
}

/**
 * Extract unique domains from bookmarks
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Array} Array of unique domain strings
 */
export function extractDomains(bookmarks) {
  const domains = new Set();

  for (const bookmark of bookmarks) {
    try {
      const url = new URL(bookmark.url);
      domains.add(url.hostname);
    } catch {
      // Skip invalid URLs
    }
  }

  return Array.from(domains).sort();
}

/**
 * Extract unique tags from bookmarks
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Array} Array of unique tag objects
 */
export function extractTags(bookmarks) {
  const tagsMap = new Map();

  for (const bookmark of bookmarks) {
    if (bookmark.tags && Array.isArray(bookmark.tags)) {
      for (const tag of bookmark.tags) {
        if (!tagsMap.has(tag.id)) {
          tagsMap.set(tag.id, tag);
        }
      }
    }
  }

  return Array.from(tagsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get search suggestions based on partial query
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {string} partialQuery - Partial search query
 * @param {number} limit - Maximum number of suggestions
 * @returns {Array} Array of suggestion strings
 */
export function getSearchSuggestions(bookmarks, partialQuery, limit = 5) {
  if (!partialQuery || partialQuery.length < 2) {
    return [];
  }

  const suggestions = new Set();
  const queryLower = partialQuery.toLowerCase();

  for (const bookmark of bookmarks) {
    // Check title
    if (bookmark.title?.toLowerCase().includes(queryLower)) {
      suggestions.add(bookmark.title);
    }

    // Check tags
    if (bookmark.tags) {
      for (const tag of bookmark.tags) {
        if (tag.name.toLowerCase().includes(queryLower)) {
          suggestions.add(`tag:${tag.name}`);
        }
      }
    }

    // Check domain
    try {
      const url = new URL(bookmark.url);
      if (url.hostname.toLowerCase().includes(queryLower)) {
        suggestions.add(`domain:${url.hostname}`);
      }
    } catch {
      // Skip invalid URLs
    }

    if (suggestions.size >= limit * 2) {
      break;
    }
  }

  return Array.from(suggestions).slice(0, limit);
}

export default {
  createSearchEngine,
  searchBookmarks,
  filterByFolder,
  filterByTag,
  filterByDomain,
  filterByDateRange,
  applyFilters,
  searchAndFilter,
  extractDomains,
  extractTags,
  getSearchSuggestions,
};
