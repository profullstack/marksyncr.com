/**
 * Stripe Checkout API Route
 *
 * Creates checkout sessions for subscription upgrades.
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Stripe price IDs
const STRIPE_PRICES = {
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
  },
  team: {
    monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
    yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID,
  },
};

/**
 * POST /api/checkout
 * Create a Stripe checkout session
 */
export async function POST(request) {
  try {
    const { plan, interval = 'monthly' } = await request.json();

    // Validate plan
    if (!['pro', 'team'].includes(plan)) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate interval
    if (!['monthly', 'yearly'].includes(interval)) {
      return new Response(JSON.stringify({ error: 'Invalid interval' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get price ID
    const priceId = STRIPE_PRICES[plan]?.[interval];
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Price not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Stripe
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    // Get or create Stripe customer
    let customerId;

    // Check if user already has a customer ID
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (subscription?.stripe_customer_id) {
      customerId = subscription.stripe_customer_id;
    } else {
      // Search for existing customer by email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: user.id,
          },
        });
        customerId = customer.id;
      }

      // Save customer ID
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id);
    }

    // Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: user.id,
      success_url: `${appUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
      subscription_data: {
        metadata: {
          userId: user.id,
          plan,
        },
      },
      metadata: {
        userId: user.id,
        plan,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create checkout session' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
