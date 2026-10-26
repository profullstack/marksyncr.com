import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { INVITE_BONUS_PRO_DAYS, INVITE_QUOTA } from '@/lib/credits';
import InvitesManager from './invites-manager';

export const metadata = {
  title: 'Invites — MarkSyncr',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

export default async function InvitesPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <p className="mb-2 text-sm">
        <Link href="/dashboard" className="text-primary-600 hover:text-primary-700">
          ← Dashboard
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Invites</h1>
      <p className="text-sm text-slate-600 mb-8">
        You have {INVITE_QUOTA} invites. Each one works once, for someone new to MarkSyncr. When
        they join and confirm their email, you both get {INVITE_BONUS_PRO_DAYS} days of Pro.
      </p>
      <InvitesManager />
    </div>
  );
}
