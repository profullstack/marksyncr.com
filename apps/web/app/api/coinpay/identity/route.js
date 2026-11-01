import { NextResponse } from 'next/server';
import { createAdminClient, getUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data, error } = await createAdminClient()
    .from('coinpay_identities')
    .select('email, name, openprofile_url, linked_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  const configured = Boolean(process.env['COINPAY_OAUTH_CLIENT_ID'] && process.env['COINPAY_OAUTH_CLIENT_SECRET']);
  return NextResponse.json({ configured, linked: Boolean(data), identity: data ?? null });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { error } = await createAdminClient().from('coinpay_identities').delete().eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'unlink_failed' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
