/**
 * Google Drive Disconnect Route
 *
 * Disconnects Google Drive as a sync source for the user.
 */

import { NextResponse } from 'next/server';
import { getUser, createClient } from '../../../../../lib/supabase/server';

export async function DELETE() {
  try {
    // Verify user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Remove Google Drive connection
    const { error: dbError } = await supabase
      .from('sync_sources')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'google-drive');

    if (dbError) {
      console.error('Database error disconnecting Google Drive:', dbError);
      return NextResponse.json({ error: 'Failed to disconnect Google Drive' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Google Drive disconnected' });
  } catch (error) {
    console.error('Google Drive disconnection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
