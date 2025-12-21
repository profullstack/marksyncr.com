/**
 * @fileoverview Smart Search component for bookmark searching with filters
 * Pro feature: Advanced search with fuzzy matching and filters
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';

/**
 * Default Fuse.js options for bookmark search
 */
const DEFAULT_FUSE_OPTIONS = {
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'url', weight: 0.2 },
    { name: 'notes', weight: 0.2 },
    { name: 'tags.name', weight: 0.2 },
  ],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
};

/**
 * Extract unique domains from bookmarks
 * @param {Array} bookmarks - Flat array of bookmarks
 * @returns {Array} Unique domains
 */
const extractDomains = (bookmarks) => {
  const domains = new Set();
  bookmarks.forEach((bookmark) => {
    if (bookmark.url) {
      try {
        const url = new URL(bookmark.url);
        domains.add(url.hostname);
      } catch {
        // Invalid URL, skip
      }
    }
  });
  return Array.from(domains).sort();
};

/**
 * Extract unique folders from bookmarks
 * @param {Array} bookmarks - Flat array of bookmarks
 * @returns {Array} Unique folder paths
 */
const extractFolders = (bookmarks) => {
  const folders = new Set();
  bookmarks.forEach((bookmark) => {
    if (bookmark.parentPath) {
      folders.add(bookmark.parentPath);
    }
  });
  return Array.from(folders).sort();
};

/**
 * Extract unique tags from bookmarks
 * @param {Array} bookmarks - Flat array of bookmarks
 * @returns {Array} Unique tags
 */
const extractTags = (bookmarks) => {
  const tags = new Map();
  bookmarks.forEach((bookmark) => {
    if (bookmark.tags && Array.isArray(bookmark.tags)) {
      bookmark.tags.forEach((tag) => {
        if (!tags.has(tag.id)) {
          tags.set(tag.id, tag);
        }
      });
    }
  });
  return Array.from(tags.values()).sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Smart Search input with autocomplete
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search bookmarks...',
  className = '',
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg 
                   text-sm placeholder-gray-400 focus:outline-none focus:ring-2 
                   focus:ring-blue-500 focus:border-transparent
                   dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute inset-y-0 right-0 pr-3 flex items-center"
        >
          <svg
            className="h-4 w-4 text-gray-400 hover:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Filter dropdown component
 */
export function FilterDropdown({
  label,
  value,
  options,
  onChange,
  placeholder = 'All',
  className = '',
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   dark:bg-gray-700 dark:border-gray-600 dark:text-white"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Date range filter component
 */
export function DateRangeFilter({ startDate, endDate, onStartChange, onEndChange, className = '' }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Date Range</label>
      <div className="flex gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="block w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
        <span className="text-gray-400 self-center">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="block w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>
    </div>
  );
}

/**
 * Search filters panel
 */
export function SearchFilters({
  folders,
  tags,
  domains,
  filters,
  onFilterChange,
  onClearFilters,
  className = '',
}) {
  const hasActiveFilters =
    filters.folder || filters.tag || filters.domain || filters.startDate || filters.endDate;

  return (
    <div className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</h4>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FilterDropdown
          label="Folder"
          value={filters.folder}
          options={folders.map((f) => ({ value: f, label: f }))}
          onChange={(value) => onFilterChange('folder', value)}
        />

        <FilterDropdown
          label="Tag"
          value={filters.tag}
          options={tags.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(value) => onFilterChange('tag', value)}
        />

        <FilterDropdown
          label="Domain"
          value={filters.domain}
          options={domains.map((d) => ({ value: d, label: d }))}
          onChange={(value) => onFilterChange('domain', value)}
          className="col-span-2"
        />

        <DateRangeFilter
          startDate={filters.startDate}
          endDate={filters.endDate}
          onStartChange={(value) => onFilterChange('startDate', value)}
          onEndChange={(value) => onFilterChange('endDate', value)}
          className="col-span-2"
        />
      </div>
    </div>
  );
}

/**
 * Search result item component
 */
export function SearchResultItem({ bookmark, matches, onClick, className = '' }) {
  const highlightMatches = (text, matchIndices) => {
    if (!matchIndices || matchIndices.length === 0) {
      return text;
    }

    const parts = [];
    let lastIndex = 0;

    matchIndices.forEach(([start, end]) => {
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }
      parts.push(
        <mark key={start} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
          {text.slice(start, end + 1)}
        </mark>
      );
      lastIndex = end + 1;
    });

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  const titleMatch = matches?.find((m) => m.key === 'title');
  const urlMatch = matches?.find((m) => m.key === 'url');

  return (
    <div
      onClick={() => onClick(bookmark)}
      className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer 
                  border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${className}`}
    >
      <div className="flex items-start gap-3">
        <img
          src={`https://www.google.com/s2/favicons?domain=${bookmark.url}&sz=32`}
          alt=""
          className="w-4 h-4 mt-1 flex-shrink-0"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {titleMatch ? highlightMatches(bookmark.title, titleMatch.indices) : bookmark.title}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {urlMatch ? highlightMatches(bookmark.url, urlMatch.indices) : bookmark.url}
          </p>
          {bookmark.tags && bookmark.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {bookmark.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {bookmark.tags.length > 3 && (
                <span className="text-xs text-gray-400">+{bookmark.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Search results list component
 */
export function SearchResults({
  results,
  isLoading,
  query,
  onResultClick,
  emptyMessage = 'No bookmarks found',
  className = '',
}) {
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (results.length === 0 && query) {
    return (
      <div className={`text-center py-8 ${className}`}>
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
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <div className={`divide-y divide-gray-100 dark:divide-gray-700 ${className}`}>
      {results.map((result) => (
        <SearchResultItem
          key={result.item?.id || result.id}
          bookmark={result.item || result}
          matches={result.matches}
          onClick={onResultClick}
        />
      ))}
    </div>
  );
}

/**
 * Main Smart Search component
 * Combines search input, filters, and results
 */
export function SmartSearch({
  bookmarks,
  onBookmarkClick,
  isPro = false,
  onUpgradeClick,
  className = '',
}) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    folder: '',
    tag: '',
    domain: '',
    startDate: '',
    endDate: '',
  });
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Extract filter options from bookmarks
  const folders = useMemo(() => extractFolders(bookmarks), [bookmarks]);
  const tags = useMemo(() => extractTags(bookmarks), [bookmarks]);
  const domains = useMemo(() => extractDomains(bookmarks), [bookmarks]);

  // Create Fuse instance
  const fuse = useMemo(() => new Fuse(bookmarks, DEFAULT_FUSE_OPTIONS), [bookmarks]);

  // Apply filters to results
  const applyFilters = useCallback(
    (items) => {
      return items.filter((item) => {
        const bookmark = item.item || item;

        // Folder filter
        if (filters.folder && bookmark.parentPath !== filters.folder) {
          return false;
        }

        // Tag filter
        if (filters.tag) {
          const hasTag = bookmark.tags?.some((t) => t.id === filters.tag);
          if (!hasTag) return false;
        }

        // Domain filter
        if (filters.domain) {
          try {
            const url = new URL(bookmark.url);
            if (url.hostname !== filters.domain) return false;
          } catch {
            return false;
          }
        }

        // Date range filter
        if (filters.startDate || filters.endDate) {
          const bookmarkDate = new Date(bookmark.dateAdded || bookmark.createdAt);
          if (filters.startDate && bookmarkDate < new Date(filters.startDate)) {
            return false;
          }
          if (filters.endDate) {
            const endDate = new Date(filters.endDate);
            endDate.setHours(23, 59, 59, 999);
            if (bookmarkDate > endDate) return false;
          }
        }

        return true;
      });
    },
    [filters]
  );

  // Perform search
  useEffect(() => {
    setIsSearching(true);

    const timer = setTimeout(() => {
      let searchResults;

      if (query.trim()) {
        // Fuzzy search with Fuse.js
        searchResults = fuse.search(query);
      } else {
        // No query, show all bookmarks
        searchResults = bookmarks.map((b) => ({ item: b, score: 0 }));
      }

      // Apply filters
      const filteredResults = applyFilters(searchResults);

      setResults(filteredResults);
      setIsSearching(false);
    }, 150); // Debounce search

    return () => clearTimeout(timer);
  }, [query, fuse, bookmarks, applyFilters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      folder: '',
      tag: '',
      domain: '',
      startDate: '',
      endDate: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v);

  // Show upgrade prompt for non-Pro users
  if (!isPro) {
    return (
      <div className={`${className}`}>
        <SearchInput
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search bookmarks..."
        />
        <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                Upgrade to Pro for Smart Search
              </h4>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Get fuzzy search, advanced filters by folder, tag, domain, and date range.
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
    <div className={`${className}`}>
      {/* Search Input */}
      <div className="flex gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search bookmarks..."
          className="flex-1"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 border rounded-lg flex items-center gap-1 text-sm
                     ${
                       showFilters || hasActiveFilters
                         ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                         : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400'
                     }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
          )}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <SearchFilters
          folders={folders}
          tags={tags}
          domains={domains}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          className="mt-3"
        />
      )}

      {/* Results Count */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          {results.length} {results.length === 1 ? 'bookmark' : 'bookmarks'} found
        </span>
        {query && (
          <span className="text-gray-400">
            Searching for &quot;{query}&quot;
          </span>
        )}
      </div>

      {/* Results */}
      <div className="mt-2 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <SearchResults
          results={results}
          isLoading={isSearching}
          query={query}
          onResultClick={onBookmarkClick}
        />
      </div>
    </div>
  );
}

export default SmartSearch;
