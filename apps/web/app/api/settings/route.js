/**
 * GET /api/settings - Get user settings
 * PUT /api/settings - Update user settings
 *
 * Authentication: Session cookie only (both web and extension use cookies)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Allowed origins for CORS (extension and web app)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://marksyncr.com',
  'https://www.marksyncr.com',
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
];

/**
 * Get CORS origin from request
 */
function getCorsOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  
  // Check if origin matches allowed patterns
  if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    return origin;
  }
  return null;
}

/**
 * Create CORS headers for response
 */
function corsHeaders(request) {
  const origin = getCorsOrigin(request);
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
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
  const headers = corsHeaders(request);
  
  try {
    const supabase = await createClient();
    
    // Session cookie authentication only
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
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
    }, { headers });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}

export async function PUT(request) {
  const headers = corsHeaders(request);
  
  try {
    const supabase = await createClient();
    
    // Session cookie authentication only
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }

    const { settings } = await request.json();

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Settings object is required' },
        { status: 400, headers }
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
        { status: 500, headers }
      );
    }

    return NextResponse.json({
      settings: data.settings,
      message: 'Settings saved successfully',
    }, { headers });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}
