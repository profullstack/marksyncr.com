'use client';

import { useTransition } from 'react';
import { signOut } from '../actions/auth';

export default function DashboardClient({ user }) {
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      await signOut();
    });
  };

  return (
    <div className="flex items-center space-x-4">
      <span className="text-sm text-slate-600">{user?.email}</span>
      <button
        onClick={handleSignOut}
        disabled={isPending}
        className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
      >
        {isPending ? 'Signing out...' : 'Sign out'}
      </button>
    </div>
  );
}
