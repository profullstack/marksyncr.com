/**
 * @fileoverview Sync Schedule Settings component for Pro users
 * Allows users to configure automatic sync intervals
 */

import { useState, useEffect, useMemo } from 'react';
import {
  SYNC_INTERVALS,
  formatSyncInterval,
  validateSyncInterval,
  calculateSyncStats,
} from '@marksyncr/core';

/**
 * Interval option component
 */
const IntervalOption = ({ value, label, selected, onSelect, disabled }) => (
  <button
    onClick={() => onSelect(value)}
    disabled={disabled}
    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
      selected
        ? 'bg-blue-600 text-white'
        : disabled
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

/**
 * Sync status indicator
 */
const SyncStatus = ({ lastSync, nextSync, enabled }) => {
  const formatTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.abs(now - date);

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const formatNextSync = (timestamp) => {
    if (!timestamp) return 'Not scheduled';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = date - now;

    if (diff < 0) return 'Due now';
    if (diff < 60000) return 'In less than a minute';
    if (diff < 3600000) return `In ${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `In ${Math.floor(diff / 3600000)}h`;
    return date.toLocaleString();
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Last sync</span>
        <span className="text-sm font-medium text-gray-900">{formatTime(lastSync)}</span>
      </div>
      {enabled && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Next sync</span>
          <span className="text-sm font-medium text-blue-600">{formatNextSync(nextSync)}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Sync history item
 */
const SyncHistoryItem = ({ sync }) => {
  const date = new Date(sync.timestamp);

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${sync.success ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-700">
          {date.toLocaleDateString()}{' '}
          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="text-xs text-gray-500">
        {sync.duration ? `${(sync.duration / 1000).toFixed(1)}s` : '-'}
      </div>
    </div>
  );
};

/**
 * Sync statistics display
 */
const SyncStatsDisplay = ({ stats }) => {
  if (!stats || stats.totalSyncs === 0) {
    return <div className="text-center py-4 text-gray-500 text-sm">No sync history yet</div>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="bg-gray-50 rounded-lg p-2">
        <div className="text-lg font-bold text-gray-900">{stats.totalSyncs}</div>
        <div className="text-xs text-gray-500">Total</div>
      </div>
      <div className="bg-green-50 rounded-lg p-2">
        <div className="text-lg font-bold text-green-600">{stats.successfulSyncs}</div>
        <div className="text-xs text-gray-500">Success</div>
      </div>
      <div className="bg-red-50 rounded-lg p-2">
        <div className="text-lg font-bold text-red-600">{stats.failedSyncs}</div>
        <div className="text-xs text-gray-500">Failed</div>
      </div>
    </div>
  );
};

/**
 * Main Sync Schedule Settings component
 */
export default function SyncScheduleSettings({
  sources,
  schedules,
  syncHistory,
  isPro,
  onUpdateSchedule,
  onSyncNow,
  onUpgrade,
}) {
  const [selectedSource, setSelectedSource] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Available interval options
  const intervalOptions = [
    { value: 0, label: 'Manual' },
    { value: SYNC_INTERVALS.FIVE_MINUTES, label: '5 min' },
    { value: SYNC_INTERVALS.FIFTEEN_MINUTES, label: '15 min' },
    { value: SYNC_INTERVALS.THIRTY_MINUTES, label: '30 min' },
    { value: SYNC_INTERVALS.ONE_HOUR, label: '1 hour' },
    { value: SYNC_INTERVALS.SIX_HOURS, label: '6 hours' },
    { value: SYNC_INTERVALS.DAILY, label: 'Daily' },
  ];

  // Select first source by default
  useEffect(() => {
    if (sources?.length > 0 && !selectedSource) {
      setSelectedSource(sources[0].id);
    }
  }, [sources, selectedSource]);

  // Get current schedule for selected source
  const currentSchedule = useMemo(() => {
    if (!selectedSource || !schedules) return null;
    return schedules[selectedSource] || { enabled: false, intervalMinutes: 0 };
  }, [selectedSource, schedules]);

  // Get sync history for selected source
  const currentHistory = useMemo(() => {
    if (!selectedSource || !syncHistory) return [];
    return syncHistory[selectedSource] || [];
  }, [selectedSource, syncHistory]);

  // Calculate stats
  const stats = useMemo(() => {
    return calculateSyncStats(currentHistory);
  }, [currentHistory]);

  // Handle interval change
  const handleIntervalChange = (interval) => {
    if (!selectedSource) return;

    onUpdateSchedule(selectedSource, {
      intervalMinutes: interval,
      enabled: interval > 0,
    });
  };

  // Show upgrade prompt for non-Pro users
  if (!isPro) {
    return (
      <div className="p-4 text-center">
        <div className="text-4xl mb-3">⏰</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Scheduled Sync</h3>
        <p className="text-sm text-gray-600 mb-4">
          Automatically sync your bookmarks at regular intervals. Set it and forget it!
        </p>
        <ul className="text-sm text-gray-600 mb-4 space-y-1">
          <li>✓ Sync every 5 minutes to daily</li>
          <li>✓ Per-source scheduling</li>
          <li>✓ Sync history & statistics</li>
        </ul>
        <button
          onClick={onUpgrade}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          Upgrade to Pro
        </button>
      </div>
    );
  }

  // Show empty state if no sources
  if (!sources || sources.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="text-4xl mb-2">🔗</div>
        <p className="text-sm">Connect a sync source first to enable scheduled sync.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">⏰ Scheduled Sync</h2>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          {showHistory ? 'Settings' : 'History'}
        </button>
      </div>

      {/* Source selector */}
      {sources.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => setSelectedSource(source.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                selectedSource === source.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {source.name || source.type}
            </button>
          ))}
        </div>
      )}

      {!showHistory ? (
        <>
          {/* Sync status */}
          <SyncStatus
            lastSync={currentSchedule?.lastSync}
            nextSync={currentSchedule?.nextSync}
            enabled={currentSchedule?.enabled}
          />

          {/* Interval selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sync Interval</label>
            <div className="grid grid-cols-4 gap-2">
              {intervalOptions.map((option) => (
                <IntervalOption
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  selected={currentSchedule?.intervalMinutes === option.value}
                  onSelect={handleIntervalChange}
                  disabled={false}
                />
              ))}
            </div>
          </div>

          {/* Current setting display */}
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${currentSchedule?.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
              />
              <span className="text-sm text-blue-800">
                {currentSchedule?.enabled
                  ? `Auto-sync every ${formatSyncInterval(currentSchedule.intervalMinutes)}`
                  : 'Manual sync only'}
              </span>
            </div>
          </div>

          {/* Sync now button */}
          <button
            onClick={() => onSyncNow(selectedSource)}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
          >
            Sync Now
          </button>
        </>
      ) : (
        <>
          {/* Sync statistics */}
          <SyncStatsDisplay stats={stats} />

          {/* Sync history */}
          <div className="bg-white rounded-lg border border-gray-200 max-h-60 overflow-y-auto">
            {currentHistory.length > 0 ? (
              <div className="p-2">
                {currentHistory.slice(0, 20).map((sync, i) => (
                  <SyncHistoryItem key={i} sync={sync} />
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500 text-sm">No sync history yet</div>
            )}
          </div>

          {/* Success rate */}
          {stats.totalSyncs > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.successRate.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500">Success Rate</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Compact sync indicator for header/status bar
 */
export function SyncIndicator({ schedule, onSyncNow }) {
  if (!schedule?.enabled) {
    return null;
  }

  const isOverdue = schedule.nextSync && Date.now() >= schedule.nextSync;

  return (
    <button
      onClick={onSyncNow}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
        isOverdue ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
      }`}
      title={isOverdue ? 'Sync overdue - click to sync now' : 'Auto-sync enabled'}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOverdue ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}
      />
      <span>{formatSyncInterval(schedule.intervalMinutes)}</span>
    </button>
  );
}

/**
 * Quick toggle for enabling/disabling scheduled sync
 */
export function SyncToggle({ enabled, interval, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        enabled ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
