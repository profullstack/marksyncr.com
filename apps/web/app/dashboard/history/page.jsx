'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

/**
 * Version History Page
 * Shows bookmark sync history with rollback functionality and bookmark browser
 */
export default function HistoryPage() {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retentionLimit, setRetentionLimit] = useState(5);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(null);
  const [versionData, setVersionData] = useState(null);
  const [loadingVersionData, setLoadingVersionData] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchVersionHistory();
  }, []);

  const fetchVersionHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/versions?limit=50');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch version history');
      }

      setVersions(data.versions);
      setRetentionLimit(data.retentionLimit);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchVersionData = useCallback(async (version) => {
    try {
      setLoadingVersionData(true);
      const response = await fetch(`/api/versions/${version}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch version data');
      }

      setVersionData(data.version);
      // Expand all root folders by default
      setExpandedFolders(new Set(['toolbar', 'menu', 'other']));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingVersionData(false);
    }
  }, []);

  const handleViewDetails = useCallback((version) => {
    if (selectedVersion === version) {
      setSelectedVersion(null);
      setVersionData(null);
    } else {
      setSelectedVersion(version);
      fetchVersionData(version);
    }
  }, [selectedVersion, fetchVersionData]);

  const handleRollback = async (version) => {
    if (!confirm(`Are you sure you want to rollback to version ${version}? This will create a new version with the old data.`)) {
      return;
    }

    try {
      setRollbackLoading(true);
      setRollbackSuccess(null);

      const response = await fetch(`/api/versions/${version}/rollback`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to rollback');
      }

      setRollbackSuccess(`Successfully rolled back to version ${version}. New version: ${data.newVersion.version}`);
      
      // Refresh the version list
      await fetchVersionHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setRollbackLoading(false);
    }
  };

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getBrowserIcon = (sourceType) => {
    switch (sourceType?.toLowerCase()) {
      case 'firefox':
        return <span className="text-3xl">🦊</span>;
      case 'chrome':
        return (
          <svg className="w-8 h-8" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#4CAF50"/>
            <path fill="#F44336" d="M24,4C12.95,4,4,12.95,4,24c0,3.31,0.81,6.43,2.23,9.18L24,24V4z"/>
            <path fill="#FFEB3B" d="M24,4v20l17.77,9.18C43.19,30.43,44,27.31,44,24C44,12.95,35.05,4,24,4z"/>
            <path fill="#4CAF50" d="M6.23,33.18C9.38,39.49,16.18,44,24,44c7.82,0,14.62-4.51,17.77-10.82L24,24L6.23,33.18z"/>
            <circle cx="24" cy="24" r="8" fill="#fff"/>
            <circle cx="24" cy="24" r="6" fill="#2196F3"/>
          </svg>
        );
      case 'edge':
        return <span className="text-3xl">🔷</span>;
      case 'safari':
        return <span className="text-3xl">🧭</span>;
      case 'brave':
        return <span className="text-3xl">🦁</span>;
      case 'opera':
        return <span className="text-3xl">🔴</span>;
      case 'vivaldi':
        return <span className="text-3xl">🎨</span>;
      case 'github':
        return <span className="text-3xl">🐙</span>;
      case 'dropbox':
        return <span className="text-3xl">📦</span>;
      case 'google-drive':
        return <span className="text-3xl">📁</span>;
      case 'supabase-cloud':
        return <span className="text-3xl">☁️</span>;
      case 'local-file':
        return <span className="text-3xl">💾</span>;
      case 'rollback':
        return <span className="text-3xl">⏪</span>;
      default:
        return <span className="text-3xl">📄</span>;
    }
  };

  const getChangeSummaryText = (summary) => {
    if (!summary || Object.keys(summary).length === 0) {
      return 'No change details';
    }

    if (summary.type === 'rollback') {
      return `Rollback from v${summary.from_version} to v${summary.to_version}`;
    }

    const parts = [];
    if (summary.added > 0) parts.push(`+${summary.added} added`);
    if (summary.removed > 0) parts.push(`-${summary.removed} removed`);
    if (summary.modified > 0) parts.push(`~${summary.modified} modified`);

    return parts.length > 0 ? parts.join(', ') : 'No changes';
  };

  // Filter bookmarks based on search query
  const filterBookmarks = (items, query) => {
    if (!query || !items) return items;
    
    const lowerQuery = query.toLowerCase();
    
    return items.filter(item => {
      if (item.type === 'bookmark') {
        return item.title?.toLowerCase().includes(lowerQuery) || 
               item.url?.toLowerCase().includes(lowerQuery);
      }
      if (item.type === 'folder' && item.children) {
        const filteredChildren = filterBookmarks(item.children, query);
        return filteredChildren.length > 0 || item.title?.toLowerCase().includes(lowerQuery);
      }
      return false;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Version History</h1>
            <p className="text-gray-600 mt-1">
              View and restore previous bookmark versions
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-blue-600 hover:text-blue-700 flex items-center gap-2"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Retention Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-blue-500 text-xl">ℹ️</span>
            <div>
              <p className="text-blue-800 font-medium">Version Retention</p>
              <p className="text-blue-700 text-sm">
                Your plan keeps the last {retentionLimit} versions. 
                {retentionLimit < 30 && (
                  <Link href="/pricing" className="underline ml-1">
                    Upgrade to Pro for 30 days of history
                  </Link>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {rollbackSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-green-500 text-xl">✓</span>
              <p className="text-green-800">{rollbackSuccess}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-red-500 text-xl">⚠️</span>
              <p className="text-red-800">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="ml-auto text-red-600 hover:text-red-800"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Version List */}
        {versions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 text-lg">No version history yet</p>
            <p className="text-gray-400 mt-2">
              Sync your bookmarks to start building version history
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={`bg-white rounded-lg shadow border-l-4 ${
                  index === 0 ? 'border-green-500' : 'border-gray-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">{getBrowserIcon(version.sourceType)}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            Version {version.version}
                          </span>
                          {index === 0 && (
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                              Current
                            </span>
                          )}
                          {version.sourceType === 'rollback' && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                              Rollback
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm mt-1">
                          {formatDate(version.createdAt)}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span>📚 {version.bookmarkCount} bookmarks</span>
                          <span>📁 {version.folderCount} folders</span>
                          {version.deviceName && (
                            <span>💻 {version.deviceName}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-2">
                          {getChangeSummaryText(version.changeSummary)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetails(version.version)}
                        className="text-blue-600 hover:text-blue-700 text-sm px-3 py-1 border border-blue-200 rounded hover:bg-blue-50"
                      >
                        {selectedVersion === version.version ? 'Hide Bookmarks' : 'View Bookmarks'}
                      </button>
                      {index !== 0 && (
                        <button
                          onClick={() => handleRollback(version.version)}
                          disabled={rollbackLoading}
                          className="text-orange-600 hover:text-orange-700 text-sm px-3 py-1 border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50"
                        >
                          {rollbackLoading ? 'Rolling back...' : 'Rollback'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Bookmark Browser */}
                {selectedVersion === version.version && (
                  <div className="border-t border-gray-100 bg-gray-50 p-6">
                    {loadingVersionData ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-3 text-gray-600">Loading bookmarks...</span>
                      </div>
                    ) : versionData?.bookmarkData ? (
                      <div>
                        {/* Search */}
                        <div className="mb-4">
                          <input
                            type="text"
                            placeholder="Search bookmarks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        {/* Bookmark Tree */}
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <h3 className="font-medium text-gray-900">
                              Bookmarks from {versionData.bookmarkData.browser || 'Unknown Browser'}
                            </h3>
                            <p className="text-sm text-gray-500">
                              Exported: {formatDate(versionData.bookmarkData.exportedAt)}
                            </p>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {versionData.bookmarkData.roots && (
                              <>
                                <BookmarkFolder
                                  folder={{ 
                                    type: 'folder', 
                                    title: 'Bookmarks Toolbar', 
                                    children: versionData.bookmarkData.roots.toolbar?.children || []
                                  }}
                                  folderId="toolbar"
                                  expandedFolders={expandedFolders}
                                  toggleFolder={toggleFolder}
                                  searchQuery={searchQuery}
                                  filterBookmarks={filterBookmarks}
                                  level={0}
                                />
                                <BookmarkFolder
                                  folder={{ 
                                    type: 'folder', 
                                    title: 'Bookmarks Menu', 
                                    children: versionData.bookmarkData.roots.menu?.children || []
                                  }}
                                  folderId="menu"
                                  expandedFolders={expandedFolders}
                                  toggleFolder={toggleFolder}
                                  searchQuery={searchQuery}
                                  filterBookmarks={filterBookmarks}
                                  level={0}
                                />
                                <BookmarkFolder
                                  folder={{ 
                                    type: 'folder', 
                                    title: 'Other Bookmarks', 
                                    children: versionData.bookmarkData.roots.other?.children || []
                                  }}
                                  folderId="other"
                                  expandedFolders={expandedFolders}
                                  toggleFolder={toggleFolder}
                                  searchQuery={searchQuery}
                                  filterBookmarks={filterBookmarks}
                                  level={0}
                                />
                              </>
                            )}
                          </div>
                        </div>

                        {/* Version Metadata */}
                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-white p-3 rounded border border-gray-200">
                            <span className="text-gray-500">Source:</span>
                            <span className="ml-2 text-gray-900">
                              {versionData.sourceName || versionData.sourceType}
                            </span>
                          </div>
                          <div className="bg-white p-3 rounded border border-gray-200">
                            <span className="text-gray-500">Checksum:</span>
                            <span className="ml-2 text-gray-900 font-mono text-xs">
                              {versionData.checksum?.substring(0, 16)}...
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No bookmark data available for this version
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {versions.length >= 20 && (
          <div className="mt-6 text-center">
            <button
              onClick={() => {/* TODO: Implement pagination */}}
              className="text-blue-600 hover:text-blue-700"
            >
              Load more versions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Bookmark Folder Component
 */
function BookmarkFolder({ folder, folderId, expandedFolders, toggleFolder, searchQuery, filterBookmarks, level }) {
  const isExpanded = expandedFolders.has(folderId);
  const filteredChildren = searchQuery 
    ? filterBookmarks(folder.children, searchQuery) 
    : folder.children;
  
  const hasChildren = filteredChildren && filteredChildren.length > 0;
  
  return (
    <div className={level > 0 ? 'border-l border-gray-200 ml-4' : ''}>
      <button
        onClick={() => toggleFolder(folderId)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 text-left"
        style={{ paddingLeft: `${level * 16 + 16}px` }}
      >
        <span className="text-gray-400">
          {hasChildren ? (isExpanded ? '▼' : '▶') : '•'}
        </span>
        <span className="text-yellow-500">📁</span>
        <span className="font-medium text-gray-900">{folder.title || 'Untitled Folder'}</span>
        <span className="text-gray-400 text-sm ml-auto">
          {filteredChildren?.length || 0} items
        </span>
      </button>
      
      {isExpanded && hasChildren && (
        <div>
          {filteredChildren.map((item, index) => {
            const itemId = `${folderId}-${index}`;
            
            if (item.type === 'folder') {
              return (
                <BookmarkFolder
                  key={itemId}
                  folder={item}
                  folderId={itemId}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  searchQuery={searchQuery}
                  filterBookmarks={filterBookmarks}
                  level={level + 1}
                />
              );
            }
            
            return (
              <BookmarkItem
                key={itemId}
                bookmark={item}
                level={level + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Bookmark Item Component
 */
function BookmarkItem({ bookmark, level }) {
  const getFaviconUrl = (url) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return null;
    }
  };

  const faviconUrl = bookmark.url ? getFaviconUrl(bookmark.url) : null;

  return (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-4 py-2 hover:bg-blue-50 text-left group"
      style={{ paddingLeft: `${level * 16 + 32}px` }}
    >
      {faviconUrl ? (
        <img 
          src={faviconUrl} 
          alt="" 
          className="w-4 h-4"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      ) : (
        <span className="text-blue-500">🔗</span>
      )}
      <span className="text-gray-900 group-hover:text-blue-600 truncate flex-1">
        {bookmark.title || bookmark.url}
      </span>
      <span className="text-gray-400 text-xs truncate max-w-[200px] hidden group-hover:block">
        {bookmark.url}
      </span>
    </a>
  );
}
