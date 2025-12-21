/**
 * @fileoverview User and subscription type definitions
 */

/**
 * @typedef {'free' | 'pro' | 'team'} SubscriptionPlan
 */

/**
 * @typedef {'active' | 'canceled' | 'past_due' | 'trialing'} SubscriptionStatus
 */

/**
 * @typedef {Object} User
 * @property {string} id - User UUID
 * @property {string} email - User email
 * @property {string} [name] - Display name
 * @property {string} [avatarUrl] - Profile picture URL
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} lastLoginAt - ISO 8601 timestamp
 * @property {boolean} emailVerified - Whether email is verified
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id - Subscription UUID
 * @property {string} userId - User UUID
 * @property {SubscriptionPlan} plan - Current plan
 * @property {SubscriptionStatus} status - Subscription status
 * @property {string} [stripeCustomerId] - Stripe customer ID
 * @property {string} [stripeSubscriptionId] - Stripe subscription ID
 * @property {string} currentPeriodStart - ISO 8601 timestamp
 * @property {string} currentPeriodEnd - ISO 8601 timestamp
 * @property {boolean} cancelAtPeriodEnd - Whether subscription will cancel at period end
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} UserWithSubscription
 * @property {User} user
 * @property {Subscription | null} subscription
 */

/**
 * @typedef {Object} Device
 * @property {string} id - Device UUID
 * @property {string} userId - User UUID
 * @property {string} name - Device name
 * @property {string} browser - Browser name
 * @property {string} [os] - Operating system
 * @property {string} lastSeenAt - ISO 8601 timestamp
 * @property {string} createdAt - ISO 8601 timestamp
 */

// Subscription plan constants
export const SUBSCRIPTION_PLAN = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
};

// Subscription status constants
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
  PAST_DUE: 'past_due',
  TRIALING: 'trialing',
};

/**
 * Plan features and limits
 * @type {Record<SubscriptionPlan, Object>}
 */
export const PLAN_FEATURES = {
  [SUBSCRIPTION_PLAN.FREE]: {
    name: 'Free',
    price: 0,
    sources: ['local', 'github', 'dropbox', 'google-drive'],
    cloudStorage: false,
    maxDevices: 2,
    syncInterval: 30, // minutes
    support: 'community',
  },
  [SUBSCRIPTION_PLAN.PRO]: {
    name: 'Pro',
    price: 5,
    sources: ['local', 'github', 'dropbox', 'google-drive', 'supabase-cloud'],
    cloudStorage: true,
    maxDevices: 10,
    syncInterval: 5, // minutes
    support: 'email',
  },
  [SUBSCRIPTION_PLAN.TEAM]: {
    name: 'Team',
    price: 15,
    sources: ['local', 'github', 'dropbox', 'google-drive', 'supabase-cloud'],
    cloudStorage: true,
    maxDevices: -1, // unlimited
    syncInterval: 1, // minutes
    support: 'priority',
  },
};

/**
 * Checks if a user has an active paid subscription
 * @param {Subscription | null} subscription
 * @returns {boolean}
 */
export const hasActiveSubscription = (subscription) => {
  if (!subscription) return false;
  return (
    subscription.status === SUBSCRIPTION_STATUS.ACTIVE ||
    subscription.status === SUBSCRIPTION_STATUS.TRIALING
  );
};

/**
 * Checks if a user can use cloud storage
 * @param {Subscription | null} subscription
 * @returns {boolean}
 */
export const canUseCloudStorage = (subscription) => {
  if (!hasActiveSubscription(subscription)) return false;
  return PLAN_FEATURES[subscription.plan]?.cloudStorage ?? false;
};

/**
 * Gets the sync interval for a subscription
 * @param {Subscription | null} subscription
 * @returns {number} Sync interval in minutes
 */
export const getSyncInterval = (subscription) => {
  if (!hasActiveSubscription(subscription)) {
    return PLAN_FEATURES[SUBSCRIPTION_PLAN.FREE].syncInterval;
  }
  return PLAN_FEATURES[subscription.plan]?.syncInterval ?? 30;
};

/**
 * Creates a new user object
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.email
 * @param {string} [params.name]
 * @returns {User}
 */
export const createUser = ({ id, email, name }) => ({
  id,
  email,
  name: name ?? null,
  avatarUrl: null,
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
  emailVerified: false,
});
