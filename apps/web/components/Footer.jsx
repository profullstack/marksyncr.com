'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <Link href="/" className="flex items-center space-x-2">
            <svg
              className="h-6 w-6 text-primary-600"
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
            <span className="font-semibold text-slate-900">MarkSyncr</span>
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
          </div>
          <p className="mt-4 text-sm text-slate-500 md:mt-0">
            © {new Date().getFullYear()} MarkSyncr. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
