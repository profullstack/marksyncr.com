/**
 * @fileoverview Import/Export component for bookmark data
 * Pro feature: Import from various services and export to multiple formats
 */

import { useState, useCallback, useMemo, useRef } from 'react';

/**
 * Import format options
 */
const IMPORT_FORMATS = {
  NETSCAPE_HTML: { id: 'netscape_html', name: 'Browser HTML', ext: '.html' },
  POCKET: { id: 'pocket', name: 'Pocket', ext: '.html' },
  RAINDROP: { id: 'raindrop', name: 'Raindrop.io', ext: '.json' },
  PINBOARD: { id: 'pinboard', name: 'Pinboard', ext: '.json' },
  CSV: { id: 'csv', name: 'CSV', ext: '.csv' },
};

/**
 * Export format options
 */
const EXPORT_FORMATS = {
  HTML: { id: 'html', name: 'HTML (Browser)', ext: '.html', mime: 'text/html' },
  JSON: { id: 'json', name: 'JSON', ext: '.json', mime: 'application/json' },
  CSV: { id: 'csv', name: 'CSV', ext: '.csv', mime: 'text/csv' },
  MARKDOWN: { id: 'markdown', name: 'Markdown', ext: '.md', mime: 'text/markdown' },
};

/**
 * File upload dropzone component
 */
export function FileDropzone({ onFileSelect, acceptedFormats, className = '' }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                 ${
                   isDragging
                     ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                     : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                 } ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        onChange={handleFileChange}
        className="hidden"
      />
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
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Drop your bookmark file here, or click to browse
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Supports: HTML, JSON, CSV
      </p>
    </div>
  );
}

/**
 * Import preview component
 */
export function ImportPreview({ data, onConfirm, onCancel, className = '' }) {
  const [selectedFolders, setSelectedFolders] = useState(new Set());
  const [mergeStrategy, setMergeStrategy] = useState('merge');

  const stats = useMemo(() => {
    const countItems = (items) => {
      let bookmarks = 0;
      let folders = 0;
      for (const item of items) {
        if (item.type === 'folder' || item.children) {
          folders++;
          const childStats = countItems(item.children || []);
          bookmarks += childStats.bookmarks;
          folders += childStats.folders;
        } else {
          bookmarks++;
        }
      }
      return { bookmarks, folders };
    };
    return countItems(data.bookmarks);
  }, [data]);

  const toggleFolder = (folderId) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderTree = (items, depth = 0) => {
    return items.map((item) => {
      if (item.type === 'folder' || item.children) {
        const isSelected = selectedFolders.has(item.id);
        return (
          <div key={item.id} style={{ marginLeft: depth * 16 }}>
            <label className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleFolder(item.id)}
                className="h-4 w-4 text-blue-600 rounded border-gray-300"
              />
              <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-300">{item.title}</span>
              <span className="text-xs text-gray-400">
                ({item.children?.length || 0} items)
              </span>
            </label>
            {item.children && renderTree(item.children, depth + 1)}
          </div>
        );
      }
      return null;
    });
  };

  return (
    <div className={`${className}`}>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.bookmarks}</div>
          <div className="text-xs text-blue-600">Bookmarks</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.folders}</div>
          <div className="text-xs text-yellow-600">Folders</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{data.format}</div>
          <div className="text-xs text-green-600">Format</div>
        </div>
      </div>

      {/* Merge Strategy */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Import Strategy
        </label>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mergeStrategy"
              value="merge"
              checked={mergeStrategy === 'merge'}
              onChange={(e) => setMergeStrategy(e.target.value)}
              className="h-4 w-4 text-blue-600 border-gray-300"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Merge with existing bookmarks
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mergeStrategy"
              value="replace"
              checked={mergeStrategy === 'replace'}
              onChange={(e) => setMergeStrategy(e.target.value)}
              className="h-4 w-4 text-blue-600 border-gray-300"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Replace all existing bookmarks
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mergeStrategy"
              value="folder"
              checked={mergeStrategy === 'folder'}
              onChange={(e) => setMergeStrategy(e.target.value)}
              className="h-4 w-4 text-blue-600 border-gray-300"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Import into new folder
            </span>
          </label>
        </div>
      </div>

      {/* Folder Selection */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select folders to import
        </label>
        <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
          {renderTree(data.bookmarks)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
                     bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm({ mergeStrategy, selectedFolders: Array.from(selectedFolders) })}
          className="flex-1 px-4 py-2 text-sm font-medium text-white
                     bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Import {stats.bookmarks} Bookmarks
        </button>
      </div>
    </div>
  );
}

/**
 * Export options component
 */
export function ExportOptions({ bookmarks, onExport, className = '' }) {
  const [selectedFormat, setSelectedFormat] = useState('html');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [selectedFolders, setSelectedFolders] = useState([]);

  const handleExport = () => {
    onExport({
      format: selectedFormat,
      includeNotes,
      includeTags,
      selectedFolders,
    });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Format Selection */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Export Format
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {Object.values(EXPORT_FORMATS).map((format) => (
            <button
              key={format.id}
              onClick={() => setSelectedFormat(format.id)}
              className={`px-4 py-3 text-sm font-medium rounded-lg border transition-colors
                         ${
                           selectedFormat === format.id
                             ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600'
                             : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300'
                         }`}
            >
              <div className="font-medium">{format.name}</div>
              <div className="text-xs text-gray-400">{format.ext}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Include
        </label>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeTags}
              onChange={(e) => setIncludeTags(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Tags</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-gray-300"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Notes</span>
          </label>
        </div>
      </div>

      {/* Export Button */}
      <button
        onClick={handleExport}
        className="w-full px-4 py-3 text-sm font-medium text-white
                   bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Export Bookmarks
      </button>
    </div>
  );
}

/**
 * Main Import/Export component
 */
export function ImportExport({
  bookmarks,
  onImport,
  onExport,
  isPro = false,
  onUpgradeClick,
  className = '',
}) {
  const [activeTab, setActiveTab] = useState('import');
  const [importData, setImportData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleFileSelect = useCallback(async (file) => {
    setError(null);
    setIsProcessing(true);

    try {
      const content = await file.text();
      // The actual parsing will be done by the parent component
      // Here we just pass the file content
      const result = await onImport(content, 'preview');
      setImportData(result);
    } catch (err) {
      setError(err.message || 'Failed to parse file');
    } finally {
      setIsProcessing(false);
    }
  }, [onImport]);

  const handleConfirmImport = useCallback(async (options) => {
    setIsProcessing(true);
    setError(null);

    try {
      await onImport(importData, 'import', options);
      setSuccess(`Successfully imported ${importData.totalCount} bookmarks`);
      setImportData(null);
    } catch (err) {
      setError(err.message || 'Failed to import bookmarks');
    } finally {
      setIsProcessing(false);
    }
  }, [importData, onImport]);

  const handleExport = useCallback(async (options) => {
    setIsProcessing(true);
    setError(null);

    try {
      await onExport(bookmarks, options);
      setSuccess('Bookmarks exported successfully');
    } catch (err) {
      setError(err.message || 'Failed to export bookmarks');
    } finally {
      setIsProcessing(false);
    }
  }, [bookmarks, onExport]);

  // Show upgrade prompt for non-Pro users
  if (!isPro) {
    return (
      <div className={`${className}`}>
        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
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
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                Upgrade to Pro for Import/Export
              </h4>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Import bookmarks from Pocket, Raindrop.io, Pinboard, and more. Export to HTML, JSON,
                CSV, or Markdown.
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
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors
                     ${
                       activeTab === 'import'
                         ? 'border-blue-500 text-blue-600'
                         : 'border-transparent text-gray-500 hover:text-gray-700'
                     }`}
        >
          Import
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors
                     ${
                       activeTab === 'export'
                         ? 'border-blue-500 text-blue-600'
                         : 'border-transparent text-gray-500 hover:text-gray-700'
                     }`}
        >
          Export
        </button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-600">{success}</p>
        </div>
      )}

      {/* Loading */}
      {isProcessing && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && !isProcessing && (
        <>
          {importData ? (
            <ImportPreview
              data={importData}
              onConfirm={handleConfirmImport}
              onCancel={() => setImportData(null)}
            />
          ) : (
            <>
              <FileDropzone
                onFileSelect={handleFileSelect}
                acceptedFormats=".html,.json,.csv"
              />
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Supported Services
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(IMPORT_FORMATS).map((format) => (
                    <div
                      key={format.id}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <svg
                        className="w-4 h-4 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {format.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && !isProcessing && (
        <ExportOptions bookmarks={bookmarks} onExport={handleExport} />
      )}
    </div>
  );
}

export default ImportExport;
