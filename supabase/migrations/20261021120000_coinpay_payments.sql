-- CoinPay hosted checkout: Pro/Team are prepaid terms (1 month or 1 year).
--
-- coinpay_payments is the settle ledger: one row per paid checkout session, so
-- a session that reports payment.confirmed and then payment.forwarded (or a
-- webhook retry, or the dashboard return check) grants its term only once.
CREATE TABLE IF NOT EXISTS public.coinpay_payments (
    checkout_session_id TEXT PRIMARY KEY,
    payment_id TEXT,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('pro', 'team')),
    billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
    amount_usd NUMERIC(12, 2),
    method TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coinpay_payments_user_id ON public.coinpay_payments(user_id);

-- Written only by the service role (webhook); no client policies.
ALTER TABLE public.coinpay_payments ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.coinpay_payments TO service_role;

-- Nothing renews on its own, so a paid term that has ended drops back to Free.
-- Rows without a period end (manual grants) are left alone.
CREATE OR REPLACE FUNCTION public.expire_lapsed_subscriptions()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH lapsed AS (
        UPDATE public.subscriptions
           SET plan = 'free', status = 'canceled', cancel_at_period_end = FALSE, updated_at = NOW()
         WHERE plan <> 'free'
           AND status = 'active'
           AND current_period_end IS NOT NULL
           AND current_period_end < NOW()
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER FROM lapsed;
$$;

REVOKE ALL ON FUNCTION public.expire_lapsed_subscriptions() FROM PUBLIC, anon, authenticated;

-- Hourly sweep where pg_cron is available (self-hosted Supabase preloads it).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'marksyncr-expire-lapsed-subscriptions';
        PERFORM cron.schedule('marksyncr-expire-lapsed-subscriptions', '7 * * * *',
                              'SELECT public.expire_lapsed_subscriptions()');
    END IF;
END
$$;
