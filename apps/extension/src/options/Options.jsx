import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/index.js';
import {
  parseImportFile,
  formatToNetscapeHtml,
  formatToJson,
  detectImportFormat,
} from '@marksyncr/core';

// Service icons
const GitHubIcon = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const DropboxIcon = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 2l6 3.75L6 9.5 0 5.75 6 2zm12 0l6 3.75-6 3.75-6-3.75L18 2zM0 13.25L6 9.5l6 3.75-6 3.75-6-3.75zm18-3.75l6 3.75-6 3.75-6-3.75 6-3.75zM6 18.25l6-3.75 6 3.75-6 3.75-6-3.75z"/>
  </svg>
);

const GoogleDriveIcon = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M7.71 3.5L1.15 15l3.43 5.5h6.56l3.43-5.5L7.71 3.5zm1.44 1.5l5.14 8.5H4.29L9.15 5zm6.56 0L22.85 15l-3.43 5.5H12.86l3.43-5.5-1.58-2.5 1.58-2.5L22.85 15l-3.43-5.5L13.71 5z"/>
  </svg>
);

const CloudIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
  </svg>
);

const MarkSyncrIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
  </svg>
);

const ExternalLinkIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

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

// Connected services display component (matches popup style)
function ConnectedServices({ sources, isAuthenticated }) {
  const getServiceIcon = (sourceType) => {
    switch (sourceType) {
      case 'github':
        return GitHubIcon;
      case 'dropbox':
        return DropboxIcon;
      case 'google_drive':
      case 'google-drive':
        return GoogleDriveIcon;
      case 'marksyncr-cloud':
        return MarkSyncrIcon;
      default:
        return CloudIcon;
    }
  };

  // Get source type - handle both 'type' (local) and 'provider' (server) properties
  const getSourceType = (source) => {
    return source.type || source.provider || source.id;
  };

  const getServiceName = (source) => {
    const sourceType = getSourceType(source);
    if (sourceType === 'github' && source.repository) {
      return `GitHub: ${source.repository}`;
    }
    if (sourceType === 'marksyncr-cloud') {
      return 'MarkSyncr Cloud';
    }
    return source.name || sourceType;
  };

  // Filter to only external services (not browser-bookmarks)
  const externalServices = ['github', 'dropbox', 'google-drive', 'google_drive'];
  const connectedSources = sources.filter(s =>
    s.connected && externalServices.includes(getSourceType(s))
  );

  const openDashboard = () => {
    window.open('https://marksyncr.com/dashboard', '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Sync Destinations</label>
        <button
          onClick={openDashboard}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          Manage
          <ExternalLinkIcon className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-2">
        {/* MarkSyncr Cloud - Always shown when authenticated */}
        <div className="flex items-center justify-between rounded-lg bg-primary-50 p-4 border border-primary-200">
          <div className="flex items-center space-x-3">
            <MarkSyncrIcon className="h-6 w-6 text-primary-600" />
            <span className="text-sm font-medium text-primary-700">MarkSyncr Cloud</span>
          </div>
          <div className="flex items-center space-x-2">
            {isAuthenticated ? (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs text-green-600">Active</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <span className="text-xs text-slate-500">Sign in required</span>
              </>
            )}
          </div>
        </div>

        {/* External services */}
        {connectedSources.map((source) => {
          const sourceType = getSourceType(source);
          const Icon = getServiceIcon(sourceType);
          return (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 p-4 border border-slate-200"
            >
              <div className="flex items-center space-x-3">
                <Icon className="h-6 w-6 text-slate-600" />
                <span className="text-sm text-slate-700">{getServiceName(source)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs text-green-600">Connected</span>
              </div>
            </div>
          );
        })}

        {/* Add more services button */}
        {connectedSources.length === 0 && (
          <button
            onClick={openDashboard}
            className="flex w-full items-center justify-center space-x-2 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-600"
          >
            <CloudIcon className="h-5 w-5" />
            <span>Connect GitHub, Dropbox, or Google Drive</span>
          </button>
        )}
      </div>

      {/* Info text */}
      <p className="text-xs text-slate-500">
        {isAuthenticated
          ? 'Bookmarks sync automatically to MarkSyncr Cloud and all connected services.'
          : 'Sign in to enable cloud sync.'}
      </p>
    </div>
  );
}

// Main Options component
export function Options() {
  const {
    settings,
    sources,
    bookmarks,
    updateSettings,
    initialize,
    isAuthenticated,
  } = useStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [exportFormat, setExportFormat] = useState('json');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const fileInputRef = useRef(null);

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

  // Export bookmarks
  const handleExport = async (format) => {
    try {
      // Get bookmarks from browser
      const browserBookmarks = await new Promise((resolve) => {
        if (chrome?.bookmarks?.getTree) {
          chrome.bookmarks.getTree((tree) => resolve(tree));
        } else {
          resolve(bookmarks || []);
        }
      });

      let content;
      let filename;
      let mimeType;

      if (format === 'json') {
        content = formatToJson(browserBookmarks);
        filename = `marksyncr-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else {
        content = formatToNetscapeHtml(browserBookmarks);
        filename = `marksyncr-bookmarks-${new Date().toISOString().split('T')[0]}.html`;
        mimeType = 'text/html';
      }

      // Create and download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
      setSaveStatus('exported');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Export failed:', err);
      setImportMessage({ type: 'error', text: `Export failed: ${err.message}` });
    }
  };

  // Import bookmarks
  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const format = detectImportFormat(content);
      
      if (!format) {
        throw new Error('Unable to detect file format. Please use HTML or JSON format.');
      }

      const parsed = parseImportFile(content, format);
      
      // Import to browser bookmarks
      // Detect if we're in Firefox (uses browser.bookmarks with Promises) or Chrome (uses chrome.bookmarks with callbacks)
      const isFirefox = typeof browser !== 'undefined' && browser.bookmarks && typeof browser.bookmarks.create === 'function';
      const bookmarksApi = isFirefox ? browser.bookmarks : chrome?.bookmarks;
      
      if (bookmarksApi?.create) {
        // Helper function to create a bookmark that works in both Chrome and Firefox
        const createBookmark = async (options) => {
          if (isFirefox) {
            // Firefox uses Promises and different property names
            try {
              return await browser.bookmarks.create(options);
            } catch (err) {
              console.warn('Firefox bookmark creation failed:', err.message);
              return null;
            }
          } else {
            // Chrome uses callbacks
            return new Promise((resolve) => {
              chrome.bookmarks.create(options, (result) => {
                if (chrome.runtime.lastError) {
                  console.warn('Chrome bookmark creation failed:', chrome.runtime.lastError.message);
                  resolve(null);
                } else {
                  resolve(result);
                }
              });
            });
          }
        };

        // Get the bookmarks bar folder ID
        // Chrome uses '1' for bookmarks bar, Firefox uses 'toolbar_____'
        const getBookmarksBarId = async () => {
          if (isFirefox) {
            // Firefox: Get the toolbar folder
            try {
              const tree = await browser.bookmarks.getTree();
              // Find the toolbar folder (usually the second child of root)
              const root = tree[0];
              if (root && root.children) {
                const toolbar = root.children.find(c => c.id === 'toolbar_____' || c.title === 'Bookmarks Toolbar');
                if (toolbar) return toolbar.id;
                // Fallback to menu folder
                const menu = root.children.find(c => c.id === 'menu________' || c.title === 'Bookmarks Menu');
                if (menu) return menu.id;
              }
              return 'unfiled_____'; // Fallback to Other Bookmarks
            } catch (err) {
              console.warn('Failed to get Firefox bookmarks bar:', err);
              return 'unfiled_____';
            }
          } else {
            return '1'; // Chrome bookmarks bar
          }
        };

        const parentFolderId = await getBookmarksBarId();
        
        // Create an import folder
        const importFolder = await createBookmark({
          title: `Imported ${new Date().toLocaleDateString()}`,
          parentId: parentFolderId,
        });

        if (!importFolder || !importFolder.id) {
          throw new Error('Failed to create import folder');
        }

        // Recursively create bookmarks
        const createBookmarks = async (items, parentId) => {
          if (!items || !Array.isArray(items)) return;
          
          for (const item of items) {
            // Skip null/undefined items
            if (!item) continue;
            
            if (item.type === 'folder' || item.children) {
              // Use nullish coalescing to preserve empty strings
              // Folders need a visible name, so use 'Untitled Folder' only if null/undefined
              const folder = await createBookmark({
                title: item.title ?? 'Untitled Folder',
                parentId,
              });
              if (folder && folder.id && item.children) {
                await createBookmarks(item.children, folder.id);
              }
            } else if (item.url) {
              // Use nullish coalescing to preserve empty strings
              // Empty titles will display as the URL in the browser
              await createBookmark({
                title: item.title ?? '',
                url: item.url,
                parentId,
              });
            }
          }
        };

        await createBookmarks(parsed.bookmarks, importFolder.id);
      }

      setShowImportModal(false);
      setImportMessage({ type: 'success', text: `Successfully imported ${parsed.totalCount} bookmarks` });
      setTimeout(() => setImportMessage(null), 3000);
    } catch (err) {
      console.error('Import failed:', err);
      setImportMessage({ type: 'error', text: `Import failed: ${err.message}` });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Reset sync data
  const handleReset = async () => {
    try {
      // Clear local storage
      if (chrome?.storage?.local) {
        await new Promise((resolve) => {
          chrome.storage.local.clear(resolve);
        });
      }
      
      setShowResetModal(false);
      setSaveStatus('reset');
      setTimeout(() => {
        setSaveStatus(null);
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error('Reset failed:', err);
      setImportMessage({ type: 'error', text: `Reset failed: ${err.message}` });
    }
  };

  // Clear sync cache only (preserves login and settings)
  const handleClearCache = async () => {
    try {
      // Clear only sync-related cache keys, not login credentials or settings
      if (chrome?.storage?.local) {
        await new Promise((resolve) => {
          chrome.storage.local.remove([
            'marksyncr-last-cloud-checksum',
            'marksyncr-tombstones',
            'lastSync',
            'lastSyncTime',
            'syncInProgress'
          ], resolve);
        });
      }
      
      setShowClearCacheModal(false);
      setSaveStatus('cache-cleared');
      setImportMessage({ type: 'success', text: 'Sync cache cleared. Next sync will perform a full comparison.' });
      setTimeout(() => {
        setSaveStatus(null);
        setImportMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Clear cache failed:', err);
      setImportMessage({ type: 'error', text: `Clear cache failed: ${err.message}` });
    }
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
          {/* Sync Destinations */}
          <Section
            title="Sync Destinations"
            description="Manage where your bookmarks sync to"
          >
            <ConnectedServices sources={sources} isAuthenticated={isAuthenticated} />
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
            description="Export, import, or reset your bookmark data (HTML & JSON formats supported)"
          >
            {/* Status Messages */}
            {importMessage && (
              <div className={`mb-4 p-3 rounded-lg ${
                importMessage.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-green-50 border border-green-200 text-green-700'
              }`}>
                {importMessage.text}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setShowExportModal(true)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Export Bookmarks
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Import Bookmarks
              </button>
              <button
                onClick={() => setShowClearCacheModal(true)}
                className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
              >
                Clear Sync Cache
              </button>
              <button
                onClick={() => setShowResetModal(true)}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Reset Sync Data
              </button>
            </div>

            {/* Hidden file input for import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </Section>

          {/* Export Modal */}
          {showExportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Export Bookmarks</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Choose a format to export your bookmarks:
                </p>
                <div className="space-y-2 mb-6">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="exportFormat"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={(e) => setExportFormat(e.target.value)}
                      className="h-4 w-4 text-primary-600"
                    />
                    <div>
                      <div className="font-medium text-slate-900">JSON</div>
                      <div className="text-xs text-slate-500">MarkSyncr format, includes all metadata</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="exportFormat"
                      value="html"
                      checked={exportFormat === 'html'}
                      onChange={(e) => setExportFormat(e.target.value)}
                      className="h-4 w-4 text-primary-600"
                    />
                    <div>
                      <div className="font-medium text-slate-900">HTML</div>
                      <div className="text-xs text-slate-500">Browser standard format, compatible with all browsers</div>
                    </div>
                  </label>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleExport(exportFormat)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Import Modal */}
          {showImportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Import Bookmarks</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Select a bookmark file to import. Supported formats:
                </p>
                <ul className="text-sm text-slate-600 mb-4 list-disc list-inside">
                  <li>HTML (Browser export format)</li>
                  <li>JSON (MarkSyncr format)</li>
                </ul>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowImportModal(false);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                  >
                    Choose File
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reset Modal */}
          {showResetModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-semibold text-red-600 mb-4">Reset Sync Data</h3>
                <p className="text-sm text-slate-600 mb-4">
                  This will clear all sync data and settings. Your browser bookmarks will not be affected.
                </p>
                <p className="text-sm text-red-600 font-medium mb-4">
                  This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                  >
                    Reset Data
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Clear Cache Modal */}
          {showClearCacheModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-semibold text-amber-600 mb-4">Clear Sync Cache</h3>
                <p className="text-sm text-slate-600 mb-4">
                  This will clear the local sync cache, including:
                </p>
                <ul className="text-sm text-slate-600 mb-4 list-disc list-inside">
                  <li>Cached checksums</li>
                  <li>Tombstones (deleted item tracking)</li>
                  <li>Last sync timestamps</li>
                </ul>
                <p className="text-sm text-slate-600 mb-4">
                  Your login, settings, and browser bookmarks will not be affected. The next sync will perform a full comparison with the cloud.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowClearCacheModal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            </div>
          )}

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
