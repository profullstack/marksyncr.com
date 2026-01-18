/**
 * @fileoverview API routes for managing individual tags (Pro feature)
 * GET - Get a specific tag
 * PATCH - Update a tag
 * DELETE - Delete a tag
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/tags/[tagId] - Get a specific tag
 */
export async function GET(request, { params }) {
  try {
    const supabase = await createClient();
    const { tagId } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the tag (RLS will ensure user can only access their own tags)
    const { data: tag, error: tagError } = await supabase
      .from('user_tags')
      .select('id, name, color, created_at')
      .eq('id', tagId)
      .eq('user_id', user.id)
      .single();

    if (tagError || !tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Tag API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/tags/[tagId] - Update a tag
 * Body: { name?: string, color?: string }
 */
export async function PATCH(request, { params }) {
  try {
    const supabase = await createClient();
    const { tagId } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has Pro features
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .single();

    const hasPro =
      subscription &&
      ['pro', 'team'].includes(subscription.plan) &&
      subscription.status === 'active';

    if (!hasPro) {
      return NextResponse.json(
        { error: 'Tags feature requires Pro subscription', code: 'PRO_REQUIRED' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const updates = {};

    // Validate and add name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        return NextResponse.json({ error: 'Invalid tag name' }, { status: 400 });
      }

      const normalizedName = body.name.toLowerCase().trim();

      if (normalizedName.length === 0) {
        return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 });
      }

      if (normalizedName.length > 50) {
        return NextResponse.json(
          { error: 'Tag name must be 50 characters or less' },
          { status: 400 }
        );
      }

      updates.name = normalizedName;
    }

    // Validate and add color if provided
    if (body.color !== undefined) {
      const colorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!colorRegex.test(body.color)) {
        return NextResponse.json(
          { error: 'Invalid color format. Use hex format like #3B82F6' },
          { status: 400 }
        );
      }
      updates.color = body.color;
    }

    // Check if there's anything to update
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update the tag
    const { data: tag, error: updateError } = await supabase
      .from('user_tags')
      .update(updates)
      .eq('id', tagId)
      .eq('user_id', user.id)
      .select('id, name, color, created_at')
      .single();

    if (updateError) {
      // Check for duplicate name
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
      }
      console.error('Error updating tag:', updateError);
      return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
    }

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Tag API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/tags/[tagId] - Delete a tag
 */
export async function DELETE(request, { params }) {
  try {
    const supabase = await createClient();
    const { tagId } = await params;

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has Pro features
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .single();

    const hasPro =
      subscription &&
      ['pro', 'team'].includes(subscription.plan) &&
      subscription.status === 'active';

    if (!hasPro) {
      return NextResponse.json(
        { error: 'Tags feature requires Pro subscription', code: 'PRO_REQUIRED' },
        { status: 403 }
      );
    }

    // Delete the tag
    const { error: deleteError } = await supabase
      .from('user_tags')
      .delete()
      .eq('id', tagId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting tag:', deleteError);
      return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Tag API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
