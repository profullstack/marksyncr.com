/**
 * GET /api/subscription
 * Get the current user's subscription status
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export async function GET(request) {
  const headers = corsHeaders(request);
  
  try {
    const supabase = await createClient();

    // Session cookie authentication only
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
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
