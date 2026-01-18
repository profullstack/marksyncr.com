/**
 * @fileoverview API routes for managing user tags (Pro feature)
 * GET - List all user tags
 * POST - Create a new tag
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/tags - Get all tags for the authenticated user
 */
export async function GET() {
  try {
    const supabase = await createClient();

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

    // Get user's tags
    const { data: tags, error: tagsError } = await supabase
      .from('user_tags')
      .select('id, name, color, created_at')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }

    return NextResponse.json({ tags: tags || [] });
  } catch (error) {
    console.error('Tags API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/tags - Create a new tag
 * Body: { name: string, color?: string }
 */
export async function POST(request) {
  try {
    const supabase = await createClient();

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
    const { name, color = '#3B82F6' } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    // Normalize tag name
    const normalizedName = name.toLowerCase().trim();

    if (normalizedName.length === 0) {
      return NextResponse.json({ error: 'Tag name cannot be empty' }, { status: 400 });
    }

    if (normalizedName.length > 50) {
      return NextResponse.json(
        { error: 'Tag name must be 50 characters or less' },
        { status: 400 }
      );
    }

    // Validate color format
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!colorRegex.test(color)) {
      return NextResponse.json(
        { error: 'Invalid color format. Use hex format like #3B82F6' },
        { status: 400 }
      );
    }

    // Create the tag
    const { data: tag, error: createError } = await supabase
      .from('user_tags')
      .insert({
        user_id: user.id,
        name: normalizedName,
        color,
      })
      .select('id, name, color, created_at')
      .single();

    if (createError) {
      // Check for duplicate
      if (createError.code === '23505') {
        return NextResponse.json({ error: 'Tag already exists' }, { status: 409 });
      }
      console.error('Error creating tag:', createError);
      return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
    }

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    console.error('Tags API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
