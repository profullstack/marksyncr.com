import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - MarkSyncr',
  description: 'Terms of Service for MarkSyncr bookmark sync service',
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: December 21, 2024</p>

        <div className="prose prose-slate mt-8 max-w-none">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using MarkSyncr (&quot;the Service&quot;), you agree to be bound by these 
            Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, please do not 
            use the Service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            MarkSyncr is a bookmark synchronization service that allows you to sync your 
            browser bookmarks across multiple browsers and devices. The Service includes:
          </p>
          <ul>
            <li>Browser extensions for Chrome, Firefox, and Safari</li>
            <li>Integration with third-party storage providers (GitHub, Dropbox, Google Drive)</li>
            <li>Optional cloud storage for paid subscribers</li>
            <li>Web dashboard for managing your account and bookmarks</li>
          </ul>

          <h2>3. Account Registration</h2>
          <p>
            To use certain features of the Service, you must create an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate and complete information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
            <li>Be responsible for all activities under your account</li>
          </ul>

          <h2>4. Subscription Plans</h2>
          <h3>4.1 Free Plan</h3>
          <p>
            The Free plan includes unlimited bookmark sync using your own storage providers 
            (GitHub, Dropbox, Google Drive, or local file).
          </p>

          <h3>4.2 Pro Plan</h3>
          <p>
            The Pro plan ($5/month) includes all Free features plus:
          </p>
          <ul>
            <li>MarkSyncr Cloud storage</li>
            <li>Priority sync</li>
            <li>Safari support</li>
            <li>30-day version history</li>
            <li>Priority support</li>
          </ul>

          <h3>4.3 Team Plan</h3>
          <p>
            The Team plan ($12/month per user) includes all Pro features plus:
          </p>
          <ul>
            <li>Shared bookmark folders</li>
            <li>Team management</li>
            <li>Admin controls</li>
            <li>1-year version history</li>
            <li>Dedicated support</li>
          </ul>

          <h2>5. Payment Terms</h2>
          <p>
            For paid subscriptions:
          </p>
          <ul>
            <li>Payments are processed through Stripe</li>
            <li>Subscriptions are billed monthly</li>
            <li>You may cancel at any time; access continues until the end of the billing period</li>
            <li>Refunds are provided at our discretion</li>
          </ul>

          <h2>6. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any illegal purpose</li>
            <li>Attempt to gain unauthorized access to the Service</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Upload malicious content or malware</li>
            <li>Resell or redistribute the Service without permission</li>
            <li>Use automated systems to access the Service excessively</li>
          </ul>

          <h2>7. Intellectual Property</h2>
          <p>
            The Service, including its design, code, and content, is owned by MarkSyncr and 
            protected by intellectual property laws. You retain ownership of your bookmark data.
          </p>

          <h2>8. Third-Party Services</h2>
          <p>
            The Service integrates with third-party services (GitHub, Dropbox, Google Drive, 
            Stripe). Your use of these services is subject to their respective terms and 
            privacy policies.
          </p>

          <h2>9. Data and Privacy</h2>
          <p>
            Your use of the Service is also governed by our{' '}
            <Link href="/privacy" className="text-primary-600 hover:text-primary-700">
              Privacy Policy
            </Link>
            , which describes how we collect, use, and protect your data.
          </p>

          <h2>10. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR 
            IMPLIED. WE DO NOT GUARANTEE THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, 
            OR ERROR-FREE.
          </p>

          <h2>11. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, MARKSYNCR SHALL NOT BE LIABLE FOR ANY 
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING 
            LOSS OF DATA OR PROFITS.
          </p>

          <h2>12. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless MarkSyncr from any claims, damages, or 
            expenses arising from your use of the Service or violation of these Terms.
          </p>

          <h2>13. Termination</h2>
          <p>
            We may terminate or suspend your account at any time for violation of these Terms. 
            You may delete your account at any time through the dashboard.
          </p>

          <h2>14. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. We will notify you of material changes by 
            email or through the Service. Continued use after changes constitutes acceptance.
          </p>

          <h2>15. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of California, USA, without 
            regard to conflict of law principles.
          </p>

          <h2>16. Dispute Resolution</h2>
          <p>
            Any disputes arising from these Terms or the Service shall be resolved through 
            binding arbitration in accordance with the rules of the American Arbitration 
            Association.
          </p>

          <h2>17. Contact Information</h2>
          <p>
            For questions about these Terms, please contact us at:
          </p>
          <ul>
            <li>Email: legal@marksyncr.com</li>
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
