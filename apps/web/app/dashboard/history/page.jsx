'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * Version History Page
 * Shows bookmark sync history with rollback functionality
 */
export default function HistoryPage() {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retentionLimit, setRetentionLimit] = useState(5);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(null);

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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getSourceIcon = (sourceType) => {
    switch (sourceType) {
      case 'github':
        return '🐙';
      case 'dropbox':
        return '📦';
      case 'google-drive':
        return '📁';
      case 'supabase-cloud':
        return '☁️';
      case 'local-file':
        return '💾';
      case 'rollback':
        return '⏪';
      default:
        return '📄';
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
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
      <div className="max-w-4xl mx-auto px-4">
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
                className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                  index === 0 ? 'border-green-500' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">{getSourceIcon(version.sourceType)}</div>
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
                      onClick={() => setSelectedVersion(
                        selectedVersion === version.version ? null : version.version
                      )}
                      className="text-blue-600 hover:text-blue-700 text-sm px-3 py-1 border border-blue-200 rounded hover:bg-blue-50"
                    >
                      {selectedVersion === version.version ? 'Hide Details' : 'View Details'}
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

                {/* Expanded Details */}
                {selectedVersion === version.version && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Source:</span>
                        <span className="ml-2 text-gray-900">
                          {version.sourceName || version.sourceType}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Checksum:</span>
                        <span className="ml-2 text-gray-900 font-mono text-xs">
                          {version.checksum?.substring(0, 16)}...
                        </span>
                      </div>
                    </div>
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
