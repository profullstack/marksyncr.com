/**
 * Version History API Routes
 * GET /api/versions - Get version history
 * POST /api/versions - Save a new version
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';

const METHODS = ['GET', 'POST', 'OPTIONS'];

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
 * GET /api/versions
 * Get version history for the authenticated user
 */
export async function GET(request) {
  const headers = corsHeaders(request, METHODS);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { data, error } = await supabase.rpc('get_version_history', {
      p_user_id: user.id,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('Failed to get version history:', error);
      return NextResponse.json({ error: 'Failed to get version history' }, { status: 500, headers });
    }

    // Get retention limit for the user
    const { data: retentionLimit } = await supabase.rpc('get_version_retention_limit', {
      p_user_id: user.id,
    });

    return NextResponse.json({
      versions: (data || []).map((v) => ({
        id: v.id,
        version: v.version,
        checksum: v.checksum,
        sourceType: v.source_type,
        sourceName: v.source_name,
        deviceName: v.device_name,
        changeSummary: v.change_summary,
        createdAt: v.created_at,
        bookmarkCount: v.bookmark_count,
        folderCount: v.folder_count,
      })),
      retentionLimit: retentionLimit || 5,
    }, { headers });
  } catch (error) {
    console.error('Version history error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

/**
 * POST /api/versions
 * Save a new version (called after sync)
 */
export async function POST(request) {
  const headers = corsHeaders(request, METHODS);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    const body = await request.json();
    const { bookmarkData, sourceType, sourceName, deviceId, deviceName, changeSummary } = body;

    if (!bookmarkData || !sourceType) {
      return NextResponse.json(
        { error: 'Missing required fields: bookmarkData, sourceType' },
        { status: 400, headers }
      );
    }

    // Compute checksum
    const { generateChecksum } = await import('@marksyncr/core');
    const checksum = await generateChecksum(bookmarkData);

    const { data, error } = await supabase.rpc('save_bookmark_version', {
      p_user_id: user.id,
      p_bookmark_data: bookmarkData,
      p_checksum: checksum,
      p_source_type: sourceType,
      p_source_name: sourceName || null,
      p_device_id: deviceId || null,
      p_device_name: deviceName || null,
      p_change_summary: changeSummary || {},
    });

    if (error) {
      console.error('Failed to save version:', error);
      return NextResponse.json({ error: 'Failed to save version' }, { status: 500, headers });
    }

    return NextResponse.json({
      version: {
        id: data?.id,
        version: data?.version,
        checksum: data?.checksum,
        createdAt: data?.created_at,
      },
    }, { headers });
  } catch (error) {
    console.error('Save version error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
