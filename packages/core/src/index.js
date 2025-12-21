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
} from './diff-engine.js';

// Conflict resolver
export {
  RESOLUTION_STRATEGIES,
  detectConflicts,
  resolveConflict,
  resolveAllConflicts,
  createConflictResolver,
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
