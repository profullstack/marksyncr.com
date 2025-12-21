'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase, getUserSubscription, getUserDevices } from '../../lib/supabase';

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get('checkout');

  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = '/login';
          return;
        }

        setUser(user);

        // Load subscription
        const sub = await getUserSubscription(user.id);
        setSubscription(sub);

        // Load devices
        const devs = await getUserDevices(user.id);
        setDevices(devs);
      } catch (error) {
        console.error('Error loading dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const handleUpgrade = async (plan) => {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval: 'monthly' }),
      });

      const { url, error } = await response.json();

      if (error) {
        alert(error);
        return;
      }

      window.location.href = url;
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

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
          <div className="flex items-center space-x-4">
            <span className="text-sm text-slate-600">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Success message */}
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

        <h1 className="mb-8 text-2xl font-bold text-slate-900">Dashboard</h1>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Subscription Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Subscription
            </h2>
            <div className="mb-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                  subscription?.plan === 'pro'
                    ? 'bg-primary-100 text-primary-700'
                    : subscription?.plan === 'team'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {subscription?.plan?.charAt(0).toUpperCase() +
                  subscription?.plan?.slice(1) || 'Free'}{' '}
                Plan
              </span>
            </div>
            {subscription?.plan === 'free' ? (
              <div className="space-y-2">
                <button
                  onClick={() => handleUpgrade('pro')}
                  className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  Upgrade to Pro - $5/mo
                </button>
                <button
                  onClick={() => handleUpgrade('team')}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Upgrade to Team - $12/mo
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                <p>
                  Status:{' '}
                  <span className="font-medium capitalize">
                    {subscription?.status}
                  </span>
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

          {/* Devices Card */}
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

          {/* Quick Actions Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Quick Actions
            </h2>
            <div className="space-y-3">
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                  <svg
                    className="h-6 w-6 text-slate-600"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <circle cx="12" cy="12" r="10" />
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
                  <svg
                    className="h-6 w-6 text-orange-500"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Firefox Add-on</p>
                  <p className="text-xs text-slate-500">Install for Firefox</p>
                </div>
              </a>
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
        </div>

        {/* Sync Sources Section */}
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Sync Sources
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { name: 'GitHub', icon: 'github', available: true },
              { name: 'Dropbox', icon: 'dropbox', available: true },
              { name: 'Google Drive', icon: 'google', available: true },
              {
                name: 'MarkSyncr Cloud',
                icon: 'cloud',
                available: subscription?.plan !== 'free',
                requiresPro: true,
              },
            ].map((source) => (
              <div
                key={source.name}
                className={`rounded-xl border p-4 ${
                  source.available
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        source.available ? 'bg-slate-100' : 'bg-slate-200'
                      }`}
                    >
                      <svg
                        className={`h-5 w-5 ${source.available ? 'text-slate-600' : 'text-slate-400'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p
                        className={`font-medium ${source.available ? 'text-slate-900' : 'text-slate-400'}`}
                      >
                        {source.name}
                      </p>
                      {source.requiresPro && !source.available && (
                        <p className="text-xs text-slate-400">Pro plan required</p>
                      )}
                    </div>
                  </div>
                  {source.available && (
                    <button className="text-sm text-primary-600 hover:text-primary-700">
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
