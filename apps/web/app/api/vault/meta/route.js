/**
 * GET  /api/vault/meta - Fetch the caller's vault key material
 * POST /api/vault/meta - Create a vault, or re-wrap it after a password change
 *
 * Authentication: session cookie (web) OR Bearer token (extension)
 *
 * Everything moved through this route is opaque to the server. The wrapped user
 * key can only be opened by a key derived from the master password, which never
 * leaves the device — so these handlers deliberately do no validation of the
 * contents beyond shape and size. There is nothing here for the server to check.
 *
 * The KDF parameters are returned to the client so it can reproduce the
 * derivation. The client refuses to derive below its own floor, so serving
 * weakened parameters from a compromised server does not buy an attacker a
 * cheaper offline guess.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { validateVaultMeta } from '@/lib/vault-validation';

export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, ['GET', 'POST', 'OPTIONS']),
  });
}

export async function GET(request) {
  const headers = corsHeaders(request, ['GET', 'POST', 'OPTIONS']);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const { data, error } = await supabase
      .from('vault_meta')
      .select(
        'kdf, kdf_iterations, kdf_memory_kib, kdf_parallelism, kdf_salt, ' +
          'protected_user_key, protected_user_key_iv, recovery_key_blob, recovery_key_iv, created_at'
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Vault meta fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch vault' }, { status: 500, headers });
    }

    // No vault yet is a normal state for every user who has not made one, not
    // an error — the client uses this to decide between "unlock" and "set up".
    if (!data) {
      return NextResponse.json({ exists: false, meta: null }, { headers });
    }

    return NextResponse.json(
      {
        exists: true,
        meta: {
          kdf: data.kdf,
          iterations: data.kdf_iterations,
          memoryKib: data.kdf_memory_kib,
          parallelism: data.kdf_parallelism,
          salt: data.kdf_salt,
          protectedUserKey: data.protected_user_key,
          protectedUserKeyIv: data.protected_user_key_iv,
          recoveryKeyBlob: data.recovery_key_blob,
          recoveryKeyIv: data.recovery_key_iv,
          createdAt: data.created_at,
        },
      },
      { headers }
    );
  } catch (error) {
    console.error('Vault meta API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * Body: {
 *   kdf, iterations, salt, protectedUserKey, protectedUserKeyIv,
 *   authHash, recoveryKeyBlob?, recoveryKeyIv?
 * }
 */
export async function POST(request) {
  const headers = corsHeaders(request, ['GET', 'POST', 'OPTIONS']);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
    }

    const invalid = validateVaultMeta(body);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400, headers });
    }

    const {
      kdf,
      iterations,
      salt,
      protectedUserKey,
      protectedUserKeyIv,
      authHash,
      recoveryKeyBlob,
      recoveryKeyIv,
    } = body;

    const row = {
      user_id: user.id,
      kdf,
      kdf_iterations: iterations,
      kdf_salt: salt,
      protected_user_key: protectedUserKey,
      protected_user_key_iv: protectedUserKeyIv,
      auth_hash: authHash,
      recovery_key_blob: recoveryKeyBlob || null,
      recovery_key_iv: recoveryKeyIv || null,
      updated_at: new Date().toISOString(),
    };

    // Upsert covers both creating a vault and re-wrapping it after a password
    // change. RLS restricts this to the caller's own row either way.
    const { error } = await supabase.from('vault_meta').upsert(row, { onConflict: 'user_id' });

    if (error) {
      console.error('Vault meta save error:', error);
      return NextResponse.json({ error: 'Failed to save vault' }, { status: 500, headers });
    }

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error('Vault meta API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
