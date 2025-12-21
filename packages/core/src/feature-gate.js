/**
 * @fileoverview Feature gating infrastructure for Pro features
 * Checks user subscription status and gates access to premium features
 */

/**
 * @typedef {'free' | 'pro' | 'team'} SubscriptionPlan
 */

/**
 * @typedef {'active' | 'canceled' | 'past_due' | 'trialing'} SubscriptionStatus
 */

/**
 * @typedef {Object} Subscription
 * @property {SubscriptionPlan} plan
 * @property {SubscriptionStatus} status
 * @property {string} [currentPeriodEnd]
 */

/**
 * Feature definitions with their required plans
 * @type {Record<string, SubscriptionPlan[]>}
 */
export const FEATURE_REQUIREMENTS = {
  // Tags & Notes
  tags: ['pro', 'team'],
  notes: ['pro', 'team'],

  // Search & Organization
  smartSearch: ['pro', 'team'],
  searchFilters: ['pro', 'team'],
  duplicateDetection: ['pro', 'team'],

  // Link Health
  brokenLinkChecker: ['pro', 'team'],

  // Analytics
  analytics: ['pro', 'team'],
  visitTracking: ['pro', 'team'],

  // Import/Export
  importAllFormats: ['pro', 'team'],
  exportAllFormats: ['pro', 'team'],

  // Sync
  scheduledSync: ['pro', 'team'],
  cloudStorage: ['pro', 'team'],

  // Version History
  versionHistory30Days: ['pro', 'team'],
  versionHistory1Year: ['team'],

  // Team Features
  sharedFolders: ['team'],
  teamManagement: ['team'],
  sso: ['team'],

  // Browser Support
  safariSupport: ['pro', 'team'],

  // Support
  prioritySupport: ['pro', 'team'],
  dedicatedSupport: ['team'],
};

/**
 * Features available on the free plan
 * @type {string[]}
 */
export const FREE_FEATURES = [
  'basicSearch',
  'manualSync',
  'githubSync',
  'dropboxSync',
  'googleDriveSync',
  'localFileSync',
  'chromeSupport',
  'firefoxSupport',
  'importHtml',
  'exportHtml',
  'conflictResolution',
  'twoWaySync',
];

/**
 * Checks if a subscription is active (can access paid features)
 * @param {Subscription} subscription
 * @returns {boolean}
 */
export const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  return ['active', 'trialing'].includes(subscription.status);
};

/**
 * Checks if a user has access to a specific feature
 * @param {string} featureName - Name of the feature to check
 * @param {Subscription} subscription - User's subscription
 * @returns {boolean}
 */
export const hasFeatureAccess = (featureName, subscription) => {
  // Free features are always available
  if (FREE_FEATURES.includes(featureName)) {
    return true;
  }

  // Check if feature exists in requirements
  const requiredPlans = FEATURE_REQUIREMENTS[featureName];
  if (!requiredPlans) {
    // Unknown feature - default to free access
    console.warn(`Unknown feature: ${featureName}`);
    return true;
  }

  // Check subscription
  if (!subscription || !isSubscriptionActive(subscription)) {
    return false;
  }

  return requiredPlans.includes(subscription.plan);
};

/**
 * Gets all features available for a subscription plan
 * @param {SubscriptionPlan} plan
 * @returns {string[]}
 */
export const getFeaturesForPlan = (plan) => {
  const features = [...FREE_FEATURES];

  if (plan === 'free') {
    return features;
  }

  for (const [feature, requiredPlans] of Object.entries(FEATURE_REQUIREMENTS)) {
    if (requiredPlans.includes(plan)) {
      features.push(feature);
    }
  }

  return features;
};

/**
 * Gets the minimum plan required for a feature
 * @param {string} featureName
 * @returns {SubscriptionPlan}
 */
export const getMinimumPlanForFeature = (featureName) => {
  if (FREE_FEATURES.includes(featureName)) {
    return 'free';
  }

  const requiredPlans = FEATURE_REQUIREMENTS[featureName];
  if (!requiredPlans) {
    return 'free';
  }

  // Return the lowest tier plan that has access
  if (requiredPlans.includes('pro')) {
    return 'pro';
  }
  return 'team';
};

/**
 * Creates a feature gate checker bound to a subscription
 * @param {Subscription} subscription
 * @returns {(featureName: string) => boolean}
 */
export const createFeatureGate = (subscription) => {
  return (featureName) => hasFeatureAccess(featureName, subscription);
};

/**
 * Checks multiple features at once
 * @param {string[]} featureNames
 * @param {Subscription} subscription
 * @returns {Record<string, boolean>}
 */
export const checkMultipleFeatures = (featureNames, subscription) => {
  const result = {};
  for (const feature of featureNames) {
    result[feature] = hasFeatureAccess(feature, subscription);
  }
  return result;
};

/**
 * Gets upgrade suggestions for locked features
 * @param {string[]} lockedFeatures
 * @returns {{ plan: SubscriptionPlan, features: string[] }[]}
 */
export const getUpgradeSuggestions = (lockedFeatures) => {
  const proFeatures = [];
  const teamFeatures = [];

  for (const feature of lockedFeatures) {
    const minPlan = getMinimumPlanForFeature(feature);
    if (minPlan === 'pro') {
      proFeatures.push(feature);
    } else if (minPlan === 'team') {
      teamFeatures.push(feature);
    }
  }

  const suggestions = [];

  if (proFeatures.length > 0) {
    suggestions.push({
      plan: 'pro',
      features: proFeatures,
    });
  }

  if (teamFeatures.length > 0) {
    suggestions.push({
      plan: 'team',
      features: teamFeatures,
    });
  }

  return suggestions;
};

/**
 * Version history retention limits by plan
 * @type {Record<SubscriptionPlan, number>}
 */
export const VERSION_HISTORY_LIMITS = {
  free: 5,
  pro: 30,
  team: 365,
};

/**
 * Gets the version history retention limit for a plan
 * @param {SubscriptionPlan} plan
 * @returns {number} - Number of versions to retain
 */
export const getVersionHistoryLimit = (plan) => {
  return VERSION_HISTORY_LIMITS[plan] ?? VERSION_HISTORY_LIMITS.free;
};

/**
 * Sync interval limits by plan (in minutes)
 * @type {Record<SubscriptionPlan, { min: number, options: number[] }>}
 */
export const SYNC_INTERVAL_LIMITS = {
  free: {
    min: 0, // Manual only
    options: [],
  },
  pro: {
    min: 5,
    options: [5, 15, 30, 60, 360, 1440], // 5min, 15min, 30min, 1hr, 6hr, daily
  },
  team: {
    min: 5,
    options: [5, 15, 30, 60, 360, 1440],
  },
};

/**
 * Gets available sync intervals for a plan
 * @param {SubscriptionPlan} plan
 * @returns {number[]} - Array of available intervals in minutes
 */
export const getSyncIntervalOptions = (plan) => {
  return SYNC_INTERVAL_LIMITS[plan]?.options ?? [];
};

/**
 * Checks if scheduled sync is available for a plan
 * @param {SubscriptionPlan} plan
 * @returns {boolean}
 */
export const canUseScheduledSync = (plan) => {
  return SYNC_INTERVAL_LIMITS[plan]?.options.length > 0;
};

/**
 * Feature display names for UI
 * @type {Record<string, string>}
 */
export const FEATURE_DISPLAY_NAMES = {
  tags: 'Bookmark Tags',
  notes: 'Bookmark Notes',
  smartSearch: 'Smart Search',
  searchFilters: 'Search Filters',
  duplicateDetection: 'Duplicate Detection',
  brokenLinkChecker: 'Broken Link Checker',
  analytics: 'Bookmark Analytics',
  visitTracking: 'Visit Tracking',
  importAllFormats: 'Import All Formats',
  exportAllFormats: 'Export All Formats',
  scheduledSync: 'Scheduled Sync',
  cloudStorage: 'MarkSyncr Cloud',
  versionHistory30Days: '30-Day Version History',
  versionHistory1Year: '1-Year Version History',
  sharedFolders: 'Shared Folders',
  teamManagement: 'Team Management',
  sso: 'SSO Integration',
  safariSupport: 'Safari Support',
  prioritySupport: 'Priority Support',
  dedicatedSupport: 'Dedicated Support',
};

/**
 * Gets the display name for a feature
 * @param {string} featureName
 * @returns {string}
 */
export const getFeatureDisplayName = (featureName) => {
  return FEATURE_DISPLAY_NAMES[featureName] ?? featureName;
};
