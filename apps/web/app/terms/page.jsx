import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Terms of Service - MarkSyncr',
  description: 'Terms of Service for MarkSyncr bookmark sync service',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-4xl font-bold text-slate-900">Terms of Service</h1>
        <p className="mb-8 text-slate-600">Last updated: December 2024</p>

        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">1. Acceptance of Terms</h2>
            <p className="mb-4 text-slate-600">
              By accessing or using MarkSyncr (&quot;the Service&quot;), you agree to be bound by
              these Terms of Service. If you do not agree to these terms, please do not use the
              Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">
              2. Description of Service
            </h2>
            <p className="mb-4 text-slate-600">
              MarkSyncr is a browser extension and web service that allows you to synchronize your
              bookmarks across multiple browsers and devices. The Service supports various storage
              options including GitHub, Dropbox, Google Drive, local files, and our managed cloud
              storage.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">3. Account Registration</h2>
            <p className="mb-4 text-slate-600">
              To use certain features of the Service, you must create an account. You agree to:
            </p>
            <ul className="mb-4 list-disc pl-6 text-slate-600">
              <li className="mb-2">Provide accurate and complete registration information</li>
              <li className="mb-2">Maintain the security of your account credentials</li>
              <li className="mb-2">Notify us immediately of any unauthorized access</li>
              <li className="mb-2">Be responsible for all activities under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">4. Subscription Plans</h2>

            <h3 className="mb-2 text-xl font-medium text-slate-800">4.1 Free Plan</h3>
            <p className="mb-4 text-slate-600">
              The free plan allows you to sync bookmarks using your own storage providers (GitHub,
              Dropbox, Google Drive, or local files) at no cost.
            </p>

            <h3 className="mb-2 text-xl font-medium text-slate-800">4.2 Paid Plans</h3>
            <p className="mb-4 text-slate-600">
              Paid plans (Pro and Team) provide access to MarkSyncr Cloud storage and additional
              features. Subscription fees are billed monthly or annually as selected at signup.
            </p>

            <h3 className="mb-2 text-xl font-medium text-slate-800">4.3 Billing</h3>
            <p className="mb-4 text-slate-600">
              Payments are processed through Stripe. By subscribing to a paid plan, you authorize us
              to charge your payment method on a recurring basis until you cancel.
            </p>

            <h3 className="mb-2 text-xl font-medium text-slate-800">4.4 Cancellation</h3>
            <p className="mb-4 text-slate-600">
              You may cancel your subscription at any time. Upon cancellation, you will retain
              access to paid features until the end of your current billing period.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">5. Acceptable Use</h2>
            <p className="mb-4 text-slate-600">You agree not to:</p>
            <ul className="mb-4 list-disc pl-6 text-slate-600">
              <li className="mb-2">Use the Service for any illegal purpose</li>
              <li className="mb-2">Attempt to gain unauthorized access to our systems</li>
              <li className="mb-2">Interfere with or disrupt the Service</li>
              <li className="mb-2">Upload malicious content or malware</li>
              <li className="mb-2">Violate any applicable laws or regulations</li>
              <li className="mb-2">Resell or redistribute the Service without permission</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">6. Intellectual Property</h2>
            <p className="mb-4 text-slate-600">
              The Service, including its original content, features, and functionality, is owned by
              MarkSyncr and is protected by international copyright, trademark, and other
              intellectual property laws.
            </p>
            <p className="mb-4 text-slate-600">
              You retain ownership of your bookmark data. By using the Service, you grant us a
              limited license to store and process your data solely for the purpose of providing the
              Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">7. Third-Party Services</h2>
            <p className="mb-4 text-slate-600">
              The Service integrates with third-party services (GitHub, Dropbox, Google Drive,
              Stripe). Your use of these services is subject to their respective terms of service
              and privacy policies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">
              8. Disclaimer of Warranties
            </h2>
            <p className="mb-4 text-slate-600">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE
              WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">
              9. Limitation of Liability
            </h2>
            <p className="mb-4 text-slate-600">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, MARKSYNCR SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
              DATA, PROFITS, OR GOODWILL.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">10. Indemnification</h2>
            <p className="mb-4 text-slate-600">
              You agree to indemnify and hold harmless MarkSyncr and its officers, directors,
              employees, and agents from any claims, damages, or expenses arising from your use of
              the Service or violation of these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">11. Termination</h2>
            <p className="mb-4 text-slate-600">
              We may terminate or suspend your account and access to the Service immediately,
              without prior notice, for conduct that we believe violates these Terms or is harmful
              to other users, us, or third parties.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">12. Changes to Terms</h2>
            <p className="mb-4 text-slate-600">
              We reserve the right to modify these Terms at any time. We will notify you of
              significant changes by posting a notice on our website or sending you an email. Your
              continued use of the Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">13. Governing Law</h2>
            <p className="mb-4 text-slate-600">
              These Terms shall be governed by and construed in accordance with the laws of the
              State of Delaware, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">14. Contact Us</h2>
            <p className="mb-4 text-slate-600">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-slate-600">
              <strong>Email:</strong> legal@marksyncr.com
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
