/**
 * Version Detail API Routes
 * GET /api/versions/[version] - Get specific version data
 * POST /api/versions/[version]/rollback - Rollback to this version
 */

import { NextResponse } from 'next/server';
import { createClient, getUser } from '@/lib/supabase/server';

/**
 * GET /api/versions/[version]
 * Get full data for a specific version
 */
export async function GET(request, { params }) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { version } = await params;
    const versionNum = parseInt(version, 10);

    if (isNaN(versionNum)) {
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_version_data', {
      p_user_id: user.id,
      p_version: versionNum,
    });

    if (error) {
      console.error('Failed to get version:', error);
      return NextResponse.json({ error: 'Failed to get version' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({
      version: {
        id: data.id,
        version: data.version,
        bookmarkData: data.bookmark_data,
        checksum: data.checksum,
        sourceType: data.source_type,
        sourceName: data.source_name,
        deviceId: data.device_id,
        deviceName: data.device_name,
        changeSummary: data.change_summary,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('Get version error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
