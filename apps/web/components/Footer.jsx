'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between md:flex-row">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="MarkSyncr" className="h-6 w-auto" />
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
