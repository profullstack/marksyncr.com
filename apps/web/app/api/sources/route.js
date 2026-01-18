/**
 * Sync Sources API Route
 *
 * GET - Fetch user's connected sync sources
 */

import { NextResponse } from 'next/server';
import { getUser, createClient } from '../../../lib/supabase/server';

/**
 * GET /api/sources
 * Fetch user's connected sync sources
 */
export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    const { data: sources, error } = await supabase
      .from('sync_sources')
      .select(
        'id, provider, provider_username, repository, branch, file_path, connected_at, updated_at'
      )
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching sync sources:', error);
      return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 });
    }

    // Transform to a more extension-friendly format
    const connectedSources = (sources || []).map((source) => ({
      id: source.provider,
      provider: source.provider,
      providerUsername: source.provider_username,
      repository: source.repository,
      branch: source.branch,
      filePath: source.file_path,
      connected: true,
      connectedAt: source.connected_at,
      updatedAt: source.updated_at,
    }));

    return NextResponse.json({ sources: connectedSources });
  } catch (error) {
    console.error('Sources API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
