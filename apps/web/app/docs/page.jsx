import Link from 'next/link';

export const metadata = {
  title: 'Documentation - MarkSyncr',
  description: 'Documentation and guides for MarkSyncr bookmark sync service',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center space-x-2">
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
            <span className="text-xl font-bold text-slate-900">MarkSyncr</span>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-slate-900">Documentation</h1>
        <p className="mt-2 text-lg text-slate-600">
          Learn how to set up and use MarkSyncr to sync your bookmarks across browsers.
        </p>

        <div className="mt-12 space-y-12">
          {/* Getting Started */}
          <section>
            <h2 className="text-2xl font-bold text-slate-900">Getting Started</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">1. Install the Extension</h3>
                <p className="mt-2 text-slate-600">
                  Download and install the MarkSyncr extension for your browser from the Chrome Web Store, 
                  Firefox Add-ons, or Safari Extensions.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">2. Create an Account</h3>
                <p className="mt-2 text-slate-600">
                  Sign up for a free account to enable sync across devices. You can use email or 
                  sign in with GitHub or Google.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">3. Choose Your Storage</h3>
                <p className="mt-2 text-slate-600">
                  Connect your preferred storage: GitHub repository, Dropbox folder, Google Drive, 
                  local file, or MarkSyncr Cloud (Pro).
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                  <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">4. Start Syncing</h3>
                <p className="mt-2 text-slate-600">
                  Click &quot;Sync Now&quot; to perform your first sync. Your bookmarks will be saved to your 
                  chosen storage and synced across all your browsers.
                </p>
              </div>
            </div>
          </section>

          {/* Storage Options */}
          <section>
            <h2 className="text-2xl font-bold text-slate-900">Storage Options</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">GitHub</h3>
                <p className="mt-2 text-slate-600">
                  Store your bookmarks in a GitHub repository. Great for version control and backup. 
                  Requires a GitHub account and personal access token with repo permissions.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Dropbox</h3>
                <p className="mt-2 text-slate-600">
                  Sync bookmarks to your Dropbox account. Easy setup with OAuth authentication. 
                  Bookmarks are stored as a JSON file in your Dropbox Apps folder.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Google Drive</h3>
                <p className="mt-2 text-slate-600">
                  Use Google Drive for bookmark storage. Integrates with your Google account. 
                  Bookmarks are stored in a dedicated MarkSyncr folder.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Local File</h3>
                <p className="mt-2 text-slate-600">
                  Export bookmarks to a local JSON file. Perfect for manual backup or syncing 
                  via your own cloud storage solution.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">MarkSyncr Cloud (Pro)</h3>
                <p className="mt-2 text-slate-600">
                  Our managed cloud storage with automatic sync, version history, and priority 
                  support. Available with Pro and Team plans.
                </p>
              </div>
            </div>
          </section>

          {/* Features */}
          <section>
            <h2 className="text-2xl font-bold text-slate-900">Features</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Two-Way Sync</h3>
                <p className="mt-2 text-slate-600">
                  Changes made in any browser are synced to all other browsers. Add a bookmark 
                  on your laptop, see it on your desktop instantly.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Conflict Resolution</h3>
                <p className="mt-2 text-slate-600">
                  When the same bookmark is modified in multiple places, MarkSyncr intelligently 
                  merges changes. You can also manually resolve conflicts if needed.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Version History (Pro)</h3>
                <p className="mt-2 text-slate-600">
                  Pro users can view and restore previous versions of their bookmarks. Accidentally 
                  deleted something? Roll back to a previous state.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Folder Structure</h3>
                <p className="mt-2 text-slate-600">
                  Your bookmark folder structure is preserved exactly as you organize it. Toolbar, 
                  menu, and other bookmark folders sync separately.
                </p>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Is my data secure?</h3>
                <p className="mt-2 text-slate-600">
                  Yes! With the free tier, your bookmarks are stored in your own storage provider - 
                  we never see them. With MarkSyncr Cloud, data is encrypted at rest and in transit.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">How often does sync happen?</h3>
                <p className="mt-2 text-slate-600">
                  By default, sync happens every 5 minutes and whenever you make changes. Pro users 
                  get priority sync with faster propagation.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">Can I use multiple storage providers?</h3>
                <p className="mt-2 text-slate-600">
                  Currently, you can use one storage provider at a time. You can switch providers 
                  at any time from the extension settings.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-semibold text-slate-900">What happens if I cancel my subscription?</h3>
                <p className="mt-2 text-slate-600">
                  You can export your bookmarks at any time. If you cancel Pro, you&apos;ll revert to 
                  the free tier and can continue using your own storage providers.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-12 border-t border-slate-200 pt-8">
          <Link href="/" className="text-primary-600 hover:text-primary-700">
            ← Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
