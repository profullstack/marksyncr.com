/**
 * /api/sync-key — the user's sync key (seal v2 for GitHub/Dropbox/Google tokens).
 *
 * GET  -> { key: { public_key, private_sealed } | null, sources: [{ provider, access_token, refresh_token }] }
 *         Token values are sealed ("v2:"); only the user's unlocked extension
 *         can open them. Plaintext legacy values are never returned.
 * POST { public_key, private_sealed, reset? } -> registers the key the extension
 *         generated under the user's vault key, and seals this user's legacy
 *         plaintext tokens in the same request.
 */
import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { createAdminClient } from '@/lib/supabase/server';
import { isSealedToken } from '@/lib/sealed-tokens';
import { migrateUserTokens } from '@/lib/sync-key-migrate';

const METHODS = ['GET', 'POST', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, METHODS) });
}

export async function GET(request) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user)
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  const admin = createAdminClient();
  const { data: key } = await admin
    .from('sync_source_keys')
    .select('public_key, private_sealed')
    .eq('user_id', user.id)
    .maybeSingle();
  const { data: rows } = await admin
    .from('sync_sources')
    .select('provider, access_token, refresh_token')
    .eq('user_id', user.id);
  const sources = (rows ?? []).map((r) => ({
    provider: r.provider,
    access_token: isSealedToken(r.access_token) ? r.access_token : null,
    refresh_token: isSealedToken(r.refresh_token) ? r.refresh_token : null,
  }));
  return NextResponse.json({ userId: user.id, key: key ?? null, sources }, { headers });
}

function validRecord(b) {
  const raw = typeof b?.public_key === 'string' ? Buffer.from(b.public_key, 'base64') : null;
  return (
    raw?.length === 65 &&
    raw[0] === 4 &&
    typeof b?.private_sealed?.iv === 'string' &&
    typeof b?.private_sealed?.ciphertext === 'string' &&
    b.private_sealed.ciphertext.length > 0
  );
}

export async function POST(request) {
  const headers = corsHeaders(request, METHODS);
  const { user } = await getAuthenticatedUser(request);
  if (!user)
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  const body = await request.json().catch(() => ({}));
  if (!validRecord(body))
    return NextResponse.json({ error: 'invalid sync key' }, { status: 400, headers });

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('sync_source_keys')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing && body.reset !== true) {
    return NextResponse.json({ error: 'sync key already registered' }, { status: 409, headers });
  }
  const { error } = await admin.from('sync_source_keys').upsert(
    {
      user_id: user.id,
      public_key: body.public_key,
      private_sealed: { iv: body.private_sealed.iv, ciphertext: body.private_sealed.ciphertext },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers });

  const migrated = await migrateUserTokens(admin, user.id, body.public_key);
  return NextResponse.json({ ok: true, migrated }, { headers });
}
