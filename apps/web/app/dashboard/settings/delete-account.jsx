'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteAccountSection() {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to delete account');
        return;
      }

      // Account deleted — redirect to home
      router.push('/?deleted=true');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
      >
        Delete Account
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm font-medium text-red-800 mb-2">
          ⚠️ This will permanently delete:
        </p>
        <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
          <li>All your bookmarks and bookmark history</li>
          <li>All synced devices and extensions</li>
          <li>All tags and settings</li>
          <li>Your subscription</li>
          <li>Your account</li>
        </ul>
        <p className="text-sm font-bold text-red-800 mt-3">
          This action cannot be undone.
        </p>
      </div>

      <div>
        <label htmlFor="confirm-delete" className="block text-sm font-medium text-slate-700 mb-1">
          Type <span className="font-mono font-bold">DELETE</span> to confirm:
        </label>
        <input
          id="confirm-delete"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
          disabled={isDeleting}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleDelete}
          disabled={confirmText !== 'DELETE' || isDeleting}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDeleting ? 'Deleting...' : 'Permanently Delete My Account'}
        </button>
        <button
          onClick={() => { setShowConfirm(false); setConfirmText(''); setError(null); }}
          disabled={isDeleting}
          className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
