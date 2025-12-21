import React, { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';

// Icons
const SyncIcon = ({ className = '', spinning = false }) => (
  <svg
    className={`${className} ${spinning ? 'animate-sync' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const SettingsIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const CheckIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const AlertIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const BookmarkIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
    />
  </svg>
);

// Status indicator component
function StatusIndicator({ status }) {
  const statusConfig = {
    synced: {
      color: 'bg-sync-success',
      text: 'Synced',
      icon: CheckIcon,
    },
    syncing: {
      color: 'bg-sync-pending',
      text: 'Syncing...',
      icon: SyncIcon,
      spinning: true,
    },
    error: {
      color: 'bg-sync-error',
      text: 'Error',
      icon: AlertIcon,
    },
    pending: {
      color: 'bg-sync-warning',
      text: 'Pending',
      icon: AlertIcon,
    },
    disconnected: {
      color: 'bg-slate-400',
      text: 'Not Connected',
      icon: AlertIcon,
    },
  };

  const config = statusConfig[status] || statusConfig.disconnected;
  const Icon = config.icon;

  return (
    <div className="flex items-center space-x-2">
      <span
        className={`h-2 w-2 rounded-full ${config.color} ${status === 'syncing' ? 'animate-status-pulse' : ''}`}
      />
      <Icon
        className={`h-4 w-4 text-slate-600`}
        spinning={config.spinning}
      />
      <span className="text-sm text-slate-600">{config.text}</span>
    </div>
  );
}

// Source selector component
function SourceSelector({ sources, selectedSource, onSelect }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">Sync Source</label>
      <select
        value={selectedSource || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <option value="">Select a source...</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Stats component
function SyncStats({ stats }) {
  return (
    <div className="grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-4">
      <div className="text-center">
        <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        <div className="text-xs text-slate-500">Bookmarks</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-slate-900">{stats.folders}</div>
        <div className="text-xs text-slate-500">Folders</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-slate-900">{stats.synced}</div>
        <div className="text-xs text-slate-500">Synced</div>
      </div>
    </div>
  );
}

// Last sync info component
function LastSyncInfo({ lastSync }) {
  if (!lastSync) {
    return (
      <p className="text-sm text-slate-500">Never synced</p>
    );
  }

  const formatTime = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <p className="text-sm text-slate-500">
      Last sync: {formatTime(lastSync)}
    </p>
  );
}

// Main Popup component
export function Popup() {
  const {
    status,
    lastSync,
    selectedSource,
    sources,
    stats,
    error,
    setSelectedSource,
    triggerSync,
    initialize,
  } = useStore();

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initialize();
      setIsInitialized(true);
    };
    init();
  }, [initialize]);

  const handleSync = async () => {
    try {
      await triggerSync();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  const openOptions = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.openOptionsPage();
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.openOptionsPage();
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center bg-white">
        <SyncIcon className="h-8 w-8 text-primary-600" spinning />
      </div>
    );
  }

  return (
    <div className="flex min-h-[480px] flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center space-x-2">
          <BookmarkIcon className="h-6 w-6 text-primary-600" />
          <h1 className="text-lg font-semibold text-slate-900">MarkSyncr</h1>
        </div>
        <button
          onClick={openOptions}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title="Settings"
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 space-y-4 p-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <StatusIndicator status={status} />
          <LastSyncInfo lastSync={lastSync} />
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Stats */}
        <SyncStats stats={stats} />

        {/* Source selector */}
        <SourceSelector
          sources={sources}
          selectedSource={selectedSource}
          onSelect={setSelectedSource}
        />

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={status === 'syncing' || !selectedSource}
          className="flex w-full items-center justify-center space-x-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SyncIcon className="h-5 w-5" spinning={status === 'syncing'} />
          <span>{status === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
        </button>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {/* TODO: Implement export */}}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Export Bookmarks
          </button>
          <button
            onClick={() => {/* TODO: Implement import */}}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Import Bookmarks
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>v0.1.0</span>
          <a
            href="https://marksyncr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700"
          >
            marksyncr.com
          </a>
        </div>
      </footer>
    </div>
  );
}
