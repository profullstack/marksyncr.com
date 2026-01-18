/**
 * @marksyncr/core
 *
 * Core sync logic and utilities for MarkSyncr
 */

// Hash utilities
export { sha256, generateBookmarkId, generateChecksum, generateDeviceId } from './hash-utils.js';

// Diff engine
export {
  CHANGE_TYPES,
  detectChanges,
  applyChanges,
  hasChanges,
  flattenBookmarks as flattenBookmarksForDiff,
  areBookmarksEqual,
  detectDeletions,
  findConflicts,
  getParentPath,
  summarizeChanges,
} from './diff-engine.js';

// Conflict resolver
export {
  resolveConflict,
  mergeBookmarks,
  mergeChildren,
  resolveDeleteModifyConflict,
  resolveAllConflicts,
  requiresManualResolution,
  createConflictSummary,
} from './conflict-resolver.js';

// Sync engine
export { SyncEngine, createSyncEngine } from './sync-engine.js';

// Bookmark parser
export {
  BROWSER_TYPES,
  detectBrowser,
  parseBrowserBookmarks,
  serializeToBrowserFormat,
  getBrowserRootIds,
  flattenBookmarks,
  findBookmarkById,
  findBookmarksByUrl,
  countBookmarks,
  validateBookmarkFile,
} from './bookmark-parser.js';

// Version history
export { VersionHistoryManager, createChangeSummary } from './version-history.js';

// Feature gating (Pro features)
export {
  FEATURE_REQUIREMENTS,
  FREE_FEATURES,
  isSubscriptionActive,
  hasFeatureAccess,
  getFeaturesForPlan,
  getMinimumPlanForFeature,
  createFeatureGate,
  checkMultipleFeatures,
  getUpgradeSuggestions,
  VERSION_HISTORY_LIMITS,
  getVersionHistoryLimit,
  SYNC_INTERVAL_LIMITS,
  getSyncIntervalOptions,
  canUseScheduledSync,
  FEATURE_DISPLAY_NAMES,
  getFeatureDisplayName,
} from './feature-gate.js';

// Smart search (Pro feature)
export {
  DEFAULT_FUSE_OPTIONS,
  createSearchEngine,
  searchBookmarks,
  filterByFolder,
  filterByTag,
  filterByDomain,
  filterByDateRange,
  applyFilters,
  searchAndFilter,
} from './smart-search.js';

// Duplicate detection (Pro feature)
export {
  normalizeUrl,
  calculateSimilarity,
  findDuplicatesByUrl,
  findDuplicatesByTitle,
  findSimilarBookmarks,
  findDuplicates,
  groupDuplicates,
  suggestMerge,
} from './duplicate-detector.js';

// Link checker (Pro feature)
export {
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
} from './link-checker.js';

// Import/Export (Pro feature)
export {
  IMPORT_FORMATS,
  EXPORT_FORMATS,
  parseNetscapeHtml,
  parsePocketExport,
  parseRaindropExport,
  parsePinboardJson,
  parseCsv,
  formatToNetscapeHtml,
  formatToJson,
  formatToCsv,
  formatToMarkdown,
  detectImportFormat,
  validateImportData,
  parseImportFile,
  exportBookmarks,
} from './import-export.js';

// Analytics (Pro feature)
export {
  calculateBookmarkStats,
  getTopDomains,
  getBookmarksByAge,
  getBookmarksByFolder,
  getTagDistribution,
  getGrowthTrend,
  getActivityHeatmap,
  generateInsights,
  calculateHealthScore,
} from './analytics.js';

// Scheduled Sync (Pro feature)
export {
  SYNC_INTERVALS,
  createSyncSchedule,
  validateSyncInterval,
  getNextSyncTime,
  shouldSync,
  formatSyncInterval,
  parseSyncInterval,
  calculateSyncStats,
  createSyncJob,
  SyncScheduler,
} from './scheduled-sync.js';
