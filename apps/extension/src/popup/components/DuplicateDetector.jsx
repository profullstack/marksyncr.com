/**
 * @fileoverview Duplicate Detector component for finding and managing duplicate bookmarks
 * Pro feature: Find and merge duplicate bookmarks
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

/**
 * Normalize URL for comparison
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
const normalizeUrl = (url) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // Remove www prefix
    let hostname = parsed.hostname.replace(/^www\./, '');
    // Remove trailing slash
    let pathname = parsed.pathname.replace(/\/$/, '');
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'fbclid',
      'gclid',
    ];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    // Reconstruct URL
    return `${parsed.protocol}//${hostname}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};

/**
 * Calculate string similarity using Dice coefficient
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  const bigrams1 = new Set();
  const bigrams2 = new Set();

  for (let i = 0; i < s1.length - 1; i++) {
    bigrams1.add(s1.slice(i, i + 2));
  }
  for (let i = 0; i < s2.length - 1; i++) {
    bigrams2.add(s2.slice(i, i + 2));
  }

  let intersection = 0;
  bigrams1.forEach((bigram) => {
    if (bigrams2.has(bigram)) intersection++;
  });

  return (2 * intersection) / (bigrams1.size + bigrams2.size);
};

/**
 * Find duplicate bookmarks
 * @param {Array} bookmarks - Array of bookmarks
 * @param {Object} options - Detection options
 * @returns {Array} Groups of duplicate bookmarks
 */
const findDuplicates = (bookmarks, options = {}) => {
  const { urlThreshold = 1.0, titleThreshold = 0.8, checkTitles = true } = options;

  const duplicateGroups = [];
  const processed = new Set();

  // Group by normalized URL
  const urlMap = new Map();
  bookmarks.forEach((bookmark) => {
    if (!bookmark.url) return;
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, []);
    }
    urlMap.get(normalizedUrl).push(bookmark);
  });

  // Find exact URL duplicates
  urlMap.forEach((group, url) => {
    if (group.length > 1) {
      duplicateGroups.push({
        type: 'exact_url',
        reason: 'Same URL',
        bookmarks: group,
        normalizedUrl: url,
      });
      group.forEach((b) => processed.add(b.id));
    }
  });

  // Find similar titles (if enabled)
  if (checkTitles) {
    const unprocessed = bookmarks.filter((b) => !processed.has(b.id));

    for (let i = 0; i < unprocessed.length; i++) {
      const group = [unprocessed[i]];

      for (let j = i + 1; j < unprocessed.length; j++) {
        if (processed.has(unprocessed[j].id)) continue;

        const similarity = calculateSimilarity(unprocessed[i].title, unprocessed[j].title);
        if (similarity >= titleThreshold) {
          group.push(unprocessed[j]);
          processed.add(unprocessed[j].id);
        }
      }

      if (group.length > 1) {
        processed.add(unprocessed[i].id);
        duplicateGroups.push({
          type: 'similar_title',
          reason: 'Similar titles',
          bookmarks: group,
          similarity: calculateSimilarity(group[0].title, group[1].title),
        });
      }
    }
  }

  return duplicateGroups;
};

/**
 * Duplicate group card component
 */
export function DuplicateGroup({
  group,
  selectedBookmarks,
  onToggleSelect,
  onSelectAll,
  onMerge,
  onDelete,
  className = '',
}) {
  const allSelected = group.bookmarks.every((b) => selectedBookmarks.has(b.id));
  const someSelected = group.bookmarks.some((b) => selectedBookmarks.has(b.id));

  return (
    <div
      className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}
    >
      {/* Group Header */}
      <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => onSelectAll(group.bookmarks, !allSelected)}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {group.bookmarks.length} duplicates
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                       ${
                         group.type === 'exact_url'
                           ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                           : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                       }`}
          >
            {group.reason}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMerge(group)}
            disabled={!someSelected}
            className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 
                       disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Merge Selected
          </button>
          <button
            onClick={() => onDelete(group)}
            disabled={!someSelected}
            className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800
                       disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Delete Selected
          </button>
        </div>
      </div>

      {/* Bookmark List */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {group.bookmarks.map((bookmark, index) => (
          <div
            key={bookmark.id}
            className={`px-4 py-3 flex items-start gap-3 ${
              index === 0 ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={selectedBookmarks.has(bookmark.id)}
              onChange={() => onToggleSelect(bookmark.id)}
              className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <img
              src={`https://www.google.com/s2/favicons?domain=${bookmark.url}&sz=32`}
              alt=""
              className="w-4 h-4 mt-1 flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {bookmark.title}
                </h4>
                {index === 0 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    Keep
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{bookmark.url}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                {bookmark.parentPath && <span>📁 {bookmark.parentPath}</span>}
                {bookmark.dateAdded && (
                  <span>Added {new Date(bookmark.dateAdded).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Duplicate detection options panel
 */
export function DetectionOptions({ options, onChange, className = '' }) {
  return (
    <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-4 ${className}`}>
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Detection Options
      </h4>
      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={options.checkTitles}
            onChange={(e) => onChange({ ...options, checkTitles: e.target.checked })}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Find similar titles</span>
        </label>

        {options.checkTitles && (
          <div className="ml-6">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              Title similarity threshold: {Math.round(options.titleThreshold * 100)}%
            </label>
            <input
              type="range"
              min="50"
              max="100"
              value={options.titleThreshold * 100}
              onChange={(e) => onChange({ ...options, titleThreshold: e.target.value / 100 })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Summary statistics component
 */
export function DuplicateSummary({ groups, totalBookmarks, className = '' }) {
  const totalDuplicates = groups.reduce((sum, g) => sum + g.bookmarks.length - 1, 0);
  const exactUrlDuplicates = groups
    .filter((g) => g.type === 'exact_url')
    .reduce((sum, g) => sum + g.bookmarks.length - 1, 0);
  const similarTitleDuplicates = groups
    .filter((g) => g.type === 'similar_title')
    .reduce((sum, g) => sum + g.bookmarks.length - 1, 0);

  return (
    <div className={`grid grid-cols-3 gap-4 ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalDuplicates}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Total Duplicates</div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-red-600">{exactUrlDuplicates}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Exact URL</div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-yellow-600">{similarTitleDuplicates}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Similar Title</div>
      </div>
    </div>
  );
}

/**
 * Merge confirmation modal
 */
export function MergeModal({ group, onConfirm, onCancel, className = '' }) {
  const [keepIndex, setKeepIndex] = useState(0);
  const [mergeTags, setMergeTags] = useState(true);
  const [mergeNotes, setMergeNotes] = useState(true);

  const handleConfirm = () => {
    onConfirm({
      keepBookmark: group.bookmarks[keepIndex],
      deleteBookmarks: group.bookmarks.filter((_, i) => i !== keepIndex),
      mergeTags,
      mergeNotes,
    });
  };

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Merge Duplicates</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select which bookmark to keep and merge options
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Keep this bookmark:
            </label>
            <div className="mt-2 space-y-2">
              {group.bookmarks.map((bookmark, index) => (
                <label
                  key={bookmark.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer
                             ${
                               keepIndex === index
                                 ? 'bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                 : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                             }`}
                >
                  <input
                    type="radio"
                    name="keepBookmark"
                    checked={keepIndex === index}
                    onChange={() => setKeepIndex(index)}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {bookmark.title}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{bookmark.url}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Merge options:
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={mergeTags}
                onChange={(e) => setMergeTags(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Combine tags from all duplicates
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={mergeNotes}
                onChange={(e) => setMergeNotes(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Append notes from duplicates
              </span>
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 
                       hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 
                       hover:bg-blue-700 rounded-lg"
          >
            Merge {group.bookmarks.length - 1} Duplicates
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Duplicate Detector component
 */
export function DuplicateDetector({
  bookmarks,
  onMerge,
  onDelete,
  isPro = false,
  onUpgradeClick,
  className = '',
}) {
  const [options, setOptions] = useState({
    checkTitles: true,
    titleThreshold: 0.8,
  });
  const [selectedBookmarks, setSelectedBookmarks] = useState(new Set());
  const [mergeGroup, setMergeGroup] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Find duplicates
  const duplicateGroups = useMemo(() => {
    if (!isPro) return [];
    setIsScanning(true);
    const groups = findDuplicates(bookmarks, options);
    setIsScanning(false);
    return groups;
  }, [bookmarks, options, isPro]);

  const handleToggleSelect = useCallback((bookmarkId) => {
    setSelectedBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(bookmarkId)) {
        next.delete(bookmarkId);
      } else {
        next.add(bookmarkId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((groupBookmarks, select) => {
    setSelectedBookmarks((prev) => {
      const next = new Set(prev);
      groupBookmarks.forEach((b) => {
        if (select) {
          next.add(b.id);
        } else {
          next.delete(b.id);
        }
      });
      return next;
    });
  }, []);

  const handleMerge = useCallback((group) => {
    setMergeGroup(group);
  }, []);

  const handleConfirmMerge = useCallback(
    (mergeOptions) => {
      onMerge(mergeOptions);
      setMergeGroup(null);
      setSelectedBookmarks(new Set());
    },
    [onMerge]
  );

  const handleDelete = useCallback(
    (group) => {
      const toDelete = group.bookmarks.filter((b) => selectedBookmarks.has(b.id));
      if (toDelete.length > 0 && confirm(`Delete ${toDelete.length} bookmark(s)?`)) {
        onDelete(toDelete);
        setSelectedBookmarks(new Set());
      }
    },
    [selectedBookmarks, onDelete]
  );

  // Show upgrade prompt for non-Pro users
  if (!isPro) {
    return (
      <div className={`${className}`}>
        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                Upgrade to Pro for Duplicate Detection
              </h4>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Find and merge duplicate bookmarks automatically. Clean up your bookmark collection
                with smart detection.
              </p>
              <button
                onClick={onUpgradeClick}
                className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium 
                           text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary */}
      <DuplicateSummary groups={duplicateGroups} totalBookmarks={bookmarks.length} />

      {/* Options */}
      <DetectionOptions options={options} onChange={setOptions} />

      {/* Results */}
      {isScanning ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-gray-500">Scanning for duplicates...</span>
        </div>
      ) : duplicateGroups.length === 0 ? (
        <div className="text-center py-8">
          <svg
            className="mx-auto h-12 w-12 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            No duplicates found! Your bookmarks are clean.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Found {duplicateGroups.length} duplicate groups
            </h3>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {duplicateGroups.map((group, index) => (
              <DuplicateGroup
                key={index}
                group={group}
                selectedBookmarks={selectedBookmarks}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                onMerge={handleMerge}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeGroup && (
        <MergeModal
          group={mergeGroup}
          onConfirm={handleConfirmMerge}
          onCancel={() => setMergeGroup(null)}
        />
      )}
    </div>
  );
}

export default DuplicateDetector;
