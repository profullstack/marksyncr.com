/**
 * The checkout pages (/checkout/pro, /checkout/team): what is for sale, and
 * that paying through them opens exactly the CoinPay session POST /api/checkout
 * has always opened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCheckout as createCheckoutPage } from '@profullstack/checkout';

process.env.COINPAY_API_KEY = 'cp_live_test';
process.env.NEXT_PUBLIC_APP_URL = 'https://marksyncr.com';

const mockUser = { id: '11111111-1111-1111-1111-111111111111', email: 'buyer@example.com' };
let authedUser;
vi.mock('@/lib/auth-helper', () => ({
  getAuthenticatedUser: vi.fn(async () => ({ user: authedUser, supabase: authedUser ? {} : null })),
}));

const coinpay = await import('../lib/coinpay.js');
const lib = await import('../lib/checkout.js');
const route = await import('../app/api/checkout/[tier]/route.js');

/** A CoinPay client that records what it is asked to open. */
function recorder(id = 'cs_abc') {
  const createCheckoutSession = vi.fn(async () => ({
    id,
    url: `https://coinpayportal.com/checkout/${id}`,
    methods: ['BTC', 'PAYPAL'],
  }));
  return { createCheckoutSession };
}

/** A checkout page for a plan whose payments go to `client`. */
function pageFor(tier, client) {
  return createCheckoutPage(
    lib.checkoutConfig(tier, { open: (args) => coinpay.createCheckout({ ...args, client }) })
  );
}

const order = (interval, totalCents, extra = {}) => ({
  option: { id: interval, name: interval, kind: 'plan', months: interval === 'yearly' ? 12 : 1 },
  quantity: 1,
  totalCents,
  account: { id: mockUser.id, email: mockUser.email },
  ...extra,
});

function post(tier, fields, headers = {}) {
  return route.POST(
    new Request(`https://marksyncr.com/api/checkout/${tier}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(fields),
    }),
    { params: Promise.resolve({ tier }) }
  );
}

beforeEach(() => {
  authedUser = mockUser;
});

describe('what is for sale', () => {
  it('Pro and Team, each for one year (preselected) or one month, at the published prices', () => {
    expect(lib.TIERS).toEqual(['pro', 'team']);
    expect(lib.termOptions('pro')).toEqual([
      { id: 'yearly', name: '1 year', months: 12, popular: true, price: 15 },
      { id: 'monthly', name: '1 month', months: 1, price: 5 },
    ]);
    expect(lib.termOptions('team')).toEqual([
      { id: 'yearly', name: '1 year', months: 12, popular: true, price: 36 },
      { id: 'monthly', name: '1 month', months: 1, price: 12 },
    ]);
  });

  it('charges the term total, in cents', () => {
    const cents = (tier) =>
      Object.fromEntries(lib.checkoutFor(tier).config.options.map((o) => [o.id, o.chargeCents]));
    expect(cents('pro')).toEqual({ yearly: 1500, monthly: 500 });
    expect(cents('team')).toEqual({ yearly: 3600, monthly: 1200 });
  });

  it('quotes every option at the price lib/coinpay.js charges', async () => {
    for (const tier of coinpay.PLANS) {
      for (const interval of coinpay.INTERVALS) {
        const out = await lib.checkoutFor(tier).quote({ option: interval });
        expect(out.quote.totalCents).toBe(coinpay.planPrice(tier, interval) * 100);
      }
    }
  });

  it('preselects the year, and a link can preselect the month', () => {
    expect(lib.checkoutFor('pro').view({}).selected).toBe('yearly');
    expect(lib.checkoutFor('pro').view({ query: { plan: 'monthly' } }).selected).toBe('monthly');
    expect(lib.checkoutFor('team').view({ query: { plan: 'weekly' } }).selected).toBe('yearly');
  });

  it('has no page for a plan that is not sold', () => {
    expect(lib.checkoutFor('free')).toBeNull();
    expect(lib.checkoutFor('enterprise')).toBeNull();
    expect(lib.checkoutFor('__proto__')).toBeNull();
  });

  it('has no discount field, seats or guest email', () => {
    const view = lib.checkoutFor('pro').view({ account: { email: mockUser.email } });
    expect(view.hasDiscount).toBe(false);
    expect(view.anySeats).toBe(false);
    expect(view.account).toEqual({ email: mockUser.email });
  });
});

describe('pay()', () => {
  it('opens the same CoinPay session as createCheckout() called directly', async () => {
    for (const tier of coinpay.PLANS) {
      for (const interval of coinpay.INTERVALS) {
        const direct = recorder();
        await coinpay.createCheckout({
          user: mockUser,
          plan: tier,
          interval,
          appUrl: 'https://marksyncr.com',
          client: direct,
        });

        const viaPage = recorder();
        const out = await pageFor(tier, viaPage).handle({ option: interval });
        expect(out).toMatchObject({ ok: true, url: 'https://coinpayportal.com/checkout/cs_abc', id: 'cs_abc' });
        expect(viaPage.createCheckoutSession).toHaveBeenCalledTimes(1);
        expect(viaPage.createCheckoutSession.mock.calls[0]).toEqual(direct.createCheckoutSession.mock.calls[0]);
      }
    }
  });

  it('sends the plan, term, buyer and return URLs CoinPay has always been sent', async () => {
    const client = recorder();
    await pageFor('pro', client).handle({ option: 'yearly', source: 'pricing' });
    expect(client.createCheckoutSession.mock.calls[0][0]).toEqual({
      amount: 15,
      currency: 'USD',
      description: 'MarkSyncr Pro, 1 year',
      customerEmail: mockUser.email,
      accountId: mockUser.id,
      property: 'marksyncr.com',
      metadata: { plan: 'pro', interval: 'yearly', billing_period: 'yearly', user_id: mockUser.id },
      successUrl: 'https://marksyncr.com/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://marksyncr.com/pricing?checkout=canceled',
      expiresInMinutes: 60,
    });
  });

  it('calls the existing creator with the user, plan, interval and app URL', async () => {
    const open = vi.fn(async () => ({ id: 'cs_1', url: 'https://coinpayportal.com/checkout/cs_1' }));
    const out = await lib.payFor('team', { open })(order('monthly', 1200));
    expect(out).toEqual({ url: 'https://coinpayportal.com/checkout/cs_1', id: 'cs_1' });
    expect(open).toHaveBeenCalledWith({
      user: { id: mockUser.id, email: mockUser.email },
      plan: 'team',
      interval: 'monthly',
      appUrl: 'https://marksyncr.com',
    });
  });

  it('throws, and opens nothing, when the priced amount is not the plan price', async () => {
    const open = vi.fn();
    await expect(lib.payFor('pro', { open })(order('yearly', 1499))).rejects.toThrow('amount mismatch');
    await expect(lib.payFor('pro', { open })(order('monthly', 1500))).rejects.toThrow('amount mismatch');
    await expect(lib.payFor('team', { open })(order('yearly', 1500))).rejects.toThrow('amount mismatch');
    await expect(lib.payFor('pro', { open })(order('yearly', 1500, { quantity: 2 }))).rejects.toThrow('amount mismatch');
    await expect(lib.payFor('pro', { open })(order('weekly', 500))).rejects.toThrow('Invalid plan or interval');
    expect(open).not.toHaveBeenCalled();
  });

  it('charges the signed-in account, whatever the form says', async () => {
    const client = recorder();
    await pageFor('pro', client).handle({ option: 'monthly', email: 'someone-else@example.com', quantity: '9' });
    const input = client.createCheckoutSession.mock.calls[0][0];
    expect(input.amount).toBe(5);
    expect(input.customerEmail).toBe(mockUser.email);
    expect(input.accountId).toBe(mockUser.id);
  });
});

describe('POST /api/checkout/<tier>', () => {
  it('redirects a signed-in form post to CoinPay, with the real API request body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'cs_form', url: 'https://coinpayportal.com/checkout/cs_form', status: 'open', methods: [] }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    const res = await post('team', { option: 'yearly', source: 'dashboard' }, { origin: 'https://marksyncr.com' });
    const [url, init] = spy.mock.calls[0];
    spy.mockRestore();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://coinpayportal.com/checkout/cs_form');
    expect(url).toBe('https://coinpayportal.com/api/checkout/sessions');
    expect(JSON.parse(init.body)).toMatchObject({
      amount: 36,
      customer_email: mockUser.email,
      account_id: mockUser.id,
      property: 'marksyncr.com',
      metadata: { plan: 'team', interval: 'yearly', billing_period: 'yearly', user_id: mockUser.id },
    });
  });

  it('sends a signed-out post to /login and opens nothing', async () => {
    authedUser = null;
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await post('pro', { option: 'yearly' }, { referer: 'https://marksyncr.com/checkout/pro?plan=yearly' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/login?next=${encodeURIComponent('/checkout/pro?option=yearly')}`);
  });

  it('refuses a post from another site', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const form = await post('pro', { option: 'yearly' }, { origin: 'https://evil.example' });
    expect(form.status).toBe(303);
    expect(form.headers.get('location')).toBe('/checkout/pro?option=yearly&error=bad_origin');
    const json = await post('pro', { option: 'yearly' }, { origin: 'https://evil.example', accept: 'application/json' });
    expect(json.status).toBe(403);
    const crossSite = await post('pro', { option: 'yearly' }, { 'sec-fetch-site': 'cross-site' });
    expect(crossSite.headers.get('location')).toContain('error=bad_origin');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refuses a term that is not sold', async () => {
    const res = await post('pro', { option: 'lifetime' }, { accept: 'application/json' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_option');
  });

  it('404s a plan that is not sold', async () => {
    const res = await post('free', { option: 'yearly' });
    expect(res.status).toBe(404);
  });

  it('says nothing was charged when CoinPay cannot be reached', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await post('pro', { option: 'monthly' }, { accept: 'application/json' });
    spy.mockRestore();
    quiet.mockRestore();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('payment_unavailable');
  });
});
