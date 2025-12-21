/**
 * GET /api/subscription
 * Get the current user's subscription status
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

export async function GET(request) {
  const headers = corsHeaders(request, METHODS);
  
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers }
      );
    }

    // Get subscription from database
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (subError && subError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine for free users
      console.error('Subscription fetch error:', subError);
    }

    // Default to free tier if no subscription found
    const tier = subscription?.tier || 'free';
    const isActive = subscription?.status === 'active' || tier === 'free';

    return NextResponse.json({
      subscription: {
        tier,
        status: subscription?.status || 'active',
        isActive,
        isPro: tier === 'pro' && isActive,
        currentPeriodEnd: subscription?.current_period_end || null,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
      },
    }, { headers });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers }
    );
  }
}
