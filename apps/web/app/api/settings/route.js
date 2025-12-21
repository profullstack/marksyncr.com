/**
 * GET /api/settings - Get user settings
 * PUT /api/settings - Update user settings
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

/**
 * Helper to get user from authorization header
 */
async function getUserFromAuth(request, supabase) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Authorization header required' };
  }

  const accessToken = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  return { user, error: null };
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
  try {
    const supabase = await createClient();
    const { user, error: authError } = await getUserFromAuth(request, supabase);

    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 }
      );
    }

    // Get settings from database
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Settings fetch error:', settingsError);
    }

    // Return settings or defaults
    return NextResponse.json({
      settings: settings?.settings || DEFAULT_SETTINGS,
    });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const supabase = await createClient();
    const { user, error: authError } = await getUserFromAuth(request, supabase);

    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 }
      );
    }

    const { settings } = await request.json();

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Settings object is required' },
        { status: 400 }
      );
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
      .upsert({
        user_id: user.id,
        settings: mergedSettings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Settings upsert error:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      settings: data.settings,
      message: 'Settings saved successfully',
    });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
