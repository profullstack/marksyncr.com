/**
 * @marksyncr/core
 *
 * Core sync logic and utilities for MarkSyncr
 */

// Hash utilities
export {
  sha256,
  generateBookmarkId,
  generateChecksum,
  generateDeviceId,
} from './hash-utils.js';

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
export {
  VersionHistoryManager,
  createChangeSummary,
} from './version-history.js';
