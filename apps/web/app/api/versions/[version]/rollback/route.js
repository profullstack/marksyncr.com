/**
 * Rollback API Route
 * POST /api/versions/[version]/rollback - Rollback to this version
 */

import { NextResponse } from 'next/server';
import { createClient, getUser } from '@/lib/supabase/server';

/**
 * POST /api/versions/[version]/rollback
 * Rollback to a specific version
 */
export async function POST(request, { params }) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { version } = await params;
    const targetVersion = parseInt(version, 10);

    if (isNaN(targetVersion)) {
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    }

    const supabase = await createClient();

    // Check if user has a paid plan (rollback is a premium feature)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .single();

    // Allow rollback for all plans, but with different retention limits
    // Free: 5 versions, Pro: 30 versions, Team: 365 versions

    const { data, error } = await supabase.rpc('rollback_to_version', {
      p_user_id: user.id,
      p_target_version: targetVersion,
    });

    if (error) {
      console.error('Failed to rollback:', error);

      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }

      return NextResponse.json({ error: 'Failed to rollback' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      newVersion: {
        id: data.id,
        version: data.version,
        checksum: data.checksum,
        createdAt: data.created_at,
        changeSummary: data.change_summary,
      },
      message: `Successfully rolled back to version ${targetVersion}`,
    });
  } catch (error) {
    console.error('Rollback error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
