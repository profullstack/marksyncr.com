import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../../lib/auth-helper';

/**
 * GET /api/devices - Get user's devices
 */
export async function GET(request) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (!authResult || !authResult.user || !authResult.supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, supabase } = authResult;

    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false });

    if (error) {
      console.error('Error fetching devices:', error);
      return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
    }

    return NextResponse.json({ devices: devices || [] });
  } catch (err) {
    console.error('Devices GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/devices - Register or update a device
 */
export async function POST(request) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (!authResult || !authResult.user || !authResult.supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, supabase } = authResult;

    const body = await request.json();
    const { deviceId, name, browser, os } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    // Upsert device (insert or update if exists)
    const { data: device, error } = await supabase
      .from('devices')
      .upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          name: name || `${browser || 'Unknown'} on ${os || 'Unknown'}`,
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,device_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error registering device:', error);
      return NextResponse.json({ error: 'Failed to register device' }, { status: 500 });
    }

    return NextResponse.json({ device, message: 'Device registered successfully' });
  } catch (err) {
    console.error('Devices POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/devices - Remove a device
 */
export async function DELETE(request) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (!authResult || !authResult.user || !authResult.supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, supabase } = authResult;

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId);

    if (error) {
      console.error('Error deleting device:', error);
      return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Device deleted successfully' });
  } catch (err) {
    console.error('Devices DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
