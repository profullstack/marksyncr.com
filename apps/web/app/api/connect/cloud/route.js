/**
 * MarkSyncr Cloud Connection Route
 *
 * Enables MarkSyncr Cloud storage for the user (requires Pro/Team plan).
 */

import { NextResponse } from 'next/server';
import { getUser, createClient } from '../../../../lib/supabase/server';

export async function POST() {
  try {
    // Verify user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Check if user has a Pro or Team subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      console.error('Error checking subscription:', subError);
      return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 });
    }

    const isPaidPlan =
      subscription?.status === 'active' &&
      (subscription?.plan === 'pro' || subscription?.plan === 'team');

    if (!isPaidPlan) {
      return NextResponse.json(
        { error: 'MarkSyncr Cloud requires a Pro or Team subscription' },
        { status: 403 }
      );
    }

    // Enable MarkSyncr Cloud for the user
    const { error: dbError } = await supabase.from('sync_sources').upsert(
      {
        user_id: user.id,
        provider: 'marksyncr-cloud',
        provider_user_id: user.id,
        provider_username: user.email,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,provider',
      }
    );

    if (dbError) {
      console.error('Database error enabling MarkSyncr Cloud:', dbError);
      return NextResponse.json({ error: 'Failed to enable cloud storage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'MarkSyncr Cloud enabled' });
  } catch (error) {
    console.error('MarkSyncr Cloud connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    // Verify user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Remove MarkSyncr Cloud connection
    const { error: dbError } = await supabase
      .from('sync_sources')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'marksyncr-cloud');

    if (dbError) {
      console.error('Database error disabling MarkSyncr Cloud:', dbError);
      return NextResponse.json({ error: 'Failed to disable cloud storage' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'MarkSyncr Cloud disabled' });
  } catch (error) {
    console.error('MarkSyncr Cloud disconnection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
