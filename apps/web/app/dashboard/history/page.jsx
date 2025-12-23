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
    const iconClass = "w-8 h-8";
    switch (sourceType?.toLowerCase()) {
      case 'firefox':
        return (
          <svg className={iconClass} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M503.52 241.48c-.12-1.56-.24-3.12-.24-4.68v-.12l-.36-4.68v-.12a245.86 245.86 0 00-7.32-41.15c0-.12 0-.12-.12-.24l-1.08-4c-.12-.24-.12-.48-.24-.6-.36-1.2-.72-2.52-1.08-3.72-.12-.24-.12-.6-.24-.84-.36-1.2-.72-2.4-1.2-3.6a.6.6 0 000-.12 194.21 194.21 0 00-9.24-24.84c-.12-.24-.24-.48-.36-.84-.36-.72-.84-1.56-1.2-2.28-.24-.48-.48-.84-.72-1.32-.36-.72-.84-1.44-1.2-2.16-.36-.6-.6-1.2-.96-1.68-.36-.72-.84-1.32-1.2-2-.36-.6-.72-1.2-1.08-1.8s-.84-1.32-1.2-2-.72-1.2-1.08-1.8-.84-1.32-1.32-1.92c-.36-.6-.84-1.2-1.2-1.8-.48-.6-.84-1.32-1.32-1.92-.36-.6-.84-1.2-1.32-1.8-.48-.6-.96-1.32-1.44-1.92-.36-.6-.84-1.08-1.32-1.68-.48-.72-1.08-1.44-1.56-2.04-.36-.48-.84-1.08-1.32-1.56-.6-.72-1.08-1.44-1.68-2.16-.36-.48-.84-.96-1.2-1.44-.72-.84-1.32-1.68-2.04-2.52-.24-.36-.6-.72-.84-1.08-1.08-1.32-2.16-2.64-3.24-3.96a246.34 246.34 0 00-25.2-25.56 246.75 246.75 0 00-27-21.48c-.72-.48-1.44-1.08-2.16-1.56a242.69 242.69 0 00-29.28-18.24c-.84-.48-1.68-.84-2.52-1.32a243.4 243.4 0 00-31.2-14.04c-.84-.36-1.8-.72-2.64-1.08a243.64 243.64 0 00-33.12-10.44c-.84-.24-1.68-.36-2.52-.6a245.59 245.59 0 00-34.44-6.72c-.84-.12-1.68-.24-2.52-.36a245.14 245.14 0 00-35.4-3.12c-.84 0-1.68-.12-2.52-.12a245.87 245.87 0 00-35.88.12c-.84 0-1.68.12-2.52.12a245.14 245.14 0 00-35.4 3.12c-.84.12-1.68.24-2.52.36a245.59 245.59 0 00-34.44 6.72c-.84.24-1.68.36-2.52.6a243.64 243.64 0 00-33.12 10.44c-.84.36-1.8.72-2.64 1.08a243.4 243.4 0 00-31.2 14.04c-.84.48-1.68.84-2.52 1.32a242.69 242.69 0 00-29.28 18.24c-.72.48-1.44 1.08-2.16 1.56a246.75 246.75 0 00-27 21.48 246.34 246.34 0 00-25.2 25.56c-1.08 1.32-2.16 2.64-3.24 3.96-.24.36-.6.72-.84 1.08-.72.84-1.32 1.68-2.04 2.52-.36.48-.84.96-1.2 1.44-.6.72-1.08 1.44-1.68 2.16-.36.48-.84 1.08-1.32 1.56-.48.72-1.08 1.44-1.56 2.04-.36.6-.84 1.08-1.32 1.68-.48.6-.96 1.32-1.44 1.92-.36.6-.84 1.2-1.32 1.8-.48.6-.84 1.32-1.32 1.92-.36.6-.84 1.2-1.2 1.8-.48.6-.84 1.32-1.32 1.92-.36.6-.72 1.2-1.08 1.8s-.84 1.32-1.2 2c-.36.6-.72 1.2-1.08 1.8-.36.72-.84 1.32-1.2 2-.36.48-.6 1.08-.96 1.68-.36.72-.84 1.44-1.2 2.16-.24.48-.48.84-.72 1.32-.36.72-.84 1.56-1.2 2.28-.12.24-.24.48-.36.84a194.21 194.21 0 00-9.24 24.84.6.6 0 000 .12c-.48 1.2-.84 2.4-1.2 3.6-.12.24-.12.6-.24.84-.36 1.2-.72 2.52-1.08 3.72-.12.12-.12.36-.24.6l-1.08 4c0 .12 0 .12-.12.24a245.86 245.86 0 00-7.32 41.15v.12l-.36 4.68v.12c0 1.56-.12 3.12-.24 4.68v.24A245.87 245.87 0 000 256a246.13 246.13 0 00246 246 246.13 246.13 0 00246-246 245.87 245.87 0 00-8.48-64.28v-.24z" fill="#FF9500"/>
            <path d="M471.36 195.24c-6.48-21.36-18.12-45.36-30.6-60.72 8.76 16.8 14.76 35.64 17.04 51.96-18.36-52.44-49.44-73.56-75.24-119.76-1.32-2.4-2.64-4.8-3.96-7.32a65.4 65.4 0 01-1.68-3.36c-.84-1.8-1.56-3.6-2.16-5.52a23.24 23.24 0 01-.84-7.08 23.04 23.04 0 01.12-2.4c-38.28 22.44-51.24 63.96-52.44 84.72a124.08 124.08 0 00-68.04 18.12 73.08 73.08 0 00-6.36-4.68 112.8 112.8 0 01-.6-59.28c-27.12 12.24-48.24 31.56-63.48 50.04h-.12c-10.44-13.2-9.72-56.76-9.12-65.88-.12.12-.24.12-.36.24a166.8 166.8 0 00-22.08 19.08 193.32 193.32 0 00-21.12 24.96 202.32 202.32 0 00-18.6 29.52c-.12.12-.12.24-.24.36a207.6 207.6 0 00-14.76 32.64c0 .12-.12.24-.12.36a213.6 213.6 0 00-10.44 33.6c-.12.36-.12.72-.24 1.08a217.08 217.08 0 00-5.88 33.12v.36c-.12.84-.24 1.68-.24 2.52-.24 1.68-.36 3.36-.48 5.04-.12 1.08-.24 2.16-.24 3.24-.12 1.68-.24 3.36-.36 5.04 0 .84-.12 1.68-.12 2.52-.12 2.16-.12 4.32-.12 6.48v1.68c0 135.96 110.16 246.12 246.12 246.12 121.44 0 222.36-87.96 242.52-203.76.12-.84.24-1.68.36-2.52 5.04-35.04 2.16-72.12-11.04-109.68z" fill="#FF9500"/>
            <path d="M471.36 195.24c-6.48-21.36-18.12-45.36-30.6-60.72 8.76 16.8 14.76 35.64 17.04 51.96-18.36-52.44-49.44-73.56-75.24-119.76-1.32-2.4-2.64-4.8-3.96-7.32a65.4 65.4 0 01-1.68-3.36c-.84-1.8-1.56-3.6-2.16-5.52a23.24 23.24 0 01-.84-7.08 23.04 23.04 0 01.12-2.4c-38.28 22.44-51.24 63.96-52.44 84.72a124.08 124.08 0 00-68.04 18.12 73.08 73.08 0 00-6.36-4.68 112.8 112.8 0 01-.6-59.28c-27.12 12.24-48.24 31.56-63.48 50.04h-.12c-10.44-13.2-9.72-56.76-9.12-65.88-.12.12-.24.12-.36.24a166.8 166.8 0 00-22.08 19.08 193.32 193.32 0 00-21.12 24.96 202.32 202.32 0 00-18.6 29.52c-.12.12-.12.24-.24.36a207.6 207.6 0 00-14.76 32.64c0 .12-.12.24-.12.36a213.6 213.6 0 00-10.44 33.6c-.12.36-.12.72-.24 1.08a217.08 217.08 0 00-5.88 33.12v.36c-.12.84-.24 1.68-.24 2.52-.24 1.68-.36 3.36-.48 5.04-.12 1.08-.24 2.16-.24 3.24-.12 1.68-.24 3.36-.36 5.04 0 .84-.12 1.68-.12 2.52-.12 2.16-.12 4.32-.12 6.48v1.68c0 135.96 110.16 246.12 246.12 246.12 121.44 0 222.36-87.96 242.52-203.76.12-.84.24-1.68.36-2.52 5.04-35.04 2.16-72.12-11.04-109.68z" fill="url(#firefox-gradient)"/>
            <defs>
              <linearGradient id="firefox-gradient" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFBD4F"/>
                <stop offset="1" stopColor="#FF980E"/>
              </linearGradient>
            </defs>
          </svg>
        );
      case 'chrome':
        return (
          <svg className={iconClass} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#4CAF50"/>
            <path fill="#F44336" d="M24,4C12.95,4,4,12.95,4,24c0,3.31,0.81,6.43,2.23,9.18L24,24V4z"/>
            <path fill="#FFEB3B" d="M24,4v20l17.77,9.18C43.19,30.43,44,27.31,44,24C44,12.95,35.05,4,24,4z"/>
            <path fill="#4CAF50" d="M6.23,33.18C9.38,39.49,16.18,44,24,44c7.82,0,14.62-4.51,17.77-10.82L24,24L6.23,33.18z"/>
            <circle cx="24" cy="24" r="8" fill="#fff"/>
            <circle cx="24" cy="24" r="6" fill="#2196F3"/>
          </svg>
        );
      case 'edge':
        return (
          <svg className={iconClass} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#0078D4" d="M42,24c0,9.94-8.06,18-18,18S6,33.94,6,24S14.06,6,24,6S42,14.06,42,24z"/>
            <path fill="#50E6FF" d="M24,12c6.63,0,12,5.37,12,12c0,3.31-1.34,6.31-3.52,8.48L24,24V12z"/>
            <path fill="#fff" d="M24,12v12l8.48,8.48C30.31,34.66,27.31,36,24,36c-6.63,0-12-5.37-12-12S17.37,12,24,12z"/>
          </svg>
        );
      case 'safari':
        return (
          <svg className={iconClass} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#1E88E5"/>
            <circle cx="24" cy="24" r="18" fill="#fff"/>
            <circle cx="24" cy="24" r="16" fill="#1E88E5"/>
            <polygon fill="#F44336" points="24,8 26,24 24,40"/>
            <polygon fill="#fff" points="24,8 22,24 24,40"/>
          </svg>
        );
      case 'brave':
        return (
          <svg className={iconClass} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#FB542B" d="M24,4L8,12v12c0,11.05,6.84,21.37,16,24c9.16-2.63,16-12.95,16-24V12L24,4z"/>
            <path fill="#fff" d="M24,8l-12,6v10c0,8.84,5.47,17.1,12,19.2c6.53-2.1,12-10.36,12-19.2V14L24,8z"/>
            <path fill="#FB542B" d="M24,12l-8,4v8c0,5.89,3.65,11.4,8,12.8c4.35-1.4,8-6.91,8-12.8v-8L24,12z"/>
          </svg>
        );
      case 'opera':
        return (
          <svg className={iconClass} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#FF1B2D"/>
            <ellipse cx="24" cy="24" rx="8" ry="14" fill="#fff"/>
          </svg>
        );
      case 'vivaldi':
        return (
          <svg className={iconClass} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="20" fill="#EF3939"/>
            <path fill="#fff" d="M24,8c-8.84,0-16,7.16-16,16s7.16,16,16,16s16-7.16,16-16S32.84,8,24,8z M24,36c-6.63,0-12-5.37-12-12s5.37-12,12-12s12,5.37,12,12S30.63,36,24,36z"/>
          </svg>
        );
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
