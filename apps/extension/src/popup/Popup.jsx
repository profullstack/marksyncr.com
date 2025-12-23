import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/index.js';
import { ProFeaturesPanel } from './components/ProFeaturesPanel.jsx';
import { LoginPanel } from './components/LoginPanel.jsx';

// Confirmation Dialog Component using native <dialog> element
function ConfirmDialog({ dialogRef, title, message, confirmText, cancelText, onConfirm, onCancel, variant = 'warning' }) {
  const variantStyles = {
    warning: {
      icon: 'text-orange-500',
      confirmBtn: 'bg-orange-600 hover:bg-orange-700',
      iconBg: 'bg-orange-100',
    },
    danger: {
      icon: 'text-red-500',
      confirmBtn: 'bg-red-600 hover:bg-red-700',
      iconBg: 'bg-red-100',
    },
    info: {
      icon: 'text-blue-500',
      confirmBtn: 'bg-blue-600 hover:bg-blue-700',
      iconBg: 'bg-blue-100',
    },
  };

  const styles = variantStyles[variant] || variantStyles.warning;

  const handleCancel = () => {
    dialogRef.current?.close();
    onCancel?.();
  };

  const handleConfirm = () => {
    dialogRef.current?.close();
    onConfirm?.();
  };

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-sm rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/50"
      onClose={onCancel}
    >
      <div className="p-4">
        <div className="flex items-start space-x-3">
          <div className={`flex-shrink-0 rounded-full p-2 ${styles.iconBg}`}>
            <svg className={`h-5 w-5 ${styles.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{message}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end space-x-2 border-t border-slate-200 bg-slate-50 px-4 py-3 rounded-b-lg">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {cancelText || 'Cancel'}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${styles.confirmBtn}`}
        >
          {confirmText || 'Confirm'}
        </button>
      </div>
    </dialog>
  );
}

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

// Connected services display component
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
    <div className="space-y-2">
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
        <div className="flex items-center justify-between rounded-lg bg-primary-50 p-3 border border-primary-200">
          <div className="flex items-center space-x-2">
            <MarkSyncrIcon className="h-4 w-4 text-primary-600" />
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
              className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
            >
              <div className="flex items-center space-x-2">
                <Icon className="h-4 w-4 text-slate-600" />
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
            className="flex w-full items-center justify-center space-x-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-600"
          >
            <CloudIcon className="h-4 w-4" />
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

// User icon for account tab
const UserIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

// Upload icon for Force Push
const UploadIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
    />
  </svg>
);

// Download icon for Force Pull
const DownloadIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

// Main Popup component
export function Popup() {
  const {
    status,
    lastSync,
    sources,
    stats,
    error,
    triggerSync,
    forcePush,
    forcePull,
    initialize,
    // Pro features
    subscription,
    tags,
    selectedBookmark,
    isPro,
    fetchTags,
    createTag,
    updateTag,
    deleteTag,
    saveBookmarkTags,
    saveBookmarkNotes,
    // Authentication
    user,
    isAuthenticated,
    isAuthLoading,
    authError,
    signupSuccess,
    login,
    signup,
    logout,
  } = useStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState('sync'); // 'sync' | 'pro' | 'account'
  const [exportMessage, setExportMessage] = useState(null);
  const [forceActionMessage, setForceActionMessage] = useState(null);
  const fileInputRef = useRef(null);
  const forcePushDialogRef = useRef(null);
  const forcePullDialogRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      await initialize();
      // Fetch tags if user is Pro
      await fetchTags();
      setIsInitialized(true);
    };
    init();
  }, [initialize, fetchTags]);

  const handleSync = async () => {
    try {
      await triggerSync();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  // Show force push confirmation dialog
  const showForcePushDialog = () => {
    forcePushDialogRef.current?.showModal();
  };

  // Execute force push after confirmation
  const executeForcePush = async () => {
    try {
      setForceActionMessage({ type: 'info', text: 'Force pushing...' });
      await forcePush();
      setForceActionMessage({ type: 'success', text: 'Force push completed! Cloud bookmarks replaced with local.' });
      setTimeout(() => setForceActionMessage(null), 5000);
    } catch (err) {
      console.error('Force push failed:', err);
      setForceActionMessage({ type: 'error', text: `Force push failed: ${err.message}` });
      setTimeout(() => setForceActionMessage(null), 5000);
    }
  };

  // Show force pull confirmation dialog
  const showForcePullDialog = () => {
    forcePullDialogRef.current?.showModal();
  };

  // Execute force pull after confirmation
  const executeForcePull = async () => {
    try {
      setForceActionMessage({ type: 'info', text: 'Force pulling...' });
      await forcePull();
      setForceActionMessage({ type: 'success', text: 'Force pull completed! Local bookmarks replaced with cloud.' });
      setTimeout(() => setForceActionMessage(null), 5000);
    } catch (err) {
      console.error('Force pull failed:', err);
      setForceActionMessage({ type: 'error', text: `Force pull failed: ${err.message}` });
      setTimeout(() => setForceActionMessage(null), 5000);
    }
  };

  const openOptions = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.openOptionsPage();
    } else if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.openOptionsPage();
    }
  };

  /**
   * Export bookmarks to HTML file
   */
  const handleExport = async () => {
    try {
      const browserAPI = typeof chrome !== 'undefined' && chrome.bookmarks ? chrome : browser;
      const tree = await browserAPI.bookmarks.getTree();
      
      // Convert browser bookmarks to exportable format
      const convertNode = (node) => {
        if (node.url) {
          return {
            type: 'bookmark',
            title: node.title || '',
            url: node.url,
            dateAdded: node.dateAdded,
          };
        }
        return {
          type: 'folder',
          title: node.title || '',
          children: (node.children || []).map(convertNode),
          dateAdded: node.dateAdded,
        };
      };

      const bookmarks = tree[0]?.children?.map(convertNode) || [];
      
      // Format to Netscape HTML
      const escapeHtml = (str) => {
        if (!str) return '';
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      };

      const formatItem = (item, indent = '    ') => {
        if (item.type === 'folder' || item.children) {
          const children = (item.children || [])
            .map((child) => formatItem(child, indent + '    '))
            .join('\n');
          
          return `${indent}<DT><H3 ADD_DATE="${Math.floor((item.dateAdded || Date.now()) / 1000)}">${escapeHtml(item.title)}</H3>
${indent}<DL><p>
${children}
${indent}</DL><p>`;
        }

        const addDate = item.dateAdded
          ? ` ADD_DATE="${Math.floor(item.dateAdded / 1000)}"`
          : '';
        
        return `${indent}<DT><A HREF="${escapeHtml(item.url)}"${addDate}>${escapeHtml(item.title)}</A>`;
      };

      const content = bookmarks.map((b) => formatItem(b)).join('\n');
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${content}
</DL><p>`;

      // Create download
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmarks-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportMessage({ type: 'success', text: 'Bookmarks exported successfully!' });
      setTimeout(() => setExportMessage(null), 3000);
    } catch (err) {
      console.error('Export failed:', err);
      setExportMessage({ type: 'error', text: `Export failed: ${err.message}` });
      setTimeout(() => setExportMessage(null), 5000);
    }
  };

  /**
   * Handle import file selection
   */
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Process imported file
   */
  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      
      // Parse Netscape HTML format
      const bookmarks = [];
      
      const parseFolder = (htmlContent) => {
        const items = [];
        const bookmarkRegex = /<DT><A\s+HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
        
        let match;
        while ((match = bookmarkRegex.exec(htmlContent)) !== null) {
          items.push({
            title: match[2] || 'Untitled',
            url: match[1],
          });
        }
        return items;
      };

      const parsedBookmarks = parseFolder(content);
      
      if (parsedBookmarks.length === 0) {
        setExportMessage({ type: 'error', text: 'No bookmarks found in file' });
        setTimeout(() => setExportMessage(null), 5000);
        return;
      }

      // Import bookmarks using browser API
      const browserAPI = typeof chrome !== 'undefined' && chrome.bookmarks ? chrome : browser;
      
      // Create an "Imported" folder
      const importFolder = await browserAPI.bookmarks.create({
        title: `Imported ${new Date().toLocaleDateString()}`,
      });

      // Add bookmarks to the folder
      let importedCount = 0;
      for (const bookmark of parsedBookmarks) {
        try {
          await browserAPI.bookmarks.create({
            parentId: importFolder.id,
            title: bookmark.title,
            url: bookmark.url,
          });
          importedCount++;
        } catch (err) {
          console.warn('Failed to import bookmark:', bookmark.title, err);
        }
      }

      setExportMessage({
        type: 'success',
        text: `Imported ${importedCount} bookmarks!`
      });
      setTimeout(() => setExportMessage(null), 3000);

      // Refresh stats
      await initialize();
    } catch (err) {
      console.error('Import failed:', err);
      setExportMessage({ type: 'error', text: `Import failed: ${err.message}` });
      setTimeout(() => setExportMessage(null), 5000);
    }

    // Reset file input
    event.target.value = '';
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

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('sync')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'sync'
              ? 'border-b-2 border-primary-600 text-primary-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center justify-center gap-1">
            <SyncIcon className="h-4 w-4" />
            Sync
          </div>
        </button>
        <button
          onClick={() => setActiveTab('pro')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'pro'
              ? 'border-b-2 border-primary-600 text-primary-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center justify-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3l3.5 7L12 6l3.5 4L19 3M5 21h14M5 17h14M5 13h14"
              />
            </svg>
            Pro
            {isPro() && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                ✓
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('account')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'account'
              ? 'border-b-2 border-primary-600 text-primary-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <div className="flex items-center justify-center gap-1">
            <UserIcon className="h-4 w-4" />
            Account
            {isAuthenticated && (
              <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
            )}
          </div>
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === 'sync' && (
          <div className="space-y-4">
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

            {/* Connected services display */}
            <ConnectedServices sources={sources} isAuthenticated={isAuthenticated} />

            {/* Sync button */}
            <button
              onClick={handleSync}
              disabled={status === 'syncing' || !isAuthenticated}
              className="flex w-full items-center justify-center space-x-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SyncIcon className="h-5 w-5" spinning={status === 'syncing'} />
              <span>{status === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            {/* Force Push/Pull buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={showForcePushDialog}
                disabled={status === 'syncing' || !isAuthenticated}
                className="flex items-center justify-center space-x-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Overwrite cloud with local bookmarks"
              >
                <UploadIcon className="h-4 w-4" />
                <span>Force Push</span>
              </button>
              <button
                onClick={showForcePullDialog}
                disabled={status === 'syncing' || !isAuthenticated}
                className="flex items-center justify-center space-x-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Overwrite local with cloud bookmarks"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>Force Pull</span>
              </button>
            </div>

            {/* Force action message */}
            {forceActionMessage && (
              <div className={`rounded-lg p-3 text-sm ${
                forceActionMessage.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : forceActionMessage.type === 'error'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-blue-50 text-blue-700'
              }`}>
                {forceActionMessage.text}
              </div>
            )}

            {/* Export/Import message */}
            {exportMessage && (
              <div className={`rounded-lg p-3 text-sm ${
                exportMessage.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {exportMessage.text}
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExport}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Export Bookmarks
              </button>
              <button
                onClick={handleImportClick}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Import Bookmarks
              </button>
              {/* Hidden file input for import */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Version History */}
            <button
              onClick={() => {
                window.open('https://marksyncr.com/dashboard/history', '_blank');
              }}
              className="flex w-full items-center justify-center space-x-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>View Version History</span>
            </button>
          </div>
        )}

        {activeTab === 'pro' && (
          <ProFeaturesPanel
            isPro={isPro()}
            tags={tags}
            onCreateTag={createTag}
            onUpdateTag={updateTag}
            onDeleteTag={deleteTag}
            selectedBookmark={selectedBookmark}
            onSaveBookmarkTags={saveBookmarkTags}
            onSaveBookmarkNotes={saveBookmarkNotes}
          />
        )}

        {activeTab === 'account' && (
          <LoginPanel
            user={user}
            subscription={subscription}
            onLogin={login}
            onSignup={signup}
            onLogout={logout}
            isLoading={isAuthLoading}
            error={authError}
            signupSuccess={signupSuccess}
          />
        )}
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

      {/* Force Push Confirmation Dialog */}
      <ConfirmDialog
        dialogRef={forcePushDialogRef}
        title="Force Push Bookmarks"
        message="This will overwrite ALL cloud bookmarks with your local bookmarks. This action cannot be undone."
        confirmText="Force Push"
        cancelText="Cancel"
        onConfirm={executeForcePush}
        variant="warning"
      />

      {/* Force Pull Confirmation Dialog */}
      <ConfirmDialog
        dialogRef={forcePullDialogRef}
        title="Force Pull Bookmarks"
        message="This will overwrite ALL local bookmarks with cloud bookmarks. This action cannot be undone."
        confirmText="Force Pull"
        cancelText="Cancel"
        onConfirm={executeForcePull}
        variant="info"
      />
    </div>
  );
}
