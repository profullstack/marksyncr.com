import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - MarkSyncr',
  description: 'Privacy Policy for MarkSyncr bookmark sync service',
};

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: December 21, 2024</p>

        <div className="prose prose-slate mt-8 max-w-none">
          <h2>1. Introduction</h2>
          <p>
            MarkSyncr (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, disclose, and safeguard your 
            information when you use our bookmark synchronization service.
          </p>

          <h2>2. Information We Collect</h2>
          <h3>2.1 Account Information</h3>
          <p>When you create an account, we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (encrypted)</li>
            <li>OAuth tokens for connected services (GitHub, Dropbox, Google Drive)</li>
          </ul>

          <h3>2.2 Bookmark Data</h3>
          <p>
            <strong>Free Tier:</strong> Your bookmarks are stored in your own storage provider 
            (GitHub, Dropbox, Google Drive, or local file). We do not have access to this data.
          </p>
          <p>
            <strong>Pro/Team Tier:</strong> If you use MarkSyncr Cloud storage, your bookmarks 
            are stored encrypted on our servers.
          </p>

          <h3>2.3 Usage Data</h3>
          <p>We automatically collect:</p>
          <ul>
            <li>Browser type and version</li>
            <li>Sync frequency and timing</li>
            <li>Error logs (anonymized)</li>
            <li>Feature usage statistics</li>
          </ul>

          <h2>3. How We Use Your Information</h2>
          <p>We use the collected information to:</p>
          <ul>
            <li>Provide and maintain the bookmark sync service</li>
            <li>Process your subscription payments</li>
            <li>Send service-related communications</li>
            <li>Improve our service and develop new features</li>
            <li>Detect and prevent fraud or abuse</li>
          </ul>

          <h2>4. Data Storage and Security</h2>
          <p>
            We implement industry-standard security measures to protect your data:
          </p>
          <ul>
            <li>All data is encrypted in transit using TLS 1.3</li>
            <li>Bookmark data in MarkSyncr Cloud is encrypted at rest</li>
            <li>OAuth tokens are stored encrypted</li>
            <li>We use Supabase for secure data storage with Row Level Security</li>
          </ul>

          <h2>5. Third-Party Services</h2>
          <p>We integrate with the following third-party services:</p>
          <ul>
            <li><strong>Supabase:</strong> Authentication and database</li>
            <li><strong>Stripe:</strong> Payment processing</li>
            <li><strong>GitHub/Dropbox/Google Drive:</strong> Optional bookmark storage</li>
          </ul>
          <p>
            Each of these services has their own privacy policy. We encourage you to review them.
          </p>

          <h2>6. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. If you delete 
            your account, we will delete your data within 30 days, except where we are required 
            to retain it for legal purposes.
          </p>

          <h2>7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and data</li>
            <li>Export your bookmark data</li>
            <li>Opt out of marketing communications</li>
          </ul>

          <h2>8. Cookies</h2>
          <p>
            We use essential cookies for authentication and session management. We do not use 
            tracking cookies or third-party advertising cookies.
          </p>

          <h2>9. Children&apos;s Privacy</h2>
          <p>
            Our service is not intended for children under 13. We do not knowingly collect 
            personal information from children under 13.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any 
            changes by posting the new Privacy Policy on this page and updating the 
            &quot;Last updated&quot; date.
          </p>

          <h2>11. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at:
          </p>
          <ul>
            <li>Email: privacy@marksyncr.com</li>
          </ul>
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
