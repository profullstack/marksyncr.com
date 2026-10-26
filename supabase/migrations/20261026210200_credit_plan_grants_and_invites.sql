-- Credit codes and invites grant plan days through the existing plan path.
--
-- 1. subscription_grant_days: a redeemed code (@profullstack/redeem-credits,
--    unit pro_days or team_days) or an invite bonus extends
--    public.subscriptions, the same row a CoinPay payment extends
--    (lib/coinpay.js settleCheckout) and the same row every Pro check reads.
--    Rules:
--      - nothing running (free, or a lapsed term): start the plan now for N days;
--      - the same plan running: add N days to its end;
--      - a bigger plan running (Team, granting Pro days): add N days, keep Team;
--      - a smaller plan running (Pro, granting Team days): Team from now until
--        the later of the old end and now, plus N days (pairux rule);
--      - a manual grant with no end date (current_period_end NULL) is left alone.
--    expire_lapsed_subscriptions() (hourly pg_cron) drops it back to Free.
--    Service role only.
-- 2. invite_bonuses: one row per (invite, side) once the bonus is decided
--    (granted, or denied with a reason). Claimed before the grant, so a retry
--    or a race never pays twice.

CREATE OR REPLACE FUNCTION public.subscription_grant_days(
    p_user_id UUID,
    p_plan TEXT,
    p_days INTEGER
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cur public.subscriptions;
    running BOOLEAN;
    new_plan TEXT;
    new_end TIMESTAMPTZ;
BEGIN
    IF p_plan NOT IN ('pro', 'team') THEN
        RAISE EXCEPTION 'subscription_grant_days: unknown plan %', p_plan;
    END IF;
    IF p_days IS NULL OR p_days < 1 OR p_days > 3660 THEN
        RAISE EXCEPTION 'subscription_grant_days: days must be 1..3660, got %', p_days;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'subscription_grant_days: no user %', p_user_id;
    END IF;

    SELECT * INTO cur FROM public.subscriptions WHERE user_id = p_user_id FOR UPDATE;

    -- A paid plan with no end date is a manual (unlimited) grant: keep it.
    IF FOUND AND cur.plan <> 'free' AND cur.status = 'active' AND cur.current_period_end IS NULL THEN
        RETURN NULL;
    END IF;

    running := FOUND AND cur.plan <> 'free' AND cur.status = 'active'
               AND cur.current_period_end IS NOT NULL AND cur.current_period_end > NOW();

    IF running AND cur.plan = 'team' AND p_plan = 'pro' THEN
        new_plan := 'team';
    ELSE
        new_plan := p_plan;
    END IF;

    IF running THEN
        new_end := cur.current_period_end + make_interval(days => p_days);
    ELSE
        new_end := NOW() + make_interval(days => p_days);
    END IF;

    INSERT INTO public.subscriptions AS s
        (user_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, updated_at)
    VALUES
        (p_user_id, new_plan, 'active', NOW(), new_end, TRUE, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = 'active',
        current_period_start = CASE WHEN running THEN s.current_period_start ELSE NOW() END,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = TRUE,
        updated_at = NOW();

    RETURN new_end;
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_grant_days(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_grant_days(UUID, TEXT, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.invite_bonuses (
    invite_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('inviter', 'invitee')),
    user_id UUID NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('granted', 'denied')),
    reason TEXT,
    days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (invite_id, side)
);
CREATE INDEX IF NOT EXISTS invite_bonuses_user_idx ON public.invite_bonuses (user_id, created_at);

ALTER TABLE public.invite_bonuses ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role reads or writes it.
REVOKE ALL ON public.invite_bonuses FROM anon, authenticated;
GRANT ALL ON public.invite_bonuses TO service_role;
