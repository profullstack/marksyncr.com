/**
 * CoinPay hosted checkout: session creation, webhook settle (nested payload,
 * PayPal 'completed', forwarded), idempotency and signature checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signWebhook } from '@profullstack/coinpay-onboard';

const SECRET = 'whsecret_test_secret';
process.env.COINPAY_WEBHOOK_SECRET = SECRET;
process.env.COINPAY_API_KEY = 'cp_live_test';
process.env.NEXT_PUBLIC_APP_URL = 'https://marksyncr.com';

/** A tiny in-memory stand-in for the service-role Supabase client. */
function fakeAdmin(seed = {}) {
  const tables = { subscriptions: [], coinpay_payments: [], ...seed };
  const from = (table) => {
    const rows = (tables[table] ||= []);
    return {
      insert: async (row) => {
        if (table === 'coinpay_payments' && rows.some((r) => r.checkout_session_id === row.checkout_session_id)) {
          return { error: { code: '23505', message: 'duplicate key' } };
        }
        rows.push({ ...row });
        return { error: null };
      },
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => ({ data: rows.find((r) => r[col] === val) || null, error: null }),
        }),
      }),
      upsert: async (row, { onConflict }) => {
        const i = rows.findIndex((r) => r[onConflict] === row[onConflict]);
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push({ ...row });
        return { error: null };
      },
      delete: () => ({
        eq: async (col, val) => {
          tables[table] = rows.filter((r) => r[col] !== val);
          return { error: null };
        },
      }),
    };
  };
  return { from, tables };
}

let admin;
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => admin }));

const mockUser = { id: '11111111-1111-1111-1111-111111111111', email: 'buyer@example.com' };
let authedUser;
vi.mock('@/lib/auth-helper', () => ({
  getAuthenticatedUser: vi.fn(async () => ({ user: authedUser, supabase: authedUser ? {} : null })),
}));

const coinpay = await import('../lib/coinpay.js');
const webhook = await import('../app/api/webhooks/coinpay/route.js');
const checkout = await import('../app/api/checkout/route.js');

function event(type, data) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    business_id: 'b5bf307a-162f-48c3-8d99-702dd2e38cf9',
    data: {
      payment_id: 'pay_1',
      status: 'confirmed',
      amount: 5,
      amount_usd: 5,
      checkout_session_id: 'cs_test_1',
      customer_email: mockUser.email,
      account_id: mockUser.id,
      property: 'marksyncr.com',
      metadata: { plan: 'pro', interval: 'monthly', billing_period: 'monthly', user_id: mockUser.id },
      ...data,
    },
  };
}

function signed(body, secret = SECRET) {
  const raw = JSON.stringify(body);
  return new Request('https://marksyncr.com/api/webhooks/coinpay', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-coinpay-signature': signWebhook(raw, secret) },
    body: raw,
  });
}

beforeEach(() => {
  admin = fakeAdmin({
    subscriptions: [{ user_id: mockUser.id, plan: 'free', status: 'active', current_period_end: null }],
  });
  authedUser = mockUser;
});

describe('createCheckout', () => {
  it('opens a session with the account email, user id, property and plan metadata', async () => {
    const createCheckoutSession = vi.fn(async () => ({
      id: 'cs_abc',
      url: 'https://coinpayportal.com/checkout/cs_abc',
      methods: ['BTC', 'PAYPAL'],
    }));
    const session = await coinpay.createCheckout({
      user: mockUser,
      plan: 'pro',
      interval: 'yearly',
      appUrl: 'https://marksyncr.com',
      client: { createCheckoutSession },
    });
    expect(session.url).toBe('https://coinpayportal.com/checkout/cs_abc');
    const input = createCheckoutSession.mock.calls[0][0];
    expect(input).toMatchObject({
      amount: 15,
      currency: 'USD',
      customerEmail: mockUser.email,
      accountId: mockUser.id,
      property: 'marksyncr.com',
      metadata: { plan: 'pro', interval: 'yearly', billing_period: 'yearly', user_id: mockUser.id },
      expiresInMinutes: 60,
    });
    expect(input.successUrl).toContain('{CHECKOUT_SESSION_ID}');
  });

  it('keeps the published prices', () => {
    expect(coinpay.planPrice('pro', 'monthly')).toBe(5);
    expect(coinpay.planPrice('pro', 'yearly')).toBe(15);
    expect(coinpay.planPrice('team', 'monthly')).toBe(12);
    expect(coinpay.planPrice('team', 'yearly')).toBe(36);
    expect(coinpay.planPrice('free', 'monthly')).toBeNull();
  });

  it('sends the real API request body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: true, id: 'cs_x', url: 'https://coinpayportal.com/checkout/cs_x', status: 'open', methods: ['USDC_POL', 'PAYPAL'] }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      )
    );
    const { CoinPay } = await import('@profullstack/coinpay-onboard');
    const client = new CoinPay({ token: 'cp_live_test', fetch: fetchMock });
    await coinpay.createCheckout({ user: mockUser, plan: 'team', interval: 'monthly', appUrl: 'https://marksyncr.com', client });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://coinpayportal.com/api/checkout/sessions');
    expect(init.headers.authorization).toBe('Bearer cp_live_test');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ amount: 12, customer_email: mockUser.email, account_id: mockUser.id, property: 'marksyncr.com' });
    expect(body).not.toHaveProperty('payment_method');
  });
});

describe('POST /api/checkout', () => {
  it('401s a signed-out JSON caller', async () => {
    authedUser = null;
    const res = await checkout.POST(
      new Request('https://marksyncr.com/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('rejects an unknown plan', async () => {
    const res = await checkout.POST(
      new Request('https://marksyncr.com/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'enterprise' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns the CoinPay session url for a signed-in user', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'cs_live', url: 'https://coinpayportal.com/checkout/cs_live', status: 'open', methods: [] }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    const res = await checkout.POST(
      new Request('https://marksyncr.com/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
      })
    );
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: 'cs_live', url: 'https://coinpayportal.com/checkout/cs_live' });
  });

  it('redirects a dashboard form post straight to CoinPay', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'cs_form', url: 'https://coinpayportal.com/checkout/cs_form', status: 'open', methods: [] }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    const form = new URLSearchParams({ plan: 'team', interval: 'yearly' });
    const res = await checkout.POST(
      new Request('https://marksyncr.com/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      })
    );
    spy.mockRestore();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://coinpayportal.com/checkout/cs_form');
  });
});

describe('POST /api/webhooks/coinpay', () => {
  it('401s a bad signature and grants nothing', async () => {
    const res = await webhook.POST(signed(event('payment.confirmed'), 'wrong-secret'));
    expect(res.status).toBe(401);
    expect(admin.tables.subscriptions[0].plan).toBe('free');
  });

  it('401s a missing signature', async () => {
    const res = await webhook.POST(
      new Request('https://marksyncr.com/api/webhooks/coinpay', { method: 'POST', body: JSON.stringify(event('payment.confirmed')) })
    );
    expect(res.status).toBe(401);
  });

  it('activates the plan for one month on a nested payment.confirmed', async () => {
    const before = Date.now();
    const res = await webhook.POST(signed(event('payment.confirmed')));
    expect(res.status).toBe(200);
    const sub = admin.tables.subscriptions[0];
    expect(sub).toMatchObject({ plan: 'pro', status: 'active' });
    const days = (new Date(sub.current_period_end).getTime() - before) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(admin.tables.coinpay_payments).toHaveLength(1);
  });

  it('treats a PayPal capture (confirmed, status completed) as paid', async () => {
    const res = await webhook.POST(
      signed(
        event('payment.confirmed', {
          status: 'completed',
          rail: 'paypal',
          checkout_session_id: 'cs_pp',
          metadata: { plan: 'team', interval: 'yearly', user_id: mockUser.id },
        })
      )
    );
    expect(res.status).toBe(200);
    const sub = admin.tables.subscriptions[0];
    expect(sub.plan).toBe('team');
    const days = (new Date(sub.current_period_end).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(360);
    expect(admin.tables.coinpay_payments[0].method).toBe('paypal');
  });

  it('treats payment.forwarded as paid', async () => {
    const res = await webhook.POST(signed(event('payment.forwarded', { status: 'forwarded' })));
    expect(res.status).toBe(200);
    expect(admin.tables.subscriptions[0].plan).toBe('pro');
  });

  it('is idempotent: confirmed then forwarded for one session grants one term', async () => {
    await webhook.POST(signed(event('payment.confirmed')));
    const end1 = admin.tables.subscriptions[0].current_period_end;
    const res = await webhook.POST(signed(event('payment.forwarded', { status: 'forwarded' })));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(admin.tables.subscriptions[0].current_period_end).toBe(end1);
    expect(admin.tables.coinpay_payments).toHaveLength(1);
  });

  it('extends a running term of the same plan from its current end', async () => {
    await webhook.POST(signed(event('payment.confirmed')));
    const end1 = new Date(admin.tables.subscriptions[0].current_period_end);
    await webhook.POST(signed(event('payment.confirmed', { checkout_session_id: 'cs_test_2', payment_id: 'pay_2' })));
    const end2 = new Date(admin.tables.subscriptions[0].current_period_end);
    const days = (end2 - end1) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });

  it('acks a payment.expired without granting anything', async () => {
    const res = await webhook.POST(signed(event('payment.expired', { status: 'expired' })));
    expect(res.status).toBe(200);
    expect((await res.json()).handled).toBe(false);
    expect(admin.tables.subscriptions[0].plan).toBe('free');
    expect(admin.tables.coinpay_payments).toHaveLength(0);
  });

  it('ignores a paid event for another property', async () => {
    const res = await webhook.POST(signed(event('payment.confirmed', { property: 'other.site' })));
    expect(res.status).toBe(200);
    expect(admin.tables.subscriptions[0].plan).toBe('free');
  });
});

describe('reconcileReturn', () => {
  it('settles a paid session that belongs to the user', async () => {
    const client = {
      checkoutSession: async () => ({
        id: 'cs_ret',
        status: 'paid',
        amount: 5,
        accountId: mockUser.id,
        metadata: { plan: 'pro', interval: 'monthly', user_id: mockUser.id },
        paymentId: 'pay_r',
        paidMethod: 'BTC',
      }),
    };
    const status = await coinpay.reconcileReturn(admin, 'cs_ret', mockUser, client);
    expect(status).toBe('paid');
    expect(admin.tables.subscriptions[0].plan).toBe('pro');
  });

  it('ignores a session owned by someone else', async () => {
    const client = {
      checkoutSession: async () => ({ id: 'cs_x', status: 'paid', accountId: 'other', metadata: { user_id: 'other', plan: 'pro', interval: 'monthly' } }),
    };
    expect(await coinpay.reconcileReturn(admin, 'cs_x', mockUser, client)).toBeNull();
    expect(admin.tables.subscriptions[0].plan).toBe('free');
  });
});
