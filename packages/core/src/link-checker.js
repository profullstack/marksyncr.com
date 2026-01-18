/**
 * @fileoverview Link checker module for validating bookmark URLs
 * Pro feature: Check bookmark links for broken URLs, redirects, and timeouts
 */

/**
 * Link status constants
 */
export const LINK_STATUS = {
  VALID: 'valid',
  BROKEN: 'broken',
  REDIRECT: 'redirect',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

/**
 * Default options for link checking
 */
export const DEFAULT_CHECK_OPTIONS = {
  timeout: 10000, // 10 seconds
  followRedirects: false,
  maxRedirects: 5,
  userAgent: 'MarkSyncr Link Checker/1.0',
  concurrency: 5,
};

/**
 * Check if a URL is valid for checking
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is valid
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string|null} Domain or null if invalid
 */
export function extractDomain(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Categorize HTTP status code into link status
 * @param {number} statusCode - HTTP status code
 * @returns {string} Link status
 */
export function categorizeStatus(statusCode) {
  if (statusCode === null || statusCode === undefined || statusCode === 0) {
    return LINK_STATUS.UNKNOWN;
  }

  if (statusCode >= 200 && statusCode < 300) {
    return LINK_STATUS.VALID;
  }

  if (statusCode >= 300 && statusCode < 400) {
    return LINK_STATUS.REDIRECT;
  }

  if (statusCode >= 400 && statusCode < 600) {
    return LINK_STATUS.BROKEN;
  }

  return LINK_STATUS.UNKNOWN;
}

/**
 * Create a link check result object
 * @param {Object} params - Result parameters
 * @param {string} params.bookmarkId - Bookmark ID
 * @param {string} params.url - URL that was checked
 * @param {string} [params.status] - Link status
 * @param {number} [params.statusCode] - HTTP status code
 * @param {string} [params.redirectUrl] - Redirect URL if applicable
 * @param {string} [params.errorMessage] - Error message if applicable
 * @returns {Object} Link check result
 */
export function createLinkCheckResult({
  bookmarkId,
  url,
  status = LINK_STATUS.UNKNOWN,
  statusCode = null,
  redirectUrl = null,
  errorMessage = null,
}) {
  return {
    bookmarkId,
    url,
    status,
    statusCode,
    redirectUrl,
    errorMessage,
    checkedAt: new Date(),
  };
}

/**
 * Check a single link
 * @param {Object} params - Check parameters
 * @param {string} params.bookmarkId - Bookmark ID
 * @param {string} params.url - URL to check
 * @param {Object} [options] - Check options
 * @returns {Promise<Object>} Link check result
 */
export async function checkLink({ bookmarkId, url }, options = {}) {
  const opts = { ...DEFAULT_CHECK_OPTIONS, ...options };

  // Validate URL
  if (!isValidUrl(url)) {
    return createLinkCheckResult({
      bookmarkId,
      url,
      status: LINK_STATUS.UNKNOWN,
      errorMessage: 'Invalid URL format',
    });
  }

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      redirect: opts.followRedirects ? 'follow' : 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': opts.userAgent,
      },
    });

    clearTimeout(timeoutId);

    const statusCode = response.status;
    const status = categorizeStatus(statusCode);

    // Get redirect URL if applicable
    let redirectUrl = null;
    if (status === LINK_STATUS.REDIRECT) {
      redirectUrl = response.headers.get('location');
    }

    return createLinkCheckResult({
      bookmarkId,
      url,
      status,
      statusCode,
      redirectUrl,
    });
  } catch (error) {
    // Handle timeout
    if (error.name === 'AbortError' || error.message.includes('AbortError')) {
      return createLinkCheckResult({
        bookmarkId,
        url,
        status: LINK_STATUS.TIMEOUT,
        errorMessage: 'Request timed out',
      });
    }

    // Handle other errors
    return createLinkCheckResult({
      bookmarkId,
      url,
      status: LINK_STATUS.BROKEN,
      errorMessage: error.message,
    });
  }
}

/**
 * Check multiple links with concurrency control
 * @param {Array} bookmarks - Array of bookmarks with id and url
 * @param {Object} [options] - Check options
 * @param {number} [options.concurrency] - Max concurrent requests
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<Array>} Array of link check results
 */
export async function checkLinks(bookmarks, options = {}) {
  const opts = { ...DEFAULT_CHECK_OPTIONS, ...options };
  const { concurrency = 5, onProgress } = opts;

  // Filter bookmarks with valid URLs
  const validBookmarks = bookmarks.filter((b) => b.url && isValidUrl(b.url));

  if (validBookmarks.length === 0) {
    return [];
  }

  const results = [];
  let completed = 0;
  const total = validBookmarks.length;

  // Process in batches for concurrency control
  const processBatch = async (batch) => {
    const batchResults = await Promise.all(
      batch.map(async (bookmark) => {
        const result = await checkLink({ bookmarkId: bookmark.id, url: bookmark.url }, opts);

        completed++;
        if (onProgress) {
          onProgress({
            completed,
            total,
            current: result,
            percentage: Math.round((completed / total) * 100),
          });
        }

        return result;
      })
    );

    return batchResults;
  };

  // Split into batches
  for (let i = 0; i < validBookmarks.length; i += concurrency) {
    const batch = validBookmarks.slice(i, i + concurrency);
    const batchResults = await processBatch(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get summary statistics from link check results
 * @param {Array} results - Array of link check results
 * @returns {Object} Summary statistics
 */
export function getLinkCheckSummary(results) {
  const summary = {
    total: results.length,
    valid: 0,
    broken: 0,
    redirect: 0,
    timeout: 0,
    unknown: 0,
  };

  results.forEach((result) => {
    switch (result.status) {
      case LINK_STATUS.VALID:
        summary.valid++;
        break;
      case LINK_STATUS.BROKEN:
        summary.broken++;
        break;
      case LINK_STATUS.REDIRECT:
        summary.redirect++;
        break;
      case LINK_STATUS.TIMEOUT:
        summary.timeout++;
        break;
      default:
        summary.unknown++;
    }
  });

  return summary;
}

/**
 * Filter results by status
 * @param {Array} results - Array of link check results
 * @param {string|Array} status - Status or array of statuses to filter by
 * @returns {Array} Filtered results
 */
export function filterByStatus(results, status) {
  const statuses = Array.isArray(status) ? status : [status];
  return results.filter((r) => statuses.includes(r.status));
}

/**
 * Get broken links from results
 * @param {Array} results - Array of link check results
 * @returns {Array} Broken link results
 */
export function getBrokenLinks(results) {
  return filterByStatus(results, [LINK_STATUS.BROKEN, LINK_STATUS.TIMEOUT]);
}

/**
 * Get redirected links from results
 * @param {Array} results - Array of link check results
 * @returns {Array} Redirected link results
 */
export function getRedirectedLinks(results) {
  return filterByStatus(results, LINK_STATUS.REDIRECT);
}

export default {
  LINK_STATUS,
  DEFAULT_CHECK_OPTIONS,
  isValidUrl,
  extractDomain,
  categorizeStatus,
  createLinkCheckResult,
  checkLink,
  checkLinks,
  getLinkCheckSummary,
  filterByStatus,
  getBrokenLinks,
  getRedirectedLinks,
};
