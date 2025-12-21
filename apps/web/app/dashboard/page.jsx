import { redirect } from 'next/navigation';
import Link from 'next/link';
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
          <div className="flex items-center space-x-2">
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
          </div>
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

function DevicesCard({ devices }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">
        Connected Devices
      </h2>
      {devices.length === 0 ? (
        <div className="text-center text-slate-500">
          <svg
            className="mx-auto mb-2 h-12 w-12 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
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
              <div>
                <p className="font-medium text-slate-900">{device.name}</p>
                <p className="text-xs text-slate-500">
                  {device.browser} • {device.os}
                </p>
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
            {/* Chrome Logo */}
            <svg
              className="h-6 w-6"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="24" cy="24" r="20" fill="#4285F4" />
              <path
                d="M24 14C29.523 14 34 18.477 34 24H24V14Z"
                fill="#EA4335"
              />
              <path
                d="M24 14C18.477 14 14 18.477 14 24C14 26.387 14.784 28.588 16.1 30.35L24 24V14Z"
                fill="#FBBC05"
              />
              <path
                d="M16.1 30.35C18.1 33.1 21.3 35 24 35C29.523 35 34 30.523 34 24H24L16.1 30.35Z"
                fill="#34A853"
              />
              <circle cx="24" cy="24" r="8" fill="white" />
              <circle cx="24" cy="24" r="4" fill="#4285F4" />
            </svg>
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
            {/* Firefox Logo */}
            <svg
              className="h-6 w-6"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="firefox-gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF9500" />
                  <stop offset="100%" stopColor="#FF0039" />
                </linearGradient>
                <linearGradient id="firefox-gradient-2" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FF0039" />
                  <stop offset="100%" stopColor="#FF9500" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="20" fill="url(#firefox-gradient-1)" />
              <path
                d="M24 8C15.163 8 8 15.163 8 24C8 32.837 15.163 40 24 40C32.837 40 40 32.837 40 24C40 15.163 32.837 8 24 8ZM24 36C17.373 36 12 30.627 12 24C12 17.373 17.373 12 24 12C30.627 12 36 17.373 36 24C36 30.627 30.627 36 24 36Z"
                fill="url(#firefox-gradient-2)"
                opacity="0.3"
              />
              <path
                d="M32 16C30 14 27 13 24 13C18.477 13 14 17.477 14 23C14 28.523 18.477 33 24 33C29.523 33 34 28.523 34 23C34 20 33 18 32 16Z"
                fill="#FF6611"
              />
              <path
                d="M24 15C20 15 17 18 17 22C17 26 20 29 24 29C28 29 31 26 31 22C31 18 28 15 24 15Z"
                fill="#FFBD4F"
              />
              <ellipse cx="21" cy="20" rx="2" ry="3" fill="white" opacity="0.6" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-slate-900">Firefox Add-on</p>
            <p className="text-xs text-slate-500">Install for Firefox</p>
          </div>
        </a>
        <Link
          href="/dashboard/history"
          className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
        >
          <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <svg
              className="h-6 w-6 text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
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
            <svg
              className="h-6 w-6 text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
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

