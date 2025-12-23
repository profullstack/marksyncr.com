'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

/**
 * Sync Sources Client Component
 *
 * Handles OAuth connections for sync sources.
 */
export default function SyncSourcesClient({ subscription, connectedSources = [] }) {
  const [isPending, startTransition] = useTransition();
  const [connectingSource, setConnectingSource] = useState(null);
  const [error, setError] = useState(null);

  const sources = [
    {
      name: 'GitHub',
      id: 'github',
      icon: 'github',
      available: true,
      connectUrl: '/api/connect/github',
    },
    {
      name: 'Dropbox',
      id: 'dropbox',
      icon: 'dropbox',
      available: true,
      connectUrl: '/api/connect/dropbox',
    },
    {
      name: 'Google Drive',
      id: 'google-drive',
      icon: 'google',
      available: true,
      connectUrl: '/api/connect/google',
    },
    {
      name: 'MarkSyncr Cloud',
      id: 'marksyncr-cloud',
      icon: 'cloud',
      available: subscription?.plan !== 'free' && subscription?.status === 'active',
      requiresPro: true,
      isInternal: true,
    },
  ];

  const isConnected = (sourceId) => {
    return connectedSources.some((s) => s.provider === sourceId);
  };

  const getSourceDetails = (sourceId) => {
    return connectedSources.find((s) => s.provider === sourceId);
  };

  const handleConnect = async (source) => {
    setError(null);
    setConnectingSource(source.id);

    if (source.isInternal) {
      // Handle MarkSyncr Cloud connection via API
      startTransition(async () => {
        try {
          const response = await fetch('/api/connect/cloud', {
            method: 'POST',
          });

          if (!response.ok) {
            const data = await response.json();
            setError(data.error || 'Failed to enable cloud storage');
          } else {
            // Refresh the page to show updated connections
            window.location.reload();
          }
        } catch (err) {
          setError('Failed to connect to MarkSyncr Cloud');
        } finally {
          setConnectingSource(null);
        }
      });
    } else {
      // Redirect to OAuth flow
      window.location.href = source.connectUrl;
    }
  };

  const handleDisconnect = async (source) => {
    setError(null);
    setConnectingSource(source.id);

    startTransition(async () => {
      try {
        const endpoint = source.isInternal
          ? '/api/connect/cloud'
          : `/api/connect/${source.id}/disconnect`;

        const response = await fetch(endpoint, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Failed to disconnect');
        } else {
          // Refresh the page to show updated connections
          window.location.reload();
        }
      } catch (err) {
        setError('Failed to disconnect');
      } finally {
        setConnectingSource(null);
      }
    });
  };

  return (
    <div className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Sync Sources</h2>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {sources.map((source) => {
          const connected = isConnected(source.id);
          const sourceDetails = getSourceDetails(source.id);
          const isLoading = connectingSource === source.id && isPending;

          return (
            <div
              key={source.name}
              className={`rounded-xl border p-4 ${
                source.available
                  ? 'border-slate-200 bg-white'
                  : 'border-slate-100 bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      connected
                        ? 'bg-green-100'
                        : source.available
                          ? 'bg-slate-100'
                          : 'bg-slate-200'
                    }`}
                  >
                    <SourceIcon
                      icon={source.icon}
                      connected={connected}
                      available={source.available}
                    />
                  </div>
                  <div>
                    <p
                      className={`font-medium ${
                        source.available ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {source.name}
                    </p>
                    {connected && (
                      <p className="text-xs text-green-600">Connected</p>
                    )}
                    {source.requiresPro && !source.available && (
                      <p className="text-xs text-slate-400">Pro plan required</p>
                    )}
                  </div>
                </div>
                {source.available && (
                  <div>
                    {connected ? (
                      <button
                        onClick={() => handleDisconnect(source)}
                        disabled={isLoading}
                        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {isLoading ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(source)}
                        disabled={isLoading}
                        className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                      >
                        {isLoading ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                  </div>
                )}
                {source.requiresPro && !source.available && (
                  <Link
                    href="/pricing"
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Upgrade
                  </Link>
                )}
              </div>
              
              {/* Repository details for connected sources */}
              {connected && sourceDetails?.repository && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="font-medium">{sourceDetails.repository}</span>
                  </div>
                  {sourceDetails.file_path && (
                    <div className="mt-1 flex items-center space-x-2 text-xs text-slate-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{sourceDetails.file_path}</span>
                    </div>
                  )}
                  {sourceDetails.branch && (
                    <div className="mt-1 flex items-center space-x-2 text-xs text-slate-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Branch: {sourceDetails.branch}</span>
                    </div>
                  )}
                  {source.id === 'github' && sourceDetails.repository && (
                    <a
                      href={`https://github.com/${sourceDetails.repository}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center text-xs text-primary-600 hover:text-primary-700"
                    >
                      View on GitHub
                      <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceIcon({ icon, connected, available }) {
  const colorClass = connected
    ? 'text-green-600'
    : available
      ? 'text-slate-600'
      : 'text-slate-400';

  switch (icon) {
    case 'github':
      return (
        <svg className={`h-5 w-5 ${colorClass}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
      );
    case 'dropbox':
      return (
        <svg className={`h-5 w-5 ${colorClass}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 2l6 3.75L6 9.5 0 5.75 6 2zm12 0l6 3.75-6 3.75-6-3.75L18 2zM0 13.25L6 9.5l6 3.75-6 3.75-6-3.75zm18-3.75l6 3.75-6 3.75-6-3.75 6-3.75zM6 18.25l6-3.75 6 3.75-6 3.75-6-3.75z" />
        </svg>
      );
    case 'google':
      return (
        <svg className={`h-5 w-5 ${colorClass}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      );
    case 'cloud':
    default:
      return (
        <svg
          className={`h-5 w-5 ${colorClass}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
          />
        </svg>
      );
  }
}
