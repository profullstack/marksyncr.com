-- One CoinPay subject may be linked to one MarkSyncr account, and one account
-- may link one CoinPay subject. The API uses the service-role client only.
CREATE TABLE IF NOT EXISTS public.coinpay_identities (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  sub text NOT NULL UNIQUE,
  email text,
  name text,
  openprofile_url text,
  linked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coinpay_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coinpay_identities FROM anon, authenticated;
GRANT ALL ON public.coinpay_identities TO service_role;
