'use client';

import { useState } from 'react';
import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    description: 'Perfect for personal use with your own storage',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      'Unlimited bookmarks',
      'GitHub sync',
      'Dropbox sync',
      'Google Drive sync',
      'Local file backup',
      'Chrome & Firefox support',
      'Two-way sync',
      'Conflict resolution',
    ],
    cta: 'Get Started',
    ctaLink: '/signup',
    highlighted: false,
  },
  {
    name: 'Pro',
    description: 'For power users who want the simplest experience',
    monthlyPrice: 5,
    yearlyPrice: 48,
    features: [
      'Everything in Free',
      'MarkSyncr Cloud storage',
      'Priority sync (faster)',
      'Safari support',
      'Version history (30 days)',
      'Cross-device sync status',
      'Priority email support',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/signup?plan=pro',
    highlighted: true,
  },
  {
    name: 'Team',
    description: 'For teams who need to share bookmarks',
    monthlyPrice: 12,
    yearlyPrice: 120,
    features: [
      'Everything in Pro',
      'Shared bookmark folders',
      'Team management dashboard',
      'Admin controls',
      'Version history (1 year)',
      'SSO integration',
      'Dedicated support',
    ],
    cta: 'Contact Sales',
    ctaLink: '/contact',
    highlighted: false,
  },
];

const faqs = [
  {
    question: 'What storage options are available on the Free plan?',
    answer:
      'The Free plan supports syncing with GitHub repositories, Dropbox, Google Drive, and local files. You bring your own storage, and we handle the sync.',
  },
  {
    question: 'What is MarkSyncr Cloud?',
    answer:
      'MarkSyncr Cloud is our managed storage solution for Pro and Team users. It provides the simplest sync experience with no setup required - just sign in and your bookmarks sync automatically.',
  },
  {
    question: 'Can I switch between plans?',
    answer:
      'Yes! You can upgrade or downgrade at any time. When upgrading, you get immediate access to new features. When downgrading, you keep access until the end of your billing period.',
  },
  {
    question: 'Is there a free trial for Pro?',
    answer:
      'Yes, Pro comes with a 14-day free trial. No credit card required to start. You can cancel anytime during the trial.',
  },
  {
    question: 'What happens to my bookmarks if I cancel?',
    answer:
      'Your bookmarks are always yours. If you cancel Pro, you can export them or continue using the Free plan with your own storage. We never delete your data.',
  },
  {
    question: 'Do you support Safari?',
    answer:
      'Safari support is available on Pro and Team plans. Due to Apple platform requirements, Safari extensions require additional development and maintenance.',
  },
];

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState('monthly');

  const handleCheckout = async (plan) => {
    if (plan === 'Free') {
      window.location.href = '/signup';
      return;
    }

    if (plan === 'Team') {
      window.location.href = '/contact';
      return;
    }

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: plan.toLowerCase(),
          interval: billingInterval,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        // User not logged in, redirect to signup
        window.location.href = `/signup?plan=${plan.toLowerCase()}`;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      window.location.href = `/signup?plan=${plan.toLowerCase()}`;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-xl font-bold text-gray-900">MarkSyncr</span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-600 hover:text-gray-900">
                Sign In
              </Link>
              <Link
                href="/signup"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-xl text-gray-600">
            Start free with your own storage, or upgrade for the simplest cloud experience.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 flex items-center justify-center space-x-4">
            <span
              className={`text-sm ${billingInterval === 'monthly' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
            >
              Monthly
            </span>
            <button
              onClick={() =>
                setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')
              }
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span
              className={`text-sm ${billingInterval === 'yearly' ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
            >
              Yearly
              <span className="ml-1 text-green-600 font-medium">(Save 20%)</span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {plans.map((plan) => {
              const price = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
              const perMonth =
                billingInterval === 'yearly' && plan.yearlyPrice > 0
                  ? Math.round(plan.yearlyPrice / 12)
                  : plan.monthlyPrice;

              return (
                <div
                  key={plan.name}
                  className={`rounded-2xl p-8 ${
                    plan.highlighted
                      ? 'bg-blue-600 text-white ring-4 ring-blue-600 ring-offset-2'
                      : 'bg-white text-gray-900 ring-1 ring-gray-200'
                  }`}
                >
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p
                    className={`mt-2 text-sm ${plan.highlighted ? 'text-blue-100' : 'text-gray-500'}`}
                  >
                    {plan.description}
                  </p>

                  <div className="mt-6">
                    <span className="text-4xl font-bold">${perMonth}</span>
                    {plan.monthlyPrice > 0 && (
                      <span className={plan.highlighted ? 'text-blue-100' : 'text-gray-500'}>
                        /month
                      </span>
                    )}
                    {billingInterval === 'yearly' && plan.yearlyPrice > 0 && (
                      <p
                        className={`mt-1 text-sm ${plan.highlighted ? 'text-blue-100' : 'text-gray-500'}`}
                      >
                        ${price} billed yearly
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleCheckout(plan.name)}
                    className={`mt-6 w-full rounded-lg py-3 px-4 font-medium transition ${
                      plan.highlighted
                        ? 'bg-white text-blue-600 hover:bg-blue-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {plan.cta}
                  </button>

                  <ul className="mt-8 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start">
                        <svg
                          className={`h-5 w-5 flex-shrink-0 ${plan.highlighted ? 'text-blue-200' : 'text-green-500'}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span
                          className={`ml-2 text-sm ${plan.highlighted ? 'text-blue-100' : 'text-gray-600'}`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">Compare Plans</h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="py-4 px-4 text-left text-sm font-medium text-gray-500">Feature</th>
                  <th className="py-4 px-4 text-center text-sm font-medium text-gray-900">Free</th>
                  <th className="py-4 px-4 text-center text-sm font-medium text-blue-600">Pro</th>
                  <th className="py-4 px-4 text-center text-sm font-medium text-gray-900">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { feature: 'Bookmarks', free: 'Unlimited', pro: 'Unlimited', team: 'Unlimited' },
                  { feature: 'GitHub Sync', free: true, pro: true, team: true },
                  { feature: 'Dropbox Sync', free: true, pro: true, team: true },
                  { feature: 'Google Drive Sync', free: true, pro: true, team: true },
                  { feature: 'Local File Backup', free: true, pro: true, team: true },
                  { feature: 'MarkSyncr Cloud', free: false, pro: true, team: true },
                  { feature: 'Chrome Extension', free: true, pro: true, team: true },
                  { feature: 'Firefox Extension', free: true, pro: true, team: true },
                  { feature: 'Safari Extension', free: false, pro: true, team: true },
                  { feature: 'Version History', free: false, pro: '30 days', team: '1 year' },
                  { feature: 'Shared Folders', free: false, pro: false, team: true },
                  { feature: 'Team Management', free: false, pro: false, team: true },
                  { feature: 'SSO', free: false, pro: false, team: true },
                  { feature: 'Support', free: 'Community', pro: 'Priority', team: 'Dedicated' },
                ].map((row) => (
                  <tr key={row.feature}>
                    <td className="py-4 px-4 text-sm text-gray-900">{row.feature}</td>
                    {['free', 'pro', 'team'].map((plan) => (
                      <td key={plan} className="py-4 px-4 text-center">
                        {typeof row[plan] === 'boolean' ? (
                          row[plan] ? (
                            <svg
                              className="h-5 w-5 text-green-500 mx-auto"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-5 w-5 text-gray-300 mx-auto"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )
                        ) : (
                          <span className="text-sm text-gray-600">{row[plan]}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-8">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="text-lg font-medium text-gray-900">{faq.question}</h3>
                <p className="mt-2 text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-blue-600">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white">Ready to sync your bookmarks?</h2>
          <p className="mt-4 text-xl text-blue-100">
            Start free today. No credit card required.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-white text-blue-600 px-8 py-3 rounded-lg font-medium hover:bg-blue-50 transition"
            >
              Get Started Free
            </Link>
            <Link
              href="/"
              className="border border-white text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="text-xl font-bold text-white">MarkSyncr</span>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-6">
              <Link href="/privacy" className="hover:text-white transition">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white transition">
                Terms
              </Link>
              <Link href="/contact" className="hover:text-white transition">
                Contact
              </Link>
            </div>
          </div>
          <div className="mt-8 text-center text-sm">
            © {new Date().getFullYear()} MarkSyncr. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
