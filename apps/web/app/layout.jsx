import Script from 'next/script';
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
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MarkSyncr',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180x180.png', sizes: '180x180' },
      { url: '/icons/apple-touch-icon-152x152.png', sizes: '152x152' },
      { url: '/icons/apple-touch-icon-144x144.png', sizes: '144x144' },
      { url: '/icons/apple-touch-icon-120x120.png', sizes: '120x120' },
      { url: '/icons/apple-touch-icon-114x114.png', sizes: '114x114' },
      { url: '/icons/apple-touch-icon-76x76.png', sizes: '76x76' },
      { url: '/icons/apple-touch-icon-72x72.png', sizes: '72x72' },
      { url: '/icons/apple-touch-icon-60x60.png', sizes: '60x60' },
      { url: '/icons/apple-touch-icon-57x57.png', sizes: '57x57' },
    ],
  },
  other: {
    'msapplication-TileColor': '#3b82f6',
    'msapplication-config': '/browserconfig.xml',
    'msapplication-TileImage': '/icons/apple-touch-icon-144x144.png',
  },
};

export const viewport = {
  themeColor: '#3b82f6',
  width: 'device-width',
  initialScale: 1,
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
        {/* iOS Web App */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MarkSyncr" />
        {/* Android */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-white font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
        </div>
        {/* Datafast Analytics */}
        <Script
          defer
          data-website-id="dfid_qELSq3s3DLgYpQ7mz580t"
          data-domain="marksyncr.com"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
        />
        {/* Ahrefs Analytics */}
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="e3x4vMtsZqGec60ygUchcw"
          async
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
