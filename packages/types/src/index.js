/**
 * @fileoverview Main entry point for @marksyncr/types package
 * Re-exports all type definitions and utilities
 */

// Bookmark types and utilities
export {
  createEmptyBookmarkFile,
  createBookmarkItem,
  createFolderItem,
  createSeparatorItem,
  BOOKMARK_TYPES,
  ROOT_FOLDER_IDS,
} from './bookmark.js';

// Sync types and utilities
export {
  SYNC_STATUS,
  CHANGE_TYPE,
  CONFLICT_RESOLUTION,
  createSyncState,
  createSyncResult,
  createErrorSyncResult,
} from './sync.js';

// Source types and utilities
export {
  SOURCE_TYPE,
  SOURCE_TIER,
  SOURCE_INFO,
  createSourceConfig,
  sourceRequiresAuth,
  isFreeTierSource,
  getFreeTierSources,
  getPaidTierSources,
} from './source.js';

// User types and utilities
export {
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_STATUS,
  PLAN_FEATURES,
  hasActiveSubscription,
  canUseCloudStorage,
  getSyncInterval,
  createUser,
} from './user.js';
