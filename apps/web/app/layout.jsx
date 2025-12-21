import './globals.css';

export const metadata = {
  title: 'MarkSyncr - Sync Your Bookmarks Everywhere',
  description:
    'Sync your browser bookmarks across Chrome, Firefox, and Safari using GitHub, Dropbox, Google Drive, or our cloud service.',
  keywords: [
    'bookmarks',
    'sync',
    'browser extension',
    'chrome',
    'firefox',
    'safari',
  ],
  authors: [{ name: 'MarkSyncr' }],
  openGraph: {
    title: 'MarkSyncr - Sync Your Bookmarks Everywhere',
    description:
      'Sync your browser bookmarks across Chrome, Firefox, and Safari using GitHub, Dropbox, Google Drive, or our cloud service.',
    url: 'https://marksyncr.com',
    siteName: 'MarkSyncr',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MarkSyncr - Sync Your Bookmarks Everywhere',
    description:
      'Sync your browser bookmarks across Chrome, Firefox, and Safari using GitHub, Dropbox, Google Drive, or our cloud service.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-white font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
