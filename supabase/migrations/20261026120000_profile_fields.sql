-- The shared @profullstack/profile fields on public.users.
--
-- public.users is readable only by its owner (RLS "Users can view own
-- profile"), so the fields live there, keyed by id. The package's store also
-- writes updated_at. Additive only: nothing is renamed or dropped.
--
-- Apply by hand on the dev2 self-hosted database:
--   docker exec -i marksyncr-com-supabase-db psql -U postgres -d postgres -1 < this file
--   then: notify pgrst, 'reload schema';

alter table public.users add column if not exists first_name text;
alter table public.users add column if not exists last_name text;
alter table public.users add column if not exists company_domain text;
alter table public.users add column if not exists job_title text;
alter table public.users add column if not exists linkedin_url text;
alter table public.users add column if not exists updated_at timestamptz default now();

create index if not exists users_email_lower on public.users (lower(email));

-- One-time backfill, idempotent: split name into first/last only when it
-- looks like a person's "First Last". Never overwrites a value already set.
update public.users
   set first_name = coalesce(first_name, split_part(btrim(name), ' ', 1)),
       last_name  = coalesce(last_name, nullif(btrim(substr(btrim(name),
                      length(split_part(btrim(name), ' ', 1)) + 1)), ''))
 where (first_name is null or last_name is null)
   and name is not null
   and btrim(name) ~ '^[[:upper:]][[:alpha:]''’-]*( [[:upper:]][[:alpha:]''’-]*)+$';
