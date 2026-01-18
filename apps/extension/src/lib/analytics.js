/**
 * @fileoverview Analytics tracking utility for the browser extension
 * Tracks user interactions and feature usage
 */

/**
 * Analytics event names for consistent tracking
 */
export const ANALYTICS_EVENTS = {
  // Extension events
  EXTENSION_OPENED: 'extension_opened',
  POPUP_OPENED: 'popup_opened',

  // Sync events
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',
  SOURCE_CONNECTED: 'source_connected',
  SOURCE_DISCONNECTED: 'source_disconnected',

  // Bookmark events
  BOOKMARK_CREATED: 'bookmark_created',
  BOOKMARK_DELETED: 'bookmark_deleted',
  BOOKMARK_UPDATED: 'bookmark_updated',
  BOOKMARKS_IMPORTED: 'bookmarks_imported',
  BOOKMARKS_EXPORTED: 'bookmarks_exported',

  // Pro feature events
  TAG_CREATED: 'tag_created',
  TAG_APPLIED: 'tag_applied',
  TAG_REMOVED: 'tag_removed',
  NOTE_ADDED: 'note_added',
  NOTE_UPDATED: 'note_updated',
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',
  DUPLICATES_SCANNED: 'duplicates_scanned',
  DUPLICATES_MERGED: 'duplicates_merged',
  LINK_CHECK_STARTED: 'link_check_started',
  LINK_CHECK_COMPLETED: 'link_check_completed',
  BROKEN_LINK_REMOVED: 'broken_link_removed',
  ANALYTICS_VIEWED: 'analytics_viewed',
  SCHEDULE_ENABLED: 'schedule_enabled',
  SCHEDULE_DISABLED: 'schedule_disabled',
  SCHEDULE_UPDATED: 'schedule_updated',

  // Upgrade events
  UPGRADE_PROMPT_SHOWN: 'upgrade_prompt_shown',
  UPGRADE_CLICKED: 'upgrade_clicked',

  // Error events
  ERROR_OCCURRED: 'error_occurred',
};

/**
 * Sends an analytics event to the web app for tracking
 * @param {string} eventName - Name of the event
 * @param {Object} [properties={}] - Event properties
 */
export const trackEvent = async (eventName, properties = {}) => {
  try {
    // Get user info from storage
    const storage = await chrome.storage.local.get(['user', 'subscription']);
    const userId = storage.user?.id;
    const plan = storage.subscription?.plan || 'free';

    const eventData = {
      event: eventName,
      timestamp: new Date().toISOString(),
      user_id: userId,
      plan,
      source: 'extension',
      browser: getBrowserName(),
      ...properties,
    };

    // Send to background script for batching/sending
    chrome.runtime.sendMessage({
      type: 'TRACK_EVENT',
      payload: eventData,
    });

    // Also log locally for debugging
    if (import.meta.env?.DEV) {
      console.log('[Analytics]', eventName, properties);
    }
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

/**
 * Gets the browser name
 * @returns {string}
 */
const getBrowserName = () => {
  const userAgent = navigator.userAgent;

  // Check Firefox first
  if (userAgent.includes('Firefox')) return 'firefox';

  // Check Brave - Brave exposes navigator.brave for detection
  // Note: Brave doesn't include "Brave" in user agent for privacy reasons
  if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
    return 'brave';
  }

  // Check other browsers
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'safari';
  if (userAgent.includes('Edg/')) return 'edge';
  if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) return 'opera';
  if (userAgent.includes('Vivaldi/')) return 'vivaldi';
  if (userAgent.includes('Chrome')) return 'chrome';

  return 'unknown';
};

/**
 * Tracks popup opened event
 */
export const trackPopupOpened = () => {
  trackEvent(ANALYTICS_EVENTS.POPUP_OPENED, {
    url: window.location.href,
  });
};

/**
 * Tracks sync events
 * @param {string} sourceType - Type of sync source
 * @param {boolean} success - Whether sync was successful
 * @param {Object} [details={}] - Additional details
 */
export const trackSync = (sourceType, success, details = {}) => {
  trackEvent(success ? ANALYTICS_EVENTS.SYNC_COMPLETED : ANALYTICS_EVENTS.SYNC_FAILED, {
    source_type: sourceType,
    success,
    ...details,
  });
};

/**
 * Tracks tag operations
 * @param {string} action - 'created', 'applied', or 'removed'
 * @param {Object} [details={}] - Additional details
 */
export const trackTagAction = (action, details = {}) => {
  const eventMap = {
    created: ANALYTICS_EVENTS.TAG_CREATED,
    applied: ANALYTICS_EVENTS.TAG_APPLIED,
    removed: ANALYTICS_EVENTS.TAG_REMOVED,
  };
  trackEvent(eventMap[action] || 'tag_action', details);
};

/**
 * Tracks search performed
 * @param {Object} params - Search parameters
 */
export const trackSearch = ({ query, resultCount, hasFilters, filters }) => {
  trackEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
    query_length: query?.length || 0,
    result_count: resultCount,
    has_filters: hasFilters,
    filter_types: filters ? Object.keys(filters).filter((k) => filters[k]) : [],
  });
};

/**
 * Tracks duplicate detection
 * @param {Object} params - Detection parameters
 */
export const trackDuplicateScan = ({ totalBookmarks, duplicatesFound, groupCount }) => {
  trackEvent(ANALYTICS_EVENTS.DUPLICATES_SCANNED, {
    total_bookmarks: totalBookmarks,
    duplicates_found: duplicatesFound,
    group_count: groupCount,
  });
};

/**
 * Tracks link health check
 * @param {Object} params - Check parameters
 */
export const trackLinkCheck = ({ totalChecked, brokenCount, redirectCount, duration }) => {
  trackEvent(ANALYTICS_EVENTS.LINK_CHECK_COMPLETED, {
    total_checked: totalChecked,
    broken_count: brokenCount,
    redirect_count: redirectCount,
    duration_ms: duration,
  });
};

/**
 * Tracks import operation
 * @param {Object} params - Import parameters
 */
export const trackImport = ({ format, count, source }) => {
  trackEvent(ANALYTICS_EVENTS.BOOKMARKS_IMPORTED, {
    format,
    count,
    source,
  });
};

/**
 * Tracks export operation
 * @param {Object} params - Export parameters
 */
export const trackExport = ({ format, count }) => {
  trackEvent(ANALYTICS_EVENTS.BOOKMARKS_EXPORTED, {
    format,
    count,
  });
};

/**
 * Tracks schedule configuration
 * @param {Object} params - Schedule parameters
 */
export const trackScheduleChange = ({ sourceId, intervalMinutes, enabled }) => {
  const event = enabled ? ANALYTICS_EVENTS.SCHEDULE_ENABLED : ANALYTICS_EVENTS.SCHEDULE_DISABLED;
  trackEvent(event, {
    source_id: sourceId,
    interval_minutes: intervalMinutes,
  });
};

/**
 * Tracks upgrade prompt shown
 * @param {string} feature - Feature that triggered the prompt
 */
export const trackUpgradePrompt = (feature) => {
  trackEvent(ANALYTICS_EVENTS.UPGRADE_PROMPT_SHOWN, {
    feature,
    location: 'extension',
  });
};

/**
 * Tracks upgrade button clicked
 * @param {string} feature - Feature that triggered the click
 */
export const trackUpgradeClicked = (feature) => {
  trackEvent(ANALYTICS_EVENTS.UPGRADE_CLICKED, {
    feature,
    location: 'extension',
  });
};

/**
 * Tracks analytics dashboard viewed
 */
export const trackAnalyticsViewed = () => {
  trackEvent(ANALYTICS_EVENTS.ANALYTICS_VIEWED);
};

/**
 * Tracks errors
 * @param {Object} params - Error parameters
 */
export const trackError = ({ errorType, errorMessage, context }) => {
  trackEvent(ANALYTICS_EVENTS.ERROR_OCCURRED, {
    error_type: errorType,
    error_message: errorMessage?.substring(0, 200),
    context,
  });
};

export default {
  ANALYTICS_EVENTS,
  trackEvent,
  trackPopupOpened,
  trackSync,
  trackTagAction,
  trackSearch,
  trackDuplicateScan,
  trackLinkCheck,
  trackImport,
  trackExport,
  trackScheduleChange,
  trackUpgradePrompt,
  trackUpgradeClicked,
  trackAnalyticsViewed,
  trackError,
};
