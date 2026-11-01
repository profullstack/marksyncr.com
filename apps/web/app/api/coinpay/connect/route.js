import { NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/server';
import {
  beginCoinpayLink,
  coinpayConfig,
  COINPAY_STATE_COOKIE,
  coinpayStateCookieOptions,
} from '@/lib/coinpay-oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = coinpayConfig();
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL('/login', config?.appUrl ?? 'https://marksyncr.com'));
  if (!config)
    return NextResponse.redirect(new URL('/dashboard/settings?coinpay=unavailable', 'https://marksyncr.com'));

  const { url, cookie } = beginCoinpayLink(config, user.id);
  const response = NextResponse.redirect(url, 302);
  response.cookies.set(COINPAY_STATE_COOKIE, cookie, coinpayStateCookieOptions(config.appUrl.startsWith('https:')));
  return response;
}
