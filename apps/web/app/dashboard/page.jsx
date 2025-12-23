import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getUser, createClient } from '../../lib/supabase/server';
import DashboardClient from './dashboard-client';
import SyncSourcesClient from './sync-sources-client';

/**
 * Get user subscription from server
 * @param {string} userId
 */
async function getUserSubscription(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error getting subscription:', error.message);
    return null;
  }

  return data;
}

/**
 * Get user devices from server
 * @param {string} userId
 */
async function getUserDevices(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });

  if (error) {
    console.error('Error getting devices:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get connected sync sources from server
 * @param {string} userId
 */
async function getConnectedSources(userId) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sync_sources')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error getting sync sources:', error.message);
    return [];
  }

  return data || [];
}

export default async function DashboardPage({ searchParams }) {
  const user = await getUser();

  if (!user) {
    redirect('/login');
  }

  const [subscription, devices, connectedSources] = await Promise.all([
    getUserSubscription(user.id),
    getUserDevices(user.id),
    getConnectedSources(user.id),
  ]);

  const params = await searchParams;
  const checkoutStatus = params?.checkout;
  const connectedProvider = params?.connected;
  const errorMessage = params?.error;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
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
          <DashboardClient user={user} />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Success messages */}
        {checkoutStatus === 'success' && (
          <div className="mb-6 rounded-lg bg-green-50 p-4 text-green-700">
            <div className="flex items-center">
              <svg
                className="mr-2 h-5 w-5"
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
              <span>
                Your subscription has been activated! Thank you for upgrading.
              </span>
            </div>
          </div>
        )}

        {connectedProvider && (
          <div className="mb-6 rounded-lg bg-green-50 p-4 text-green-700">
            <div className="flex items-center">
              <svg
                className="mr-2 h-5 w-5"
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
              <span>
                Successfully connected to {connectedProvider.charAt(0).toUpperCase() + connectedProvider.slice(1)}!
              </span>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            <div className="flex items-center">
              <svg
                className="mr-2 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span>
                Connection error: {decodeURIComponent(errorMessage)}
              </span>
            </div>
          </div>
        )}

        <h1 className="mb-8 text-2xl font-bold text-slate-900">Dashboard</h1>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Subscription Card */}
          <SubscriptionCard subscription={subscription} />

          {/* Devices Card */}
          <DevicesCard devices={devices} />

          {/* Quick Actions Card */}
          <QuickActionsCard />
        </div>

        {/* Sync Sources Section */}
        <SyncSourcesClient subscription={subscription} connectedSources={connectedSources} />
      </main>
    </div>
  );
}

function SubscriptionCard({ subscription }) {
  const plan = subscription?.plan || 'free';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Subscription</h2>
      <div className="mb-4">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
            plan === 'pro'
              ? 'bg-primary-100 text-primary-700'
              : plan === 'team'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
        </span>
      </div>
      {plan === 'free' ? (
        <div className="space-y-2">
          <form action="/api/checkout" method="POST">
            <input type="hidden" name="plan" value="pro" />
            <input type="hidden" name="interval" value="monthly" />
            <button
              type="submit"
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Upgrade to Pro - $5/mo
            </button>
          </form>
          <form action="/api/checkout" method="POST">
            <input type="hidden" name="plan" value="team" />
            <input type="hidden" name="interval" value="monthly" />
            <button
              type="submit"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Upgrade to Team - $12/mo
            </button>
          </form>
        </div>
      ) : (
        <div className="text-sm text-slate-600">
          <p>
            Status:{' '}
            <span className="font-medium capitalize">{subscription?.status}</span>
          </p>
          {subscription?.current_period_end && (
            <p>
              Renews:{' '}
              {new Date(subscription.current_period_end).toLocaleDateString()}
            </p>
          )}
          <a
            href="/api/portal"
            className="mt-2 inline-block text-primary-600 hover:text-primary-700"
          >
            Manage subscription →
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Get browser icon path based on browser name
 * @param {string} browser - Browser name (chrome, firefox, safari, edge, opera, brave, etc.)
 * @returns {string} - Path to browser icon SVG
 */
function getBrowserIconPath(browser) {
  const browserLower = browser?.toLowerCase() || '';
  
  if (browserLower === 'chrome') {
    return '/icons/browser-chrome.svg';
  }
  
  if (browserLower === 'firefox') {
    return '/icons/browser-firefox.svg';
  }
  
  if (browserLower === 'safari') {
    return '/icons/browser-safari.svg';
  }
  
  if (browserLower === 'edge') {
    return '/icons/browser-edge.svg';
  }
  
  if (browserLower === 'opera') {
    return '/icons/browser-opera.svg';
  }
  
  if (browserLower === 'brave') {
    return '/icons/browser-brave.svg';
  }
  
  // Default browser icon
  return '/icons/browser-default.svg';
}

/**
 * Browser icon component using Image
 * @param {Object} props - Component props
 * @param {string} props.browser - Browser name
 * @returns {JSX.Element} - Browser icon component
 */
function BrowserIcon({ browser }) {
  const iconPath = getBrowserIconPath(browser);
  const browserName = browser || 'Browser';
  
  return (
    <Image
      src={iconPath}
      alt={browserName}
      width={24}
      height={24}
      className="h-6 w-6"
    />
  );
}

function DevicesCard({ devices }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">
        Connected Devices
      </h2>
      {devices.length === 0 ? (
        <div className="text-center text-slate-500">
          <Image
            src="/icons/browser-default.svg"
            alt="No devices"
            width={48}
            height={48}
            className="mx-auto mb-2 h-12 w-12 opacity-30"
          />
          <p className="text-sm">No devices connected yet</p>
          <p className="mt-1 text-xs">
            Install the browser extension to get started
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
            >
              <div className="flex items-center">
                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-slate-200">
                  <BrowserIcon browser={device.browser} />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{device.name}</p>
                  <p className="text-xs text-slate-500">
                    {device.browser} • {device.os}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(device.last_seen_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickActionsCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Quick Actions</h2>
      <div className="space-y-3">
        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Image
              src="/icons/browser-chrome.svg"
              alt="Chrome"
              width={24}
              height={24}
              className="h-6 w-6"
            />
          </div>
          <div>
            <p className="font-medium text-slate-900">Chrome Extension</p>
            <p className="text-xs text-slate-500">Install for Chrome</p>
          </div>
        </a>
        <a
          href="https://addons.mozilla.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Image
              src="/icons/browser-firefox.svg"
              alt="Firefox"
              width={24}
              height={24}
              className="h-6 w-6"
            />
          </div>
          <div>
            <p className="font-medium text-slate-900">Firefox Add-on</p>
            <p className="text-xs text-slate-500">Install for Firefox</p>
          </div>
        </a>
        <a
          href="https://apps.apple.com/app/safari"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Image
              src="/icons/browser-safari.svg"
              alt="Safari"
              width={24}
              height={24}
              className="h-6 w-6"
            />
          </div>
          <div>
            <p className="font-medium text-slate-900">Safari Extension</p>
            <p className="text-xs text-slate-500">Install for Safari</p>
          </div>
        </a>
        <Link
          href="/dashboard/history"
          className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Image
              src="/icons/icon-clock.svg"
              alt="History"
              width={24}
              height={24}
              className="h-6 w-6"
            />
          </div>
          <div>
            <p className="font-medium text-slate-900">Version History</p>
            <p className="text-xs text-slate-500">View and restore backups</p>
          </div>
        </Link>
        <Link
          href="/docs"
          className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <Image
              src="/icons/icon-book.svg"
              alt="Documentation"
              width={24}
              height={24}
              className="h-6 w-6"
            />
          </div>
          <div>
            <p className="font-medium text-slate-900">Documentation</p>
            <p className="text-xs text-slate-500">Learn how to use MarkSyncr</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

