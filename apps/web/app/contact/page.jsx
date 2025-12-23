import Header from '../../components/Header';
import Footer from '../../components/Footer';

export const metadata = {
  title: 'Contact Us - MarkSyncr',
  description: 'Get in touch with the MarkSyncr team for support, sales inquiries, or feedback',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-4xl font-bold text-slate-900">Contact Us</h1>
        <p className="mb-8 text-lg text-slate-600">
          Have questions, feedback, or need help? We&apos;d love to hear from you.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Contact Information */}
          <div className="space-y-8">
            <section>
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">General Support</h2>
              <p className="mb-2 text-slate-600">
                For general questions and support inquiries:
              </p>
              <a 
                href="mailto:support@marksyncr.com" 
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                support@marksyncr.com
              </a>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">Sales &amp; Enterprise</h2>
              <p className="mb-2 text-slate-600">
                Interested in our Team plan or have enterprise needs?
              </p>
              <a 
                href="mailto:sales@marksyncr.com" 
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                sales@marksyncr.com
              </a>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">Privacy &amp; Security</h2>
              <p className="mb-2 text-slate-600">
                For privacy-related questions or security concerns:
              </p>
              <a 
                href="mailto:privacy@marksyncr.com" 
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                privacy@marksyncr.com
              </a>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">Response Time</h2>
              <p className="text-slate-600">
                We typically respond within 24-48 hours during business days. 
                Pro and Team customers receive priority support with faster response times.
              </p>
            </section>
          </div>

          {/* Additional Resources */}
          <div className="space-y-8">
            <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Quick Links</h2>
              <ul className="space-y-3">
                <li>
                  <a 
                    href="/docs" 
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Documentation
                  </a>
                  <p className="text-sm text-slate-500">
                    Guides and tutorials for getting started
                  </p>
                </li>
                <li>
                  <a 
                    href="/pricing" 
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Pricing
                  </a>
                  <p className="text-sm text-slate-500">
                    Compare plans and features
                  </p>
                </li>
                <li>
                  <a 
                    href="/privacy" 
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Privacy Policy
                  </a>
                  <p className="text-sm text-slate-500">
                    How we handle your data
                  </p>
                </li>
                <li>
                  <a 
                    href="/terms" 
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Terms of Service
                  </a>
                  <p className="text-sm text-slate-500">
                    Our service agreement
                  </p>
                </li>
              </ul>
            </section>

            <section className="rounded-lg bg-blue-50 p-6">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Team Plan Inquiries</h2>
              <p className="mb-4 text-slate-600">
                Looking to set up MarkSyncr for your team? We offer:
              </p>
              <ul className="mb-4 list-disc pl-5 text-slate-600">
                <li>Shared bookmark folders</li>
                <li>Team management dashboard</li>
                <li>Admin controls</li>
                <li>SSO integration</li>
                <li>Dedicated support</li>
              </ul>
              <a 
                href="mailto:sales@marksyncr.com?subject=Team%20Plan%20Inquiry" 
                className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 transition"
              >
                Contact Sales
              </a>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
