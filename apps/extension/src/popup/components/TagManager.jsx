/**
 * @fileoverview Tag Manager component for Pro users
 * Allows creating, editing, and managing bookmark tags
 */

import React, { useState, useEffect } from 'react';

// Icons
const TagIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
    />
  </svg>
);

const PlusIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const XIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const EditIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

const TrashIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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

// Default tag colors
const TAG_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

/**
 * Single tag badge component
 */
function TagBadge({ tag, onRemove, onClick, selected = false, editable = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
        selected
          ? 'ring-2 ring-offset-1 ring-primary-500'
          : ''
      }`}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        borderColor: tag.color,
      }}
      onClick={onClick}
    >
      {tag.name}
      {editable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
        >
          <XIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Tag selector for adding tags to bookmarks
 */
export function TagSelector({ tags, selectedTags = [], onTagsChange, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTags = tags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedTags.some((st) => st.id === tag.id)
  );

  const handleAddTag = (tag) => {
    onTagsChange([...selectedTags, tag]);
    setSearchTerm('');
  };

  const handleRemoveTag = (tag) => {
    onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
  };

  if (disabled) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-slate-500">
          <LockIcon className="h-4 w-4" />
          <span className="text-sm">Tags require Pro subscription</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">Tags</label>
      
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1">
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            tag={tag}
            onRemove={handleRemoveTag}
            editable
          />
        ))}
      </div>

      {/* Tag input */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Add tags..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />

        {/* Dropdown */}
        {isOpen && filteredTags.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddTag(tag)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Tag manager panel for creating and managing tags
 */
export function TagManager({ tags, onCreateTag, onUpdateTag, onDeleteTag, isPro = false }) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!newTagName.trim()) {
      setError('Tag name is required');
      return;
    }

    try {
      await onCreateTag({ name: newTagName.trim(), color: newTagColor });
      setNewTagName('');
      setNewTagColor(TAG_COLORS[0]);
      setIsCreating(false);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to create tag');
    }
  };

  const handleUpdate = async () => {
    if (!editingTag || !newTagName.trim()) {
      setError('Tag name is required');
      return;
    }

    try {
      await onUpdateTag(editingTag.id, { name: newTagName.trim(), color: newTagColor });
      setEditingTag(null);
      setNewTagName('');
      setNewTagColor(TAG_COLORS[0]);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to update tag');
    }
  };

  const handleDelete = async (tag) => {
    if (window.confirm(`Delete tag "${tag.name}"?`)) {
      try {
        await onDeleteTag(tag.id);
      } catch (err) {
        setError(err.message || 'Failed to delete tag');
      }
    }
  };

  const startEditing = (tag) => {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setNewTagColor(tag.color);
    setIsCreating(false);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setIsCreating(false);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
    setError(null);
  };

  if (!isPro) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-primary-100 p-3">
            <TagIcon className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-slate-900">Tags & Organization</h3>
            <p className="mt-1 text-sm text-slate-500">
              Organize your bookmarks with custom tags
            </p>
          </div>
          <a
            href="https://marksyncr.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-medium text-slate-900">
          <TagIcon className="h-5 w-5 text-primary-600" />
          Manage Tags
        </h3>
        {!isCreating && !editingTag && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4" />
            New Tag
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create/Edit form */}
      {(isCreating || editingTag) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />

          {/* Color picker */}
          <div className="flex flex-wrap gap-2">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewTagColor(color)}
                className={`h-6 w-6 rounded-full transition-transform ${
                  newTagColor === color ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : ''
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Preview:</span>
            <TagBadge
              tag={{ name: newTagName || 'Tag name', color: newTagColor }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={editingTag ? handleUpdate : handleCreate}
              className="flex-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {editingTag ? 'Update' : 'Create'}
            </button>
            <button
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tags list */}
      <div className="space-y-2">
        {tags.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-4">
            No tags yet. Create your first tag!
          </p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2"
            >
              <TagBadge tag={tag} />
              <div className="flex gap-1">
                <button
                  onClick={() => startEditing(tag)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  title="Edit tag"
                >
                  <EditIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(tag)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Delete tag"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default TagManager;
