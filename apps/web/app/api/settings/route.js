/**
 * GET /api/settings - Get user settings
 * PUT /api/settings - Update user settings
 *
 * Authentication: Session cookie (web) OR Bearer token (extension)
 */

import { NextResponse } from 'next/server';
import { corsHeaders, getAuthenticatedUser } from '@/lib/auth-helper';

const METHODS = ['GET', 'PUT', 'OPTIONS'];

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
 * Default settings for new users
 */
const DEFAULT_SETTINGS = {
  syncEnabled: true,
  syncInterval: 'hourly', // 'manual', 'hourly', 'daily', 'weekly'
  conflictResolution: 'newest', // 'newest', 'oldest', 'manual'
  autoBackup: true,
  notifications: {
    syncComplete: true,
    syncErrors: true,
    duplicatesFound: false,
    brokenLinks: false,
  },
  theme: 'system', // 'light', 'dark', 'system'
};

export async function GET(request) {
  const headers = corsHeaders(request, METHODS);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    // Get settings from database
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Settings fetch error:', settingsError);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500, headers });
    }

    // Return settings or defaults
    return NextResponse.json(
      {
        settings: settings?.settings || DEFAULT_SETTINGS,
      },
      { headers }
    );
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}

export async function PUT(request) {
  const headers = corsHeaders(request, METHODS);

  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
    }

    const { settings } = await request.json();

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Settings object is required' }, { status: 400, headers });
    }

    // Merge with defaults to ensure all fields exist
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(settings.notifications || {}),
      },
    };

    // Upsert settings
    const { data, error: upsertError } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          settings: mergedSettings,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Settings upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500, headers });
    }

    return NextResponse.json(
      {
        settings: data.settings,
        message: 'Settings saved successfully',
      },
      { headers }
    );
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers });
  }
}
