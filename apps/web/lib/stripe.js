/**
 * Stripe Integration
 *
 * Handles Stripe checkout, subscription management, and webhooks.
 */

/**
 * Stripe price IDs for each plan
 * These should be configured in your Stripe dashboard
 */
export const STRIPE_PRICES = {
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
  },
  team: {
    monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || 'price_team_monthly',
    yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID || 'price_team_yearly',
  },
};

/**
 * Plan features for display
 */
export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      'Unlimited bookmarks',
      'GitHub, Dropbox, Google Drive sync',
      'Local file backup',
      'Chrome & Firefox support',
      'Two-way sync',
      'Conflict resolution',
    ],
  },
  pro: {
    name: 'Pro',
    monthlyPrice: 5,
    yearlyPrice: 15, // $1.25/month billed yearly
    features: [
      'Everything in Free',
      'MarkSyncr Cloud storage',
      'Priority sync (faster)',
      'Safari support',
      'Version history (30 days)',
      'Priority support',
    ],
  },
  team: {
    name: 'Team',
    monthlyPrice: 12,
    yearlyPrice: 36, // $3/month billed yearly
    features: [
      'Everything in Pro',
      'Shared bookmark folders',
      'Team management',
      'Admin controls',
      'Version history (1 year)',
      'Dedicated support',
    ],
  },
};

/**
 * Create a Stripe checkout session
 * This should be called from a server action or API route
 * @param {object} params
 * @param {string} params.userId - User ID
 * @param {string} params.email - User email
 * @param {'pro' | 'team'} params.plan - Plan to subscribe to
 * @param {'monthly' | 'yearly'} params.interval - Billing interval
 * @param {string} params.successUrl - URL to redirect on success
 * @param {string} params.cancelUrl - URL to redirect on cancel
 * @returns {Promise<{sessionId: string, url: string}>}
 */
export async function createCheckoutSession({
  userId,
  email,
  plan,
  interval,
  successUrl,
  cancelUrl,
}) {
  // This would typically use the Stripe SDK on the server
  // For now, we'll show the structure
  const stripe = await getStripeClient();

  const priceId = STRIPE_PRICES[plan]?.[interval];
  if (!priceId) {
    throw new Error(`Invalid plan or interval: ${plan}/${interval}`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer_email: email,
    client_reference_id: userId,
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: {
        userId,
        plan,
      },
    },
    metadata: {
      userId,
      plan,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Create a Stripe customer portal session
 * Allows users to manage their subscription
 * @param {string} customerId - Stripe customer ID
 * @param {string} returnUrl - URL to return to after portal
 * @returns {Promise<{url: string}>}
 */
export async function createPortalSession(customerId, returnUrl) {
  const stripe = await getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

/**
 * Get subscription details
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<object>}
 */
export async function getSubscription(subscriptionId) {
  const stripe = await getStripeClient();
  return stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Cancel subscription at period end
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<object>}
 */
export async function cancelSubscription(subscriptionId) {
  const stripe = await getStripeClient();

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Resume a canceled subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<object>}
 */
export async function resumeSubscription(subscriptionId) {
  const stripe = await getStripeClient();

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Get or create Stripe customer for a user
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} [name] - User name
 * @returns {Promise<string>} Stripe customer ID
 */
export async function getOrCreateCustomer(userId, email, name) {
  const stripe = await getStripeClient();

  // Search for existing customer
  const customers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (customers.data.length > 0) {
    return customers.data[0].id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      userId,
    },
  });

  return customer.id;
}

/**
 * Verify Stripe webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Promise<object>} Verified event
 */
export async function verifyWebhookSignature(payload, signature) {
  const stripe = await getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Handle Stripe webhook events
 * @param {object} event - Stripe event
 * @param {object} supabase - Supabase client
 * @returns {Promise<{handled: boolean, action?: string}>}
 */
export async function handleWebhookEvent(event, supabase) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (userId && subscriptionId) {
        // Update user's subscription in database
        await supabase
          .from('subscriptions')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: session.metadata?.plan || 'pro',
            status: 'active',
          })
          .eq('user_id', userId);

        return { handled: true, action: 'subscription_created' };
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Find user by customer ID
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (sub) {
        await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            cancel_at_period_end: subscription.cancel_at_period_end,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          })
          .eq('user_id', sub.user_id);

        return { handled: true, action: 'subscription_updated' };
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Find user by customer ID and downgrade to free
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (sub) {
        await supabase
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            stripe_subscription_id: null,
          })
          .eq('user_id', sub.user_id);

        return { handled: true, action: 'subscription_canceled' };
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // Find user and update status
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (sub) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
          })
          .eq('user_id', sub.user_id);

        return { handled: true, action: 'payment_failed' };
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      // Find user and update status
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (sub) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
          })
          .eq('user_id', sub.user_id);

        return { handled: true, action: 'payment_succeeded' };
      }
      break;
    }

    default:
      return { handled: false };
  }

  return { handled: false };
}

/**
 * Cached Stripe client instance (singleton pattern)
 * Prevents memory leaks from creating new clients per API call
 */
let cachedStripeClient = null;

/**
 * Get Stripe client (async for dynamic import)
 * Uses singleton pattern to reuse the same client instance
 * @returns {Promise<import('stripe').Stripe>}
 */
async function getStripeClient() {
  if (cachedStripeClient) {
    return cachedStripeClient;
  }

  const Stripe = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  cachedStripeClient = new Stripe(secretKey, {
    apiVersion: '2023-10-16',
  });

  return cachedStripeClient;
}

export default {
  STRIPE_PRICES,
  PLAN_FEATURES,
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  cancelSubscription,
  resumeSubscription,
  getOrCreateCustomer,
  verifyWebhookSignature,
  handleWebhookEvent,
};
