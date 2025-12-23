/**
 * Version Detail API Routes
 * GET /api/versions/[version] - Get specific version data
 * POST /api/versions/[version]/rollback - Rollback to this version
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';

const METHODS = ['GET', 'OPTIONS'];

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request, METHODS),
  });
}

/**
 * GET /api/versions/[version]
 * Get full data for a specific version
 */
export async function GET(request, { params }) {
  const headers = corsHeaders(request, METHODS);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    const { version } = await params;
    const versionNum = parseInt(version, 10);

    if (isNaN(versionNum)) {
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400, headers });
    }

    const { data, error } = await supabase.rpc('get_version_data', {
      p_user_id: user.id,
      p_version: versionNum,
    });

    if (error) {
      console.error('Failed to get version:', error);
      return NextResponse.json({ error: 'Failed to get version' }, { status: 500, headers });
    }

    if (!data) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404, headers });
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
    }, { headers });
  } catch (error) {
    console.error('Get version error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
