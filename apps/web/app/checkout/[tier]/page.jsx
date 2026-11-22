import '@profullstack/checkout/checkout.css';
import { Checkout } from '@profullstack/checkout/react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '../../../lib/supabase/server';
import { checkoutFor } from '../../../lib/checkout';

export const metadata = {
  title: 'Checkout - MarkSyncr',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

/**
 * /checkout/pro and /checkout/team: pick one month or one year, then pay on
 * CoinPay. Prefilled from the link (?plan=yearly|monthly&source=...). The form
 * posts to /api/checkout/<tier> and works without JavaScript.
 */
export default async function CheckoutPage({ params, searchParams }) {
  const { tier } = await params;
  const checkout = checkoutFor(tier);
  if (!checkout) notFound();

  const user = await getUser();
  // Signed out: the same place the pricing page has always sent a new buyer.
  if (!user) redirect(`/signup?plan=${tier}`);

  const query = await searchParams;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image src="/logo.svg" alt="MarkSyncr" width={175} height={40} className="h-10 w-auto" />
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Checkout view={checkout.view({ query, account: { email: user.email || '' } })} />
        <p className="mt-2 text-center text-sm text-slate-500">
          <Link href="/pricing" className="text-primary-600 hover:text-primary-700">
            Compare plans
          </Link>
        </p>
      </main>
    </div>
  );
}
