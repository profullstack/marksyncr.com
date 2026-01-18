/**
 * @fileoverview Link Health Scanner component for checking bookmark URLs
 * Pro feature: Scan bookmarks for broken links, redirects, and timeouts
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * Link status constants
 */
const LINK_STATUS = {
  VALID: 'valid',
  BROKEN: 'broken',
  REDIRECT: 'redirect',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

/**
 * Status badge component
 */
export function StatusBadge({ status, className = '' }) {
  const statusConfig = {
    [LINK_STATUS.VALID]: {
      label: 'Valid',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-800 dark:text-green-400',
      icon: '✓',
    },
    [LINK_STATUS.BROKEN]: {
      label: 'Broken',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-800 dark:text-red-400',
      icon: '✗',
    },
    [LINK_STATUS.REDIRECT]: {
      label: 'Redirect',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      textColor: 'text-yellow-800 dark:text-yellow-400',
      icon: '→',
    },
    [LINK_STATUS.TIMEOUT]: {
      label: 'Timeout',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
      textColor: 'text-orange-800 dark:text-orange-400',
      icon: '⏱',
    },
    [LINK_STATUS.UNKNOWN]: {
      label: 'Unknown',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
      textColor: 'text-gray-800 dark:text-gray-400',
      icon: '?',
    },
  };

  const config = statusConfig[status] || statusConfig[LINK_STATUS.UNKNOWN];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
                 ${config.bgColor} ${config.textColor} ${className}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Scan progress component
 */
export function ScanProgress({ completed, total, currentUrl, className = '' }) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Scanning bookmarks...</span>
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {completed} / {total}
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {currentUrl && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 truncate">
          Checking: {currentUrl}
        </p>
      )}
    </div>
  );
}

/**
 * Scan summary component
 */
export function ScanSummary({ results, className = '' }) {
  const summary = useMemo(() => {
    const stats = {
      total: results.length,
      valid: 0,
      broken: 0,
      redirect: 0,
      timeout: 0,
      unknown: 0,
    };

    results.forEach((r) => {
      switch (r.status) {
        case LINK_STATUS.VALID:
          stats.valid++;
          break;
        case LINK_STATUS.BROKEN:
          stats.broken++;
          break;
        case LINK_STATUS.REDIRECT:
          stats.redirect++;
          break;
        case LINK_STATUS.TIMEOUT:
          stats.timeout++;
          break;
        default:
          stats.unknown++;
      }
    });

    return stats;
  }, [results]);

  return (
    <div className={`grid grid-cols-5 gap-2 ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-center border border-gray-200 dark:border-gray-700">
        <div className="text-lg font-bold text-gray-900 dark:text-white">{summary.total}</div>
        <div className="text-xs text-gray-500">Total</div>
      </div>
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center border border-green-200 dark:border-green-800">
        <div className="text-lg font-bold text-green-600">{summary.valid}</div>
        <div className="text-xs text-green-600">Valid</div>
      </div>
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center border border-red-200 dark:border-red-800">
        <div className="text-lg font-bold text-red-600">{summary.broken}</div>
        <div className="text-xs text-red-600">Broken</div>
      </div>
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 text-center border border-yellow-200 dark:border-yellow-800">
        <div className="text-lg font-bold text-yellow-600">{summary.redirect}</div>
        <div className="text-xs text-yellow-600">Redirect</div>
      </div>
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 text-center border border-orange-200 dark:border-orange-800">
        <div className="text-lg font-bold text-orange-600">{summary.timeout}</div>
        <div className="text-xs text-orange-600">Timeout</div>
      </div>
    </div>
  );
}

/**
 * Link result item component
 */
export function LinkResultItem({ result, onDelete, onUpdate, className = '' }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className}`}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <StatusBadge status={result.status} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {result.title || result.url}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.url}</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="mt-2 space-y-2 text-xs">
            {result.statusCode && (
              <div className="flex justify-between">
                <span className="text-gray-500">Status Code:</span>
                <span className="font-mono text-gray-900 dark:text-white">{result.statusCode}</span>
              </div>
            )}
            {result.redirectUrl && (
              <div className="flex flex-col gap-1">
                <span className="text-gray-500">Redirects to:</span>
                <a
                  href={result.redirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate"
                >
                  {result.redirectUrl}
                </a>
              </div>
            )}
            {result.errorMessage && (
              <div className="flex flex-col gap-1">
                <span className="text-gray-500">Error:</span>
                <span className="text-red-600">{result.errorMessage}</span>
              </div>
            )}
            {result.checkedAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Checked:</span>
                <span className="text-gray-900 dark:text-white">
                  {new Date(result.checkedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            {result.status === LINK_STATUS.REDIRECT && result.redirectUrl && (
              <button
                onClick={() => onUpdate(result.bookmarkId, result.redirectUrl)}
                className="flex-1 px-2 py-1.5 text-xs font-medium text-blue-600 
                           bg-blue-50 dark:bg-blue-900/20 rounded hover:bg-blue-100"
              >
                Update URL
              </button>
            )}
            <button
              onClick={() => onDelete(result.bookmarkId)}
              className="flex-1 px-2 py-1.5 text-xs font-medium text-red-600 
                         bg-red-50 dark:bg-red-900/20 rounded hover:bg-red-100"
            >
              Delete Bookmark
            </button>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 
                         bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 text-center"
            >
              Open Link
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Filter tabs component
 */
export function FilterTabs({ activeFilter, onFilterChange, counts, className = '' }) {
  const filters = [
    { key: 'all', label: 'All', count: counts.total },
    { key: 'broken', label: 'Broken', count: counts.broken },
    { key: 'redirect', label: 'Redirects', count: counts.redirect },
    { key: 'timeout', label: 'Timeouts', count: counts.timeout },
  ];

  return (
    <div className={`flex gap-1 ${className}`}>
      {filters.map((filter) => (
        <button
          key={filter.key}
          onClick={() => onFilterChange(filter.key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                     ${
                       activeFilter === filter.key
                         ? 'bg-blue-600 text-white'
                         : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                     }`}
        >
          {filter.label} ({filter.count})
        </button>
      ))}
    </div>
  );
}

/**
 * Main Link Health Scanner component
 */
export function LinkHealthScanner({
  bookmarks,
  onScan,
  onDeleteBookmark,
  onUpdateBookmark,
  isPro = false,
  onUpgradeClick,
  className = '',
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ completed: 0, total: 0, currentUrl: '' });
  const [results, setResults] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [lastScanDate, setLastScanDate] = useState(null);

  // Calculate counts for filters
  const counts = useMemo(() => {
    const stats = {
      total: results.length,
      broken: 0,
      redirect: 0,
      timeout: 0,
    };

    results.forEach((r) => {
      if (r.status === LINK_STATUS.BROKEN) stats.broken++;
      if (r.status === LINK_STATUS.REDIRECT) stats.redirect++;
      if (r.status === LINK_STATUS.TIMEOUT) stats.timeout++;
    });

    return stats;
  }, [results]);

  // Filter results based on active filter
  const filteredResults = useMemo(() => {
    if (activeFilter === 'all') return results;
    if (activeFilter === 'broken') return results.filter((r) => r.status === LINK_STATUS.BROKEN);
    if (activeFilter === 'redirect')
      return results.filter((r) => r.status === LINK_STATUS.REDIRECT);
    if (activeFilter === 'timeout') return results.filter((r) => r.status === LINK_STATUS.TIMEOUT);
    return results;
  }, [results, activeFilter]);

  const handleStartScan = useCallback(async () => {
    setIsScanning(true);
    setResults([]);
    setScanProgress({ completed: 0, total: bookmarks.length, currentUrl: '' });

    try {
      const scanResults = await onScan(bookmarks, {
        onProgress: ({ completed, total, current }) => {
          setScanProgress({
            completed,
            total,
            currentUrl: current?.url || '',
          });
        },
      });

      setResults(scanResults);
      setLastScanDate(new Date());
    } catch (error) {
      console.error('Scan failed:', error);
    } finally {
      setIsScanning(false);
    }
  }, [bookmarks, onScan]);

  const handleDelete = useCallback(
    (bookmarkId) => {
      if (confirm('Are you sure you want to delete this bookmark?')) {
        onDeleteBookmark(bookmarkId);
        setResults((prev) => prev.filter((r) => r.bookmarkId !== bookmarkId));
      }
    },
    [onDeleteBookmark]
  );

  const handleUpdate = useCallback(
    (bookmarkId, newUrl) => {
      onUpdateBookmark(bookmarkId, { url: newUrl });
      setResults((prev) =>
        prev.map((r) =>
          r.bookmarkId === bookmarkId
            ? { ...r, url: newUrl, status: LINK_STATUS.UNKNOWN, redirectUrl: null }
            : r
        )
      );
    },
    [onUpdateBookmark]
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
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                Upgrade to Pro for Link Health Scanning
              </h4>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Automatically scan your bookmarks for broken links, redirects, and timeouts. Keep
                your bookmark collection healthy and up-to-date.
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Link Health Scanner</h3>
          {lastScanDate && (
            <p className="text-xs text-gray-500">Last scan: {lastScanDate.toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={handleStartScan}
          disabled={isScanning}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                     hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed
                     flex items-center gap-2"
        >
          {isScanning ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Scanning...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              Scan Links
            </>
          )}
        </button>
      </div>

      {/* Progress */}
      {isScanning && (
        <ScanProgress
          completed={scanProgress.completed}
          total={scanProgress.total}
          currentUrl={scanProgress.currentUrl}
        />
      )}

      {/* Results */}
      {!isScanning && results.length > 0 && (
        <>
          <ScanSummary results={results} />

          <FilterTabs
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            counts={counts}
          />

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredResults.length === 0 ? (
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
                  No issues found in this category!
                </p>
              </div>
            ) : (
              filteredResults.map((result) => (
                <LinkResultItem
                  key={result.bookmarkId}
                  result={result}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!isScanning && results.length === 0 && (
        <div className="text-center py-8 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Click &quot;Scan Links&quot; to check your bookmarks for broken links
          </p>
          <p className="text-xs text-gray-400">{bookmarks.length} bookmarks will be scanned</p>
        </div>
      )}
    </div>
  );
}

export default LinkHealthScanner;
