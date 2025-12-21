import React, { useState, useEffect } from 'react';
import { useStore } from '../store/index.js';

// Section component
function Section({ title, description, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// Toggle component
function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {description && (
          <div className="text-sm text-slate-500">{description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          checked ? 'bg-primary-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// Select component
function Select({ label, description, value, onChange, options }) {
  return (
    <div className="py-3">
      <label className="block text-sm font-medium text-slate-900">{label}</label>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Source card component
function SourceCard({ source, onConnect, onDisconnect }) {
  const sourceIcons = {
    'local-file': (
      <svg className="h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    github: (
      <svg className="h-8 w-8 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
    dropbox: (
      <svg className="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2l6 3.75L6 9.5 0 5.75 6 2zm12 0l6 3.75-6 3.75-6-3.75L18 2zM0 13.25L6 9.5l6 3.75-6 3.75-6-3.75zm18-3.75l6 3.75-6 3.75-6-3.75 6-3.75zM6 18.25l6-3.75 6 3.75-6 3.75-6-3.75z" />
      </svg>
    ),
    'google-drive': (
      <svg className="h-8 w-8" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    'supabase-cloud': (
      <svg className="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
      <div className="flex items-center space-x-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
          {sourceIcons[source.type] || sourceIcons['local-file']}
        </div>
        <div>
          <div className="font-medium text-slate-900">{source.name}</div>
          <div className="text-sm text-slate-500">
            {source.connected ? 'Connected' : 'Not connected'}
          </div>
        </div>
      </div>
      {source.connected ? (
        <button
          onClick={() => onDisconnect(source.id)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => onConnect(source.id)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Connect
        </button>
      )}
    </div>
  );
}

// Main Options component
export function Options() {
  const {
    settings,
    sources,
    updateSettings,
    connectSource,
    disconnectSource,
    initialize,
  } = useStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    const init = async () => {
      await initialize();
      setIsInitialized(true);
    };
    init();
  }, [initialize]);

  const handleSettingChange = async (key, value) => {
    updateSettings({ [key]: value });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleConnect = async (sourceId) => {
    await connectSource(sourceId);
  };

  const handleDisconnect = async (sourceId) => {
    await disconnectSource(sourceId);
  };

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="h-8 w-8 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <div>
                <h1 className="text-xl font-bold text-slate-900">MarkSyncr Settings</h1>
                <p className="text-sm text-slate-500">Configure your bookmark sync preferences</p>
              </div>
            </div>
            {saveStatus && (
              <div className="flex items-center space-x-2 text-sm text-green-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Settings saved</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Sync Sources */}
          <Section
            title="Sync Sources"
            description="Connect to your preferred storage providers"
          >
            <div className="space-y-3">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          </Section>

          {/* Sync Settings */}
          <Section
            title="Sync Settings"
            description="Configure how and when your bookmarks sync"
          >
            <div className="divide-y divide-slate-200">
              <Toggle
                label="Auto Sync"
                description="Automatically sync bookmarks in the background"
                checked={settings.autoSync}
                onChange={(value) => handleSettingChange('autoSync', value)}
              />

              <Select
                label="Sync Interval"
                description="How often to automatically sync bookmarks"
                value={settings.syncInterval}
                onChange={(value) => handleSettingChange('syncInterval', parseInt(value, 10))}
                options={[
                  { value: '5', label: 'Every 5 minutes' },
                  { value: '15', label: 'Every 15 minutes' },
                  { value: '30', label: 'Every 30 minutes' },
                  { value: '60', label: 'Every hour' },
                  { value: '360', label: 'Every 6 hours' },
                ]}
              />

              <Toggle
                label="Sync on Startup"
                description="Sync bookmarks when the browser starts"
                checked={settings.syncOnStartup}
                onChange={(value) => handleSettingChange('syncOnStartup', value)}
              />

              <Select
                label="Conflict Resolution"
                description="How to handle conflicts when the same bookmark is modified in multiple places"
                value={settings.conflictResolution}
                onChange={(value) => handleSettingChange('conflictResolution', value)}
                options={[
                  { value: 'newest-wins', label: 'Newest wins (automatic)' },
                  { value: 'merge', label: 'Merge changes (automatic)' },
                  { value: 'manual', label: 'Ask me each time' },
                ]}
              />
            </div>
          </Section>

          {/* Notifications */}
          <Section
            title="Notifications"
            description="Control sync notifications"
          >
            <Toggle
              label="Show Notifications"
              description="Display notifications for sync events and errors"
              checked={settings.notifications}
              onChange={(value) => handleSettingChange('notifications', value)}
            />
          </Section>

          {/* Data Management */}
          <Section
            title="Data Management"
            description="Export, import, or reset your bookmark data"
          >
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {/* TODO: Implement export */}}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Export Bookmarks
              </button>
              <button
                onClick={() => {/* TODO: Implement import */}}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Import Bookmarks
              </button>
              <button
                onClick={() => {/* TODO: Implement reset */}}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Reset Sync Data
              </button>
            </div>
          </Section>

          {/* About */}
          <Section title="About">
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                <strong>MarkSyncr</strong> v0.1.0
              </p>
              <p>
                Sync your bookmarks across browsers using GitHub, Dropbox, Google Drive, or MarkSyncr Cloud.
              </p>
              <div className="flex space-x-4 pt-2">
                <a
                  href="https://marksyncr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  Website
                </a>
                <a
                  href="https://marksyncr.com/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  Documentation
                </a>
                <a
                  href="https://github.com/marksyncr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  GitHub
                </a>
                <a
                  href="https://marksyncr.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  Privacy Policy
                </a>
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
