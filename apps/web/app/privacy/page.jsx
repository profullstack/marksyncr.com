import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Privacy Policy - MarkSyncr',
  description: 'Privacy Policy for MarkSyncr bookmark sync service',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-4xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="mb-8 text-slate-600">Last updated: December 2024</p>

        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">1. Introduction</h2>
            <p className="mb-4 text-slate-600">
              MarkSyncr (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, disclose, and safeguard your 
              information when you use our browser extension and web service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">2. Information We Collect</h2>
            
            <h3 className="mb-2 text-xl font-medium text-slate-800">2.1 Account Information</h3>
            <p className="mb-4 text-slate-600">
              When you create an account, we collect your email address and, if you choose 
              OAuth login, basic profile information from your identity provider (GitHub or Google).
            </p>

            <h3 className="mb-2 text-xl font-medium text-slate-800">2.2 Bookmark Data</h3>
            <p className="mb-4 text-slate-600">
              If you use MarkSyncr Cloud storage (paid tier), your bookmarks are stored on our 
              servers. If you use third-party storage (GitHub, Dropbox, Google Drive), your 
              bookmarks are stored in your own accounts and we do not have access to them.
            </p>

            <h3 className="mb-2 text-xl font-medium text-slate-800">2.3 Usage Data</h3>
            <p className="mb-4 text-slate-600">
              We collect anonymous usage statistics to improve our service, including sync 
              frequency, error rates, and feature usage. This data cannot be used to identify you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">3. How We Use Your Information</h2>
            <ul className="mb-4 list-disc pl-6 text-slate-600">
              <li className="mb-2">To provide and maintain our service</li>
              <li className="mb-2">To sync your bookmarks across devices</li>
              <li className="mb-2">To send you important service updates</li>
              <li className="mb-2">To respond to your support requests</li>
              <li className="mb-2">To improve our service based on usage patterns</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">4. Data Storage and Security</h2>
            <p className="mb-4 text-slate-600">
              We use industry-standard security measures to protect your data. Your account 
              information is stored securely using Supabase, which provides encryption at rest 
              and in transit.
            </p>
            <p className="mb-4 text-slate-600">
              For users of third-party storage options, your bookmark data is protected by the 
              security measures of your chosen provider (GitHub, Dropbox, or Google Drive).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">5. Third-Party Services</h2>
            <p className="mb-4 text-slate-600">
              We integrate with the following third-party services:
            </p>
            <ul className="mb-4 list-disc pl-6 text-slate-600">
              <li className="mb-2"><strong>Supabase</strong> - Authentication and database</li>
              <li className="mb-2"><strong>Stripe</strong> - Payment processing</li>
              <li className="mb-2"><strong>GitHub, Dropbox, Google Drive</strong> - Optional storage providers</li>
            </ul>
            <p className="mb-4 text-slate-600">
              Each of these services has their own privacy policies that govern their use of your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">6. Your Rights</h2>
            <p className="mb-4 text-slate-600">You have the right to:</p>
            <ul className="mb-4 list-disc pl-6 text-slate-600">
              <li className="mb-2">Access your personal data</li>
              <li className="mb-2">Correct inaccurate data</li>
              <li className="mb-2">Delete your account and associated data</li>
              <li className="mb-2">Export your bookmark data</li>
              <li className="mb-2">Opt out of marketing communications</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">7. Data Retention</h2>
            <p className="mb-4 text-slate-600">
              We retain your account information for as long as your account is active. If you 
              delete your account, we will delete your personal data within 30 days, except 
              where we are required to retain it for legal purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">8. Children&apos;s Privacy</h2>
            <p className="mb-4 text-slate-600">
              Our service is not intended for children under 13 years of age. We do not 
              knowingly collect personal information from children under 13.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">9. Changes to This Policy</h2>
            <p className="mb-4 text-slate-600">
              We may update this Privacy Policy from time to time. We will notify you of any 
              changes by posting the new Privacy Policy on this page and updating the 
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">10. Contact Us</h2>
            <p className="mb-4 text-slate-600">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-slate-600">
              <strong>Email:</strong> privacy@marksyncr.com
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
