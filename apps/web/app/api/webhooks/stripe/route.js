/**
 * Stripe Webhook Handler
 *
 * Handles incoming Stripe webhook events for subscription management.
 */

import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
export async function POST(request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event;

  try {
    // Dynamically import Stripe
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    console.log(`Stripe webhook handled: ${event.type}`, result);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error handling webhook:', err);
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }
}

/**
 * Handle Stripe webhook events
 * @param {object} event - Stripe event
 * @returns {Promise<{handled: boolean, action?: string}>}
 */
async function handleStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      return handleCheckoutCompleted(session);
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      return handleSubscriptionUpdated(subscription);
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      return handleSubscriptionDeleted(subscription);
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      return handlePaymentFailed(invoice);
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      return handlePaymentSucceeded(invoice);
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
      return { handled: false };
  }
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const plan = session.metadata?.plan || 'pro';

  if (!userId) {
    console.error('No user ID in checkout session');
    return { handled: false, error: 'No user ID' };
  }

  // Update subscription in database
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      plan,
      status: 'active',
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  return { handled: true, action: 'subscription_created', userId, plan };
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;

  // Find user by customer ID
  const { data: sub, error: findError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (findError || !sub) {
    console.error('Could not find subscription for customer:', customerId);
    return { handled: false, error: 'Subscription not found' };
  }

  // Determine plan from price
  let plan = 'pro';
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId?.includes('team')) {
    plan = 'team';
  }

  // Update subscription
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: subscription.status,
      plan,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('user_id', sub.user_id);

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  return { handled: true, action: 'subscription_updated', userId: sub.user_id };
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  // Find user by customer ID
  const { data: sub, error: findError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (findError || !sub) {
    console.error('Could not find subscription for customer:', customerId);
    return { handled: false, error: 'Subscription not found' };
  }

  // Downgrade to free plan
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      plan: 'free',
      status: 'canceled',
      stripe_subscription_id: null,
      cancel_at_period_end: false,
    })
    .eq('user_id', sub.user_id);

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  return { handled: true, action: 'subscription_canceled', userId: sub.user_id };
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;

  // Find user by customer ID
  const { data: sub, error: findError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (findError || !sub) {
    return { handled: false, error: 'Subscription not found' };
  }

  // Update status to past_due
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'past_due',
    })
    .eq('user_id', sub.user_id);

  if (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }

  // TODO: Send email notification about failed payment

  return { handled: true, action: 'payment_failed', userId: sub.user_id };
}

/**
 * Handle payment succeeded event
 */
async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;

  // Find user by customer ID
  const { data: sub, error: findError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, status')
    .eq('stripe_customer_id', customerId)
    .single();

  if (findError || !sub) {
    return { handled: false, error: 'Subscription not found' };
  }

  // Only update if was past_due
  if (sub.status === 'past_due') {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'active',
      })
      .eq('user_id', sub.user_id);

    if (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  return { handled: true, action: 'payment_succeeded', userId: sub.user_id };
}
