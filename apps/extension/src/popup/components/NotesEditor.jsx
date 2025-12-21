/**
 * @fileoverview Notes Editor component for Pro users
 * Allows adding and editing notes on bookmarks
 */

import React, { useState, useEffect, useRef } from 'react';

// Icons
const NotesIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

const SaveIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
    />
  </svg>
);

const LockIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const ExpandIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
    />
  </svg>
);

const CollapseIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
    />
  </svg>
);

/**
 * Notes display component (read-only)
 */
export function NotesDisplay({ notes, maxLength = 100 }) {
  const [expanded, setExpanded] = useState(false);

  if (!notes) {
    return null;
  }

  const shouldTruncate = notes.length > maxLength;
  const displayText = expanded || !shouldTruncate ? notes : `${notes.slice(0, maxLength)}...`;

  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
      <div className="flex items-start gap-2">
        <NotesIcon className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-800 whitespace-pre-wrap break-words">
            {displayText}
          </p>
          {shouldTruncate && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Notes editor component
 */
export function NotesEditor({
  bookmarkId,
  initialNotes = '',
  onSave,
  isPro = false,
  disabled = false,
  placeholder = 'Add notes about this bookmark...',
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState(null);
  const textareaRef = useRef(null);

  // Update notes when initialNotes changes
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [notes, isEditing]);

  const handleSave = async () => {
    if (notes === initialNotes) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(bookmarkId, notes);
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(initialNotes);
    setIsEditing(false);
    setError(null);
  };

  const handleKeyDown = (e) => {
    // Save on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Cancel on Escape
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Pro feature gate
  if (!isPro) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-slate-500">
          <LockIcon className="h-4 w-4" />
          <span className="text-sm">Notes require Pro subscription</span>
        </div>
      </div>
    );
  }

  // Read-only mode
  if (!isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
            <NotesIcon className="h-4 w-4" />
            Notes
          </label>
          <button
            onClick={() => setIsEditing(true)}
            disabled={disabled}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
          >
            {notes ? 'Edit' : 'Add notes'}
          </button>
        </div>
        
        {notes ? (
          <NotesDisplay notes={notes} />
        ) : (
          <p className="text-sm text-slate-400 italic">No notes added</p>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
          <NotesIcon className="h-4 w-4" />
          Notes
        </label>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-600 p-1"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <CollapseIcon className="h-4 w-4" />
          ) : (
            <ExpandIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isSaving}
        className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none transition-all ${
          isExpanded ? 'min-h-[200px]' : 'min-h-[80px]'
        }`}
        autoFocus
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {notes.length} characters • Ctrl+Enter to save
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <SaveIcon className="h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline notes editor for bookmark list items
 */
export function InlineNotesEditor({
  notes,
  onSave,
  isPro = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedNotes, setEditedNotes] = useState(notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (editedNotes === notes) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editedNotes);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isPro) {
    return null;
  }

  if (!isEditing) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        title={notes ? 'Edit notes' : 'Add notes'}
      >
        <NotesIcon className="h-3 w-3" />
        {notes ? 'Notes' : 'Add note'}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={editedNotes}
        onChange={(e) => setEditedNotes(e.target.value)}
        placeholder="Add a note..."
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
        rows={2}
        autoFocus
      />
      <div className="flex gap-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded bg-primary-600 px-2 py-0.5 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {isSaving ? '...' : 'Save'}
        </button>
        <button
          onClick={() => {
            setEditedNotes(notes || '');
            setIsEditing(false);
          }}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default NotesEditor;
