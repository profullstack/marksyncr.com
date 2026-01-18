import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Documentation - MarkSyncr',
  description: 'Learn how to use MarkSyncr to sync your bookmarks across browsers',
};

function DocSection({ id, title, children }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="mb-4 text-2xl font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function StepCard({ number, title, description }) {
  return (
    <div className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-600">
        {number}
      </div>
      <div>
        <h4 className="font-medium text-slate-900">{title}</h4>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-4xl font-bold text-slate-900">Documentation</h1>
        <p className="mb-12 text-lg text-slate-600">
          Everything you need to know about syncing your bookmarks with MarkSyncr.
        </p>

        {/* Table of Contents */}
        <nav className="mb-12 rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">On this page</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="#getting-started" className="text-primary-600 hover:text-primary-700">
                Getting Started
              </a>
            </li>
            <li>
              <a href="#storage-options" className="text-primary-600 hover:text-primary-700">
                Storage Options
              </a>
            </li>
            <li>
              <a href="#features" className="text-primary-600 hover:text-primary-700">
                Features
              </a>
            </li>
            <li>
              <a href="#faq" className="text-primary-600 hover:text-primary-700">
                FAQ
              </a>
            </li>
          </ul>
        </nav>

        <DocSection id="getting-started" title="Getting Started">
          <p className="mb-6 text-slate-600">
            Get up and running with MarkSyncr in just a few minutes.
          </p>
          <div className="space-y-4">
            <StepCard
              number="1"
              title="Install the Extension"
              description="Download MarkSyncr from the Chrome Web Store, Firefox Add-ons, or Safari Extensions."
            />
            <StepCard
              number="2"
              title="Create an Account"
              description="Sign up with your email or use GitHub/Google OAuth for quick registration."
            />
            <StepCard
              number="3"
              title="Choose Your Storage"
              description="Select where to store your bookmarks: GitHub, Dropbox, Google Drive, local file, or MarkSyncr Cloud."
            />
            <StepCard
              number="4"
              title="Start Syncing"
              description="Click the sync button or enable automatic sync to keep your bookmarks in sync across all devices."
            />
          </div>
        </DocSection>

        <DocSection id="storage-options" title="Storage Options">
          <p className="mb-6 text-slate-600">
            MarkSyncr supports multiple storage backends. Choose the one that works best for you.
          </p>

          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-2 text-lg font-medium text-slate-900">GitHub</h3>
              <p className="mb-4 text-slate-600">
                Store your bookmarks in a GitHub repository. Great for developers who want version
                control and the ability to view bookmark history.
              </p>
              <ul className="list-disc pl-6 text-sm text-slate-600">
                <li>Free with any GitHub account</li>
                <li>Full version history via Git</li>
                <li>Can be public or private repository</li>
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-2 text-lg font-medium text-slate-900">Dropbox</h3>
              <p className="mb-4 text-slate-600">
                Sync bookmarks through your Dropbox account. Simple setup with automatic cloud
                backup.
              </p>
              <ul className="list-disc pl-6 text-sm text-slate-600">
                <li>Works with free Dropbox accounts</li>
                <li>Automatic cloud backup</li>
                <li>Access bookmarks file from any device</li>
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-2 text-lg font-medium text-slate-900">Google Drive</h3>
              <p className="mb-4 text-slate-600">
                Use your Google Drive storage for bookmark sync. Integrates seamlessly with your
                Google account.
              </p>
              <ul className="list-disc pl-6 text-sm text-slate-600">
                <li>15GB free storage with Google account</li>
                <li>Easy setup with Google OAuth</li>
                <li>Access from Google Drive web interface</li>
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-2 text-lg font-medium text-slate-900">Local File</h3>
              <p className="mb-4 text-slate-600">
                Export and import bookmarks to a local JSON file. Perfect for manual backups or
                offline use.
              </p>
              <ul className="list-disc pl-6 text-sm text-slate-600">
                <li>No account required</li>
                <li>Full control over your data</li>
                <li>Works offline</li>
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="mb-2 text-lg font-medium text-slate-900">MarkSyncr Cloud</h3>
              <span className="mb-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Free
              </span>
              <p className="mb-4 text-slate-600">
                Our managed cloud storage. The easiest option with no setup required - just sign in
                and start syncing.
              </p>
              <ul className="list-disc pl-6 text-sm text-slate-600">
                <li>Fast sync speeds</li>
                <li>5-day version history (30 days on Pro)</li>
                <li>Cross-device sync state</li>
                <li>No configuration needed</li>
              </ul>
            </div>
          </div>
        </DocSection>

        <DocSection id="features" title="Features">
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-lg font-medium text-slate-900">Two-Way Sync</h3>
              <p className="text-slate-600">
                Changes made on any device are automatically synced to all other devices. Add a
                bookmark on your phone, and it appears on your desktop within seconds.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium text-slate-900">Conflict Resolution</h3>
              <p className="text-slate-600">
                When the same bookmark is modified on multiple devices, MarkSyncr intelligently
                merges changes. In rare cases of true conflicts, the most recent change wins, but no
                data is ever lost.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium text-slate-900">Version History</h3>
              <p className="text-slate-600">
                All users get access to version history, allowing you to restore your bookmarks to
                any previous state. Free users get 5 days of history, Pro users get 30 days, and
                Team users get 1 year.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-lg font-medium text-slate-900">Folder Structure</h3>
              <p className="text-slate-600">
                Your bookmark folder structure is preserved exactly as you organize it. Toolbar
                bookmarks, menu bookmarks, and other folders all sync correctly.
              </p>
            </div>
          </div>
        </DocSection>

        <DocSection id="faq" title="Frequently Asked Questions">
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-medium text-slate-900">Is my data secure?</h3>
              <p className="text-slate-600">
                Yes. When using third-party storage (GitHub, Dropbox, Google Drive), your bookmarks
                are stored in your own accounts and we never see them. For MarkSyncr Cloud, all data
                is encrypted at rest and in transit.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-medium text-slate-900">
                Can I use MarkSyncr on multiple browsers?
              </h3>
              <p className="text-slate-600">
                Absolutely! That&apos;s the main purpose of MarkSyncr. Install the extension on
                Chrome, Firefox, and Safari, and your bookmarks will stay in sync across all of
                them.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-medium text-slate-900">
                What happens if I cancel my Pro subscription?
              </h3>
              <p className="text-slate-600">
                You&apos;ll retain access to Pro features until the end of your billing period.
                After that, you can continue using the free tier with your own storage providers.
                Your bookmarks stored in MarkSyncr Cloud will be available for export for 30 days.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-medium text-slate-900">How often does sync happen?</h3>
              <p className="text-slate-600">
                By default, MarkSyncr syncs every 5 minutes when automatic sync is enabled. You can
                also trigger a manual sync at any time by clicking the sync button in the extension
                popup.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-medium text-slate-900">Does MarkSyncr work offline?</h3>
              <p className="text-slate-600">
                Yes. Your bookmarks are always available locally in your browser. When you come back
                online, MarkSyncr will automatically sync any changes you made while offline.
              </p>
            </div>
          </div>
        </DocSection>

        {/* CTA */}
        <div className="rounded-lg bg-primary-50 p-8 text-center">
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Ready to get started?</h2>
          <p className="mb-6 text-slate-600">
            Join thousands of users who keep their bookmarks in sync.
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            Create Free Account
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
