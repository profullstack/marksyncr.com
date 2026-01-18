/**
 * @fileoverview Pro Features Panel component
 * Displays Pro features section in the extension popup with actual feature components
 */

import React, { useState, useEffect } from 'react';
import { TagManager, TagSelector } from './TagManager.jsx';
import { NotesEditor } from './NotesEditor.jsx';
import { SmartSearch } from './SmartSearch.jsx';
import { DuplicateDetector } from './DuplicateDetector.jsx';
import { LinkHealthScanner } from './LinkHealthScanner.jsx';
import { useStore } from '../../store/index.js';

// Icons
const CrownIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3l3.5 7L12 6l3.5 4L19 3M5 21h14M5 17h14M5 13h14"
    />
  </svg>
);

const ChevronDownIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const SparklesIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const SearchIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const LinkIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
  </svg>
);

const DuplicateIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

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

/**
 * Collapsible section component
 */
function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-primary-600" />}
          <span className="font-medium text-slate-900">{title}</span>
          {badge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUpIcon className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {isOpen && <div className="p-4 border-t border-slate-200">{children}</div>}
    </div>
  );
}

/**
 * Pro upgrade banner for free users
 */
export function ProUpgradeBanner() {
  return (
    <div className="rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 p-4 text-white">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-white/20 p-2">
          <CrownIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Upgrade to Pro</h3>
          <p className="mt-1 text-sm text-primary-100">
            Unlock tags, notes, smart search, analytics, and more!
          </p>
          <a
            href="https://marksyncr.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors"
          >
            <SparklesIcon className="h-4 w-4" />
            Get Pro for $5/mo
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Pro features list for free users
 */
export function ProFeaturesList() {
  const features = [
    {
      icon: SparklesIcon,
      name: 'Tags & Notes',
      description: 'Organize with custom tags and notes',
    },
    { icon: SearchIcon, name: 'Smart Search', description: 'Full-text search with filters' },
    { icon: LinkIcon, name: 'Link Health', description: 'Find and fix broken links' },
    { icon: DuplicateIcon, name: 'Duplicates', description: 'Find and merge duplicates' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-slate-900 flex items-center gap-2">
        <CrownIcon className="h-5 w-5 text-amber-500" />
        Pro Features
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {features.map((feature) => (
          <div key={feature.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <feature.icon className="h-5 w-5 text-primary-600 mb-2" />
            <h4 className="text-sm font-medium text-slate-900">{feature.name}</h4>
            <p className="text-xs text-slate-500 mt-0.5">{feature.description}</p>
          </div>
        ))}
      </div>
      <a
        href="https://marksyncr.com/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

/**
 * Main Pro Features Panel component
 */
export function ProFeaturesPanel({
  isPro = false,
  tags = [],
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  selectedBookmark = null,
  onSaveBookmarkTags,
  onSaveBookmarkNotes,
}) {
  const {
    bookmarks,
    isLoadingBookmarks,
    fetchBookmarks,
    deleteBookmark,
    updateBookmark,
    scanLinks,
    mergeDuplicates,
    deleteMultipleBookmarks,
    openUpgradePage,
    setSelectedBookmark,
  } = useStore();

  const [activeFeature, setActiveFeature] = useState(null); // 'search' | 'duplicates' | 'links' | 'tags' | null

  // Fetch bookmarks when Pro features are accessed
  useEffect(() => {
    if (isPro && bookmarks.length === 0 && !isLoadingBookmarks) {
      fetchBookmarks();
    }
  }, [isPro, bookmarks.length, isLoadingBookmarks, fetchBookmarks]);

  // Handle bookmark click from search results
  const handleBookmarkClick = (bookmark) => {
    setSelectedBookmark(bookmark);
    setActiveFeature('tags'); // Switch to tags view to edit the bookmark
  };

  // If not Pro, show upgrade banner
  if (!isPro) {
    return (
      <div className="space-y-4">
        <ProUpgradeBanner />
        <ProFeaturesList />
      </div>
    );
  }

  // Pro user view with feature tabs
  return (
    <div className="space-y-3">
      {/* Pro badge */}
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 font-medium">
          <CrownIcon className="h-3 w-3" />
          Pro
        </span>
        <span className="text-slate-500">All features unlocked</span>
      </div>

      {/* Feature Navigation */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveFeature(activeFeature === 'search' ? null : 'search')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeFeature === 'search'
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <SearchIcon className="h-4 w-4" />
          Search
        </button>
        <button
          onClick={() => setActiveFeature(activeFeature === 'duplicates' ? null : 'duplicates')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeFeature === 'duplicates'
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <DuplicateIcon className="h-4 w-4" />
          Duplicates
        </button>
        <button
          onClick={() => setActiveFeature(activeFeature === 'links' ? null : 'links')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeFeature === 'links'
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <LinkIcon className="h-4 w-4" />
          Link Health
        </button>
        <button
          onClick={() => setActiveFeature(activeFeature === 'tags' ? null : 'tags')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeFeature === 'tags'
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <TagIcon className="h-4 w-4" />
          Tags
        </button>
      </div>

      {/* Feature Content */}
      <div className="mt-4">
        {/* Smart Search */}
        {activeFeature === 'search' && (
          <div className="border border-slate-200 rounded-lg p-4">
            <SmartSearch
              bookmarks={bookmarks}
              onBookmarkClick={handleBookmarkClick}
              isPro={isPro}
              onUpgradeClick={openUpgradePage}
            />
          </div>
        )}

        {/* Duplicate Detector */}
        {activeFeature === 'duplicates' && (
          <div className="border border-slate-200 rounded-lg p-4">
            <DuplicateDetector
              bookmarks={bookmarks}
              onMerge={mergeDuplicates}
              onDelete={deleteMultipleBookmarks}
              isPro={isPro}
              onUpgradeClick={openUpgradePage}
            />
          </div>
        )}

        {/* Link Health Scanner */}
        {activeFeature === 'links' && (
          <div className="border border-slate-200 rounded-lg p-4">
            <LinkHealthScanner
              bookmarks={bookmarks}
              onScan={scanLinks}
              onDeleteBookmark={deleteBookmark}
              onUpdateBookmark={updateBookmark}
              isPro={isPro}
              onUpgradeClick={openUpgradePage}
            />
          </div>
        )}

        {/* Tags & Notes Management */}
        {activeFeature === 'tags' && (
          <div className="space-y-4">
            {/* Tag Manager */}
            <CollapsibleSection title="Manage Tags" icon={TagIcon} defaultOpen={!selectedBookmark}>
              <TagManager
                tags={tags}
                onCreateTag={onCreateTag}
                onUpdateTag={onUpdateTag}
                onDeleteTag={onDeleteTag}
                isPro={isPro}
              />
            </CollapsibleSection>

            {/* Selected bookmark editing */}
            {selectedBookmark && (
              <CollapsibleSection title="Edit Bookmark" icon={SparklesIcon} defaultOpen={true}>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-1">
                      {selectedBookmark.title}
                    </h4>
                    <p className="text-xs text-slate-500 truncate">{selectedBookmark.url}</p>
                  </div>

                  <TagSelector
                    tags={tags}
                    selectedTags={selectedBookmark.tags || []}
                    onTagsChange={(newTags) => onSaveBookmarkTags(selectedBookmark.id, newTags)}
                  />

                  <NotesEditor
                    bookmarkId={selectedBookmark.id}
                    initialNotes={selectedBookmark.notes || ''}
                    onSave={onSaveBookmarkNotes}
                    isPro={isPro}
                  />
                </div>
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* Default view when no feature is selected */}
        {!activeFeature && (
          <div className="text-center py-8 text-slate-500">
            <SparklesIcon className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">Select a feature above to get started</p>
            <p className="text-xs mt-1">{bookmarks.length} bookmarks loaded</p>
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {isLoadingBookmarks && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-sm text-slate-500">Loading bookmarks...</span>
        </div>
      )}
    </div>
  );
}

export default ProFeaturesPanel;
