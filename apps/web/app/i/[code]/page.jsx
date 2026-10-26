import Link from 'next/link';
import Image from 'next/image';
import { getUser } from '@/lib/supabase/server';
import { INVITE_BONUS_PRO_DAYS } from '@/lib/credits';
import InviteLanding from './invite-landing';

export const metadata = {
  title: "You're invited to MarkSyncr",
  description: 'Someone saved you a spot on MarkSyncr, the cross-browser bookmark sync.',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(String(raw ?? '')).trim().slice(0, 64);
  const user = await getUser();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <Link href="/" className="inline-block">
          <Image src="/logo.svg" alt="MarkSyncr" width={175} height={40} className="mx-auto h-10 w-auto" />
        </Link>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">You&apos;re invited</h1>
        <p className="mt-2 text-sm text-slate-600">
          Someone saved you a spot on MarkSyncr: your bookmarks, synced across every browser. Join
          with this invite and you both get {INVITE_BONUS_PRO_DAYS} days of Pro once you confirm
          your email.
        </p>
        <p className="mt-4 font-mono text-sm text-slate-500">{code}</p>
        <InviteLanding code={code} signedIn={Boolean(user)} />
      </div>
    </div>
  );
}
