/**
 * @fileoverview Datafast analytics tracking utility
 * Tracks user interactions and conversion events for MarkSyncr
 */

/**
 * Analytics event names for consistent tracking
 */
export const ANALYTICS_EVENTS = {
  // Authentication events
  SIGN_UP: 'sign_up',
  SIGN_IN: 'sign_in',
  SIGN_OUT: 'sign_out',
  PASSWORD_RESET: 'password_reset',

  // Checkout & subscription events
  INITIATE_CHECKOUT: 'initiate_checkout',
  CHECKOUT_COMPLETE: 'checkout_complete',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  TRIAL_STARTED: 'trial_started',
  UPGRADE_CLICKED: 'upgrade_clicked',
  PLAN_SELECTED: 'plan_selected',

  // Sync source events
  SOURCE_CONNECTED: 'source_connected',
  SOURCE_DISCONNECTED: 'source_disconnected',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',

  // Bookmark events
  BOOKMARK_CREATED: 'bookmark_created',
  BOOKMARK_DELETED: 'bookmark_deleted',
  BOOKMARK_UPDATED: 'bookmark_updated',
  BOOKMARKS_IMPORTED: 'bookmarks_imported',
  BOOKMARKS_EXPORTED: 'bookmarks_exported',

  // Pro feature events
  TAG_CREATED: 'tag_created',
  TAG_APPLIED: 'tag_applied',
  NOTE_ADDED: 'note_added',
  SEARCH_PERFORMED: 'search_performed',
  DUPLICATES_FOUND: 'duplicates_found',
  DUPLICATES_MERGED: 'duplicates_merged',
  LINK_CHECK_STARTED: 'link_check_started',
  LINK_CHECK_COMPLETED: 'link_check_completed',
  BROKEN_LINK_FIXED: 'broken_link_fixed',
  ANALYTICS_VIEWED: 'analytics_viewed',
  SCHEDULE_CONFIGURED: 'schedule_configured',

  // Page views
  PAGE_VIEW: 'page_view',
  PRICING_VIEWED: 'pricing_viewed',
  DOCS_VIEWED: 'docs_viewed',
  DASHBOARD_VIEWED: 'dashboard_viewed',

  // Extension events
  EXTENSION_INSTALLED: 'extension_installed',
  EXTENSION_OPENED: 'extension_opened',
  POPUP_OPENED: 'popup_opened',

  // Error events
  ERROR_OCCURRED: 'error_occurred',
};

/**
 * Tracks an analytics event using Datafast
 * @param {string} eventName - Name of the event to track
 * @param {Object} [properties={}] - Additional event properties
 */
export const trackEvent = (eventName, properties = {}) => {
  try {
    if (typeof window !== 'undefined' && window.datafast) {
      window.datafast(eventName, {
        timestamp: new Date().toISOString(),
        ...properties,
      });
    }
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

/**
 * Tracks a page view
 * @param {string} pageName - Name of the page
 * @param {Object} [properties={}] - Additional properties
 */
export const trackPageView = (pageName, properties = {}) => {
  trackEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
    page: pageName,
    url: typeof window !== 'undefined' ? window.location.href : '',
    ...properties,
  });
};

/**
 * Tracks checkout initiation
 * @param {Object} params - Checkout parameters
 * @param {string} params.plan - Plan name (pro, team)
 * @param {string} params.interval - Billing interval (monthly, yearly)
 * @param {string} [params.email] - User email
 * @param {string} [params.name] - User name
 */
export const trackInitiateCheckout = ({ plan, interval, email, name }) => {
  trackEvent(ANALYTICS_EVENTS.INITIATE_CHECKOUT, {
    product_id: `marksyncr_${plan}_${interval}`,
    plan,
    interval,
    email,
    name,
  });
};

/**
 * Tracks successful checkout completion
 * @param {Object} params - Checkout completion parameters
 */
export const trackCheckoutComplete = ({ plan, interval, amount, currency = 'USD' }) => {
  trackEvent(ANALYTICS_EVENTS.CHECKOUT_COMPLETE, {
    product_id: `marksyncr_${plan}_${interval}`,
    plan,
    interval,
    amount,
    currency,
  });
};

/**
 * Tracks user sign up
 * @param {Object} params - Sign up parameters
 */
export const trackSignUp = ({ method = 'email', plan = 'free' }) => {
  trackEvent(ANALYTICS_EVENTS.SIGN_UP, {
    method,
    plan,
  });
};

/**
 * Tracks user sign in
 * @param {Object} params - Sign in parameters
 */
export const trackSignIn = ({ method = 'email' }) => {
  trackEvent(ANALYTICS_EVENTS.SIGN_IN, {
    method,
  });
};

/**
 * Tracks sync source connection
 * @param {Object} params - Source connection parameters
 */
export const trackSourceConnected = ({ sourceType, isFirstSource = false }) => {
  trackEvent(ANALYTICS_EVENTS.SOURCE_CONNECTED, {
    source_type: sourceType,
    is_first_source: isFirstSource,
  });
};

/**
 * Tracks sync completion
 * @param {Object} params - Sync completion parameters
 */
export const trackSyncCompleted = ({ sourceType, bookmarkCount, duration, success = true }) => {
  trackEvent(success ? ANALYTICS_EVENTS.SYNC_COMPLETED : ANALYTICS_EVENTS.SYNC_FAILED, {
    source_type: sourceType,
    bookmark_count: bookmarkCount,
    duration_ms: duration,
    success,
  });
};

/**
 * Tracks bookmark import
 * @param {Object} params - Import parameters
 */
export const trackBookmarksImported = ({ format, count, source }) => {
  trackEvent(ANALYTICS_EVENTS.BOOKMARKS_IMPORTED, {
    format,
    count,
    source,
  });
};

/**
 * Tracks bookmark export
 * @param {Object} params - Export parameters
 */
export const trackBookmarksExported = ({ format, count }) => {
  trackEvent(ANALYTICS_EVENTS.BOOKMARKS_EXPORTED, {
    format,
    count,
  });
};

/**
 * Tracks Pro feature usage
 * @param {string} feature - Feature name
 * @param {Object} [properties={}] - Additional properties
 */
export const trackProFeatureUsed = (feature, properties = {}) => {
  trackEvent(`pro_feature_${feature}`, {
    feature,
    ...properties,
  });
};

/**
 * Tracks upgrade button click
 * @param {Object} params - Upgrade click parameters
 */
export const trackUpgradeClicked = ({ location, currentPlan = 'free', targetPlan = 'pro' }) => {
  trackEvent(ANALYTICS_EVENTS.UPGRADE_CLICKED, {
    location,
    current_plan: currentPlan,
    target_plan: targetPlan,
  });
};

/**
 * Tracks search performed
 * @param {Object} params - Search parameters
 */
export const trackSearchPerformed = ({ query, resultCount, hasFilters = false }) => {
  trackEvent(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
    query_length: query?.length || 0,
    result_count: resultCount,
    has_filters: hasFilters,
  });
};

/**
 * Tracks duplicate detection
 * @param {Object} params - Duplicate detection parameters
 */
export const trackDuplicatesFound = ({ count, totalBookmarks }) => {
  trackEvent(ANALYTICS_EVENTS.DUPLICATES_FOUND, {
    duplicate_count: count,
    total_bookmarks: totalBookmarks,
    duplicate_percentage: totalBookmarks > 0 ? (count / totalBookmarks) * 100 : 0,
  });
};

/**
 * Tracks link health check
 * @param {Object} params - Link check parameters
 */
export const trackLinkCheckCompleted = ({ totalChecked, brokenCount, redirectCount }) => {
  trackEvent(ANALYTICS_EVENTS.LINK_CHECK_COMPLETED, {
    total_checked: totalChecked,
    broken_count: brokenCount,
    redirect_count: redirectCount,
    health_percentage: totalChecked > 0 ? ((totalChecked - brokenCount) / totalChecked) * 100 : 100,
  });
};

/**
 * Tracks scheduled sync configuration
 * @param {Object} params - Schedule configuration parameters
 */
export const trackScheduleConfigured = ({ sourceType, intervalMinutes, enabled }) => {
  trackEvent(ANALYTICS_EVENTS.SCHEDULE_CONFIGURED, {
    source_type: sourceType,
    interval_minutes: intervalMinutes,
    enabled,
  });
};

/**
 * Tracks error occurrence
 * @param {Object} params - Error parameters
 */
export const trackError = ({ errorType, errorMessage, context }) => {
  trackEvent(ANALYTICS_EVENTS.ERROR_OCCURRED, {
    error_type: errorType,
    error_message: errorMessage,
    context,
  });
};

/**
 * Identifies a user for analytics
 * @param {Object} user - User object
 */
export const identifyUser = (user) => {
  try {
    if (typeof window !== 'undefined' && window.datafast) {
      window.datafast('identify', {
        user_id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name,
        plan: user.subscription?.plan || 'free',
        created_at: user.created_at,
      });
    }
  } catch (error) {
    console.error('Analytics identify error:', error);
  }
};

export default {
  ANALYTICS_EVENTS,
  trackEvent,
  trackPageView,
  trackInitiateCheckout,
  trackCheckoutComplete,
  trackSignUp,
  trackSignIn,
  trackSourceConnected,
  trackSyncCompleted,
  trackBookmarksImported,
  trackBookmarksExported,
  trackProFeatureUsed,
  trackUpgradeClicked,
  trackSearchPerformed,
  trackDuplicatesFound,
  trackLinkCheckCompleted,
  trackScheduleConfigured,
  trackError,
  identifyUser,
};
