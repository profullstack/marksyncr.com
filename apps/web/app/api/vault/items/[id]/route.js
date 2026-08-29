/**
 * PUT    /api/vault/items/[id] - Replace an item's ciphertext
 * PATCH  /api/vault/items/[id] - Move to trash, or restore from it
 * DELETE /api/vault/items/[id] - Delete permanently, now
 *
 * Authentication: session cookie (web) OR Bearer token (extension)
 *
 * PUT takes the revision the client last read. The database bumps `revision` on
 * every update, so a write built on a stale copy matches no row and comes back
 * as a 409 rather than silently overwriting whatever another device saved. This
 * is the reason vault items are one row each instead of a single blob: two
 * devices editing two different passwords must not cost anyone a credential.
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';
import { validateItemPayload, isUuid, TRASH_RETENTION_DAYS } from '@/lib/vault-validation';

const METHODS = ['PUT', 'PATCH', 'DELETE', 'OPTIONS'];

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, METHODS) });
}

/** Shared preamble: auth, id validation, CORS headers. */
async function begin(request, context) {
  const headers = corsHeaders(request, METHODS);
  const { id } = await context.params;

  if (!isUuid(id)) {
    return { headers, error: NextResponse.json({ error: 'Invalid item id' }, { status: 400, headers }) };
  }

  const { user, supabase } = await getAuthenticatedUser(request);
  if (!user) {
    return { headers, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers }) };
  }

  return { headers, id, user, supabase };
}

/**
 * Body: { type, ciphertext, iv, revision }
 */
export async function PUT(request, context) {
  const ctx = await begin(request, context);
  if (ctx.error) return ctx.error;
  const { headers, id, user, supabase } = ctx;

  try {
    const body = await request.json().catch(() => null);
    const invalid = validateItemPayload({ ...body, id }, { requireId: false });
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400, headers });
    }
    if (!Number.isInteger(body.revision) || body.revision < 1) {
      return NextResponse.json(
        { error: 'A revision is required to update an item' },
        { status: 400, headers }
      );
    }

    const { data, error } = await supabase
      .from('vault_items')
      .update({ type: body.type, ciphertext: body.ciphertext, iv: body.iv })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('revision', body.revision)
      .select('id, type, revision, updated_at')
      .maybeSingle();

    if (error) {
      console.error('Vault item update error:', error);
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500, headers });
    }

    if (!data) {
      // Either the item is gone or somebody else wrote first. Return the
      // current row so the client can merge rather than guess.
      const { data: current } = await supabase
        .from('vault_items')
        .select('id, type, ciphertext, iv, revision, updated_at')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!current) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404, headers });
      }
      return NextResponse.json(
        { error: 'Item was modified elsewhere', code: 'REVISION_CONFLICT', item: current },
        { status: 409, headers }
      );
    }

    return NextResponse.json({ item: data }, { headers });
  } catch (error) {
    console.error('Vault item API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * Body: { action: 'trash' | 'restore' }
 */
export async function PATCH(request, context) {
  const ctx = await begin(request, context);
  if (ctx.error) return ctx.error;
  const { headers, id, user, supabase } = ctx;

  try {
    const body = await request.json().catch(() => null);
    const action = body?.action;

    if (action !== 'trash' && action !== 'restore') {
      return NextResponse.json(
        { error: "action must be 'trash' or 'restore'" },
        { status: 400, headers }
      );
    }

    const patch =
      action === 'trash'
        ? {
            deleted_at: new Date().toISOString(),
            purge_after: new Date(
              Date.now() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
            ).toISOString(),
          }
        : { deleted_at: null, purge_after: null };

    const { data, error } = await supabase
      .from('vault_items')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, revision, deleted_at, purge_after')
      .maybeSingle();

    if (error) {
      console.error('Vault item trash error:', error);
      return NextResponse.json({ error: `Failed to ${action} item` }, { status: 500, headers });
    }
    if (!data) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404, headers });
    }

    return NextResponse.json({ item: data }, { headers });
  } catch (error) {
    console.error('Vault item API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * Permanent deletion. The trash bin is PATCH { action: 'trash' } — this is the
 * irreversible one, used by "delete forever" and by emptying the trash.
 */
export async function DELETE(request, context) {
  const ctx = await begin(request, context);
  if (ctx.error) return ctx.error;
  const { headers, id, user, supabase } = ctx;

  try {
    const { error } = await supabase
      .from('vault_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Vault item delete error:', error);
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500, headers });
    }

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error('Vault item API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
