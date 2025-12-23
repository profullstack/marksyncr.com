'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// Feature card component
function FeatureCard({ icon, title, description }) {
  return (
    <div className="card">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-slate-600">{description}</p>
    </div>
  );
}

// Pricing card component
function PricingCard({ name, price, yearlyPrice, description, features, highlighted, cta, isYearly }) {
  const displayPrice = isYearly && yearlyPrice ? yearlyPrice : price;
  const isFree = price === 'Free';
  
  return (
    <div
      className={`card relative ${highlighted ? 'border-primary-500 ring-2 ring-primary-500' : ''}`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-600 px-3 py-1 text-xs font-medium text-white">
          Most Popular
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
      <div className="mt-4 flex items-baseline">
        <span className="text-4xl font-bold text-slate-900">{displayPrice}</span>
        {!isFree && (
          <span className="ml-1 text-slate-600">/{isYearly ? 'year' : 'month'}</span>
        )}
      </div>
      {!isFree && isYearly && yearlyPrice && (
        <p className="mt-1 text-xs text-green-600 font-medium">
          Save {Math.round((1 - (parseInt(yearlyPrice.replace('$', '')) / (parseInt(price.replace('$', '')) * 12))) * 100)}% vs monthly
        </p>
      )}
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <ul className="mt-6 space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <svg
              className="mr-2 h-5 w-5 flex-shrink-0 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm text-slate-600">{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href={highlighted ? '/signup' : '/signup?plan=free'}
        className={`mt-8 block w-full rounded-lg py-2.5 text-center text-sm font-medium transition-colors ${
          highlighted
            ? 'bg-primary-600 text-white hover:bg-primary-700'
            : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

// Source logo component
function SourceLogo({ name, icon }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
        {icon}
      </div>
      <span className="mt-2 text-sm text-slate-600">{name}</span>
    </div>
  );
}

export default function HomePage() {
  const [isYearly, setIsYearly] = useState(false);
  
  return (
    <div className="gradient-bg">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.svg"
              alt="MarkSyncr"
              width={175}
              height={40}
              className="h-10 w-auto"
            />
          </Link>
          <div className="hidden items-center space-x-8 md:flex">
            <Link
              href="#features"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Pricing
            </Link>
            <Link
              href="#sources"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Sources
            </Link>
            <Link
              href="/login"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Log in
            </Link>
            <Link href="/signup" className="btn-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Sync Your Bookmarks
            <span className="gradient-text"> Everywhere</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Keep your bookmarks in sync across Chrome, Firefox, and Safari.
            Store them in GitHub, Dropbox, Google Drive, or our cloud service.
            Your bookmarks, your choice.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/signup" className="btn-primary px-8 py-3 text-base">
              Start Syncing Free
            </Link>
            <Link
              href="#features"
              className="btn-outline px-8 py-3 text-base"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Browser logos */}
        <div className="mt-16 flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center space-x-2 text-slate-400">
            <span className="text-sm">Works with</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            {/* Chrome */}
            <div className="flex flex-col items-center">
              <Image
                src="/icons/browser-chrome.svg"
                alt="Chrome"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <span className="mt-1 text-xs text-slate-500">Chrome</span>
            </div>
            {/* Firefox */}
            <div className="flex flex-col items-center">
              <Image
                src="/icons/browser-firefox.svg"
                alt="Firefox"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <span className="mt-1 text-xs text-slate-500">Firefox</span>
            </div>
            {/* Safari */}
            <div className="flex flex-col items-center">
              <Image
                src="/icons/browser-safari.svg"
                alt="Safari"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <span className="mt-1 text-xs text-slate-500">Safari</span>
            </div>
            {/* Brave */}
            <div className="flex flex-col items-center">
              <Image
                src="/icons/browser-brave.svg"
                alt="Brave"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <span className="mt-1 text-xs text-slate-500">Brave</span>
            </div>
            {/* Opera */}
            <div className="flex flex-col items-center">
              <Image
                src="/icons/browser-opera.svg"
                alt="Opera"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <span className="mt-1 text-xs text-slate-500">Opera</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">
              Everything You Need
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Powerful features to keep your bookmarks organized and synced
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              }
              title="Two-Way Sync"
              description="Changes sync both ways. Edit on any device and see updates everywhere automatically."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              }
              title="Preserve Structure"
              description="Keep your toolbar, menu, and other bookmark folders exactly where they belong."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              }
              title="Your Data, Your Control"
              description="Store bookmarks in your own GitHub, Dropbox, or Google Drive. We never see your data."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              }
              title="Instant Sync"
              description="Changes propagate in seconds. No waiting, no manual refresh needed."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              }
              title="Conflict Resolution"
              description="Smart merging handles conflicts automatically. Never lose a bookmark again."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              }
              title="Cross-Browser"
              description="Works seamlessly across Chrome, Firefox, and Safari with a single account."
            />
          </div>
        </div>
      </section>

      {/* Sources Section */}
      <section id="sources" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">
              Choose Your Storage
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Bring your own storage or use our managed cloud service
            </p>
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-12">
            <SourceLogo
              name="GitHub"
              icon={
                <svg className="h-8 w-8 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              }
            />
            <SourceLogo
              name="Dropbox"
              icon={
                <svg className="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 2l6 3.75L6 9.5 0 5.75 6 2zm12 0l6 3.75-6 3.75-6-3.75L18 2zM0 13.25L6 9.5l6 3.75-6 3.75-6-3.75zm18-3.75l6 3.75-6 3.75-6-3.75 6-3.75zM6 18.25l6-3.75 6 3.75-6 3.75-6-3.75z" />
                </svg>
              }
            />
            <SourceLogo
              name="Google Drive"
              icon={
                <svg className="h-8 w-8" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              }
            />
            <SourceLogo
              name="Import/Export"
              icon={
                <svg className="h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              }
            />
            <SourceLogo
              name="MarkSyncr Cloud"
              icon={
                <svg className="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Start free with your own storage, or upgrade for our managed cloud
            </p>
            
            {/* Billing Toggle */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <span className={`text-sm font-medium ${!isYearly ? 'text-slate-900' : 'text-slate-500'}`}>
                Monthly
              </span>
              <button
                onClick={() => setIsYearly(!isYearly)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isYearly ? 'bg-primary-600' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={isYearly}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isYearly ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${isYearly ? 'text-slate-900' : 'text-slate-500'}`}>
                Yearly
              </span>
              {isYearly && (
                <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Save up to 75%
                </span>
              )}
            </div>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <PricingCard
              name="Free"
              price="Free"
              description="Perfect for personal use"
              features={[
                'Unlimited bookmarks',
                'MarkSyncr Cloud storage',
                'GitHub, Dropbox, Google Drive sync',
                'Import/Export bookmarks',
                'Chrome & Firefox support',
                'Two-way sync',
                'Conflict resolution',
              ]}
              cta="Get Started"
              isYearly={isYearly}
            />
            <PricingCard
              name="Pro"
              price="$5"
              yearlyPrice="$15"
              description="Premium features for power users"
              features={[
                'Everything in Free',
                'Priority sync (faster)',
                'Safari support',
                'Version history (30 days)',
                'Priority support',
              ]}
              highlighted
              cta="Start Free Trial"
              isYearly={isYearly}
            />
            <PricingCard
              name="Team"
              price="$12"
              yearlyPrice="$36"
              description="For teams who want to share bookmarks"
              features={[
                'Everything in Pro',
                'Shared bookmark folders',
                'Team management',
                'Admin controls',
                'Version history (1 year)',
                'Dedicated support',
              ]}
              cta="Contact Sales"
              isYearly={isYearly}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-primary-600 px-8 py-16 text-center">
            <h2 className="text-3xl font-bold text-white">
              Ready to Sync Your Bookmarks?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-primary-100">
              Join thousands of users who keep their bookmarks in sync across
              all their browsers and devices.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-block rounded-lg bg-white px-8 py-3 text-base font-medium text-primary-600 hover:bg-primary-50"
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between md:flex-row">
            <Link href="/" className="flex items-center">
              <Image
                src="/logo.svg"
                alt="MarkSyncr"
                width={150}
                height={35}
                className="h-9 w-auto"
              />
            </Link>
            <div className="mt-4 flex space-x-6 md:mt-0">
              <Link
                href="/privacy"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Terms
              </Link>
              <Link
                href="/docs"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Docs
              </Link>
              <a
                href="https://github.com/profullstack/marksyncr.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                GitHub
              </a>
              <a
                href="https://discord.gg/U7dEXfBA3s"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Discord
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500 md:mt-0">
              © {new Date().getFullYear()} MarkSyncr. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
