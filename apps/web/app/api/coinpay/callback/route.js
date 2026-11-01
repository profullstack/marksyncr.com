import { NextResponse } from 'next/server';
import { finishSignIn } from '@profullstack/coinpay-onboard/oauth';
import { saveOpenProfileContact } from '@profullstack/profile';
import { profileStore } from '@/lib/profile';
import { createAdminClient, getUser } from '@/lib/supabase/server';
import {
  coinpayConfig,
  COINPAY_STATE_COOKIE,
  coinpayStateCookieOptions,
  openCoinpayPending,
  sameCoinpayState,
} from '@/lib/coinpay-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const config = coinpayConfig();
  const appUrl = config?.appUrl ?? 'https://marksyncr.com';
  const secure = appUrl.startsWith('https:');
  const done = (result) => {
    const response = NextResponse.redirect(new URL(`/dashboard/settings?coinpay=${result}`, appUrl), 302);
    response.cookies.set(COINPAY_STATE_COOKIE, '', coinpayStateCookieOptions(secure, 0));
    return response;
  };
  if (!config) return done('unavailable');

  const user = await getUser();
  const pending = openCoinpayPending(request.cookies.get(COINPAY_STATE_COOKIE)?.value, config.clientSecret);
  if (
    !user ||
    !pending ||
    pending.userId !== user.id ||
    !sameCoinpayState(pending.state, request.nextUrl.searchParams.get('state'))
  )
    return done('state_error');
  if (request.nextUrl.searchParams.has('error')) return done('denied');

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return done('failed');

  let who;
  try {
    const result = await finishSignIn({
      code,
      verifier: pending.verifier,
      nonce: pending.nonce,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    who = {
      sub: result.sub,
      email: typeof result.email === 'string' ? result.email : null,
      name: typeof result.name === 'string' ? result.name : null,
      openprofile_url: safeOpenProfileUrl(result.userinfo.openprofile_url),
    };
  } catch (error) {
    console.error('[coinpay] link failed:', error instanceof Error ? error.message : error);
    return done('failed');
  }

  const admin = createAdminClient();
  const { data: bySub, error: subjectLookupError } = await admin
    .from('coinpay_identities')
    .select('user_id')
    .eq('sub', who.sub)
    .maybeSingle();
  if (subjectLookupError) return done('failed');
  if (bySub && bySub.user_id !== user.id) return done('already_linked');

  const { data: byUser, error: userLookupError } = await admin
    .from('coinpay_identities')
    .select('sub')
    .eq('user_id', user.id)
    .maybeSingle();
  if (userLookupError) return done('failed');
  if (byUser && byUser.sub !== who.sub) return done('other_account');

  const { error: saveError } = await admin.from('coinpay_identities').upsert(
    {
      user_id: user.id,
      sub: who.sub,
      email: who.email,
      name: who.name,
      openprofile_url: who.openprofile_url,
      linked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (saveError) return done('already_linked');

  if (who.openprofile_url) {
    try {
      await saveOpenProfileContact(profileStore(), user.id, who.openprofile_url);
    } catch (error) {
      console.warn('[coinpay] OpenProfile import skipped:', error instanceof Error ? error.message : error);
    }
  }
  return done('linked');
}

function safeOpenProfileUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
