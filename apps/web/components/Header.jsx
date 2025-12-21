'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
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
        <div className="hidden items-center space-x-8 md:flex">
          <Link
            href="/#features"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Features
          </Link>
          <Link
            href="/#pricing"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Pricing
          </Link>
          <Link
            href="/docs"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Docs
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
        {/* Mobile menu button */}
        <div className="md:hidden">
          <Link href="/signup" className="btn-primary text-sm">
            Get Started
          </Link>
        </div>
      </div>
    </nav>
  );
}
