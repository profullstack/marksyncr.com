/**
 * @fileoverview Pro Features Panel component
 * Displays Pro features section in the extension popup
 */

import React, { useState } from 'react';
import { TagManager, TagSelector } from './TagManager.jsx';
import { NotesEditor } from './NotesEditor.jsx';

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

const ChartIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

/**
 * Collapsible section component
 */
function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false }) {
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
    { icon: SparklesIcon, name: 'Tags & Notes', description: 'Organize with custom tags and notes' },
    { icon: SearchIcon, name: 'Smart Search', description: 'Full-text search with filters' },
    { icon: LinkIcon, name: 'Link Health', description: 'Find and fix broken links' },
    { icon: ChartIcon, name: 'Analytics', description: 'Insights into your bookmarks' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-slate-900 flex items-center gap-2">
        <CrownIcon className="h-5 w-5 text-amber-500" />
        Pro Features
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {features.map((feature) => (
          <div
            key={feature.name}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
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
  // If not Pro, show upgrade banner
  if (!isPro) {
    return (
      <div className="space-y-4">
        <ProUpgradeBanner />
        <ProFeaturesList />
      </div>
    );
  }

  // Pro user view
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

      {/* Tag Manager */}
      <CollapsibleSection title="Manage Tags" icon={SparklesIcon} defaultOpen={false}>
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
              <p className="text-xs text-slate-500 truncate">
                {selectedBookmark.url}
              </p>
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

      {/* Quick links to dashboard features */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href="https://marksyncr.com/dashboard/search"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <SearchIcon className="h-4 w-4 text-primary-600" />
          Smart Search
        </a>
        <a
          href="https://marksyncr.com/dashboard/links"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <LinkIcon className="h-4 w-4 text-primary-600" />
          Link Health
        </a>
        <a
          href="https://marksyncr.com/dashboard/analytics"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <ChartIcon className="h-4 w-4 text-primary-600" />
          Analytics
        </a>
        <a
          href="https://marksyncr.com/dashboard/duplicates"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <SparklesIcon className="h-4 w-4 text-primary-600" />
          Duplicates
        </a>
      </div>
    </div>
  );
}

export default ProFeaturesPanel;
