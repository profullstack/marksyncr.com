import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import DeleteAccountSection from './delete-account';

export const metadata = {
  title: 'Settings — MarkSyncr',
};

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Settings</h1>

      <div className="space-y-8">
        {/* Account Info */}
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Account</h2>
          <div className="text-sm text-slate-600">
            <p><span className="font-medium text-slate-700">Email:</span> {user.email}</p>
            <p className="mt-1"><span className="font-medium text-slate-700">User ID:</span> {user.id}</p>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="bg-white rounded-lg border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h2>
          <p className="text-sm text-slate-600 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <DeleteAccountSection />
        </section>
      </div>
    </div>
  );
}
