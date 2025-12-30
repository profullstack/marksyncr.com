-- Drop Unused Indexes (Conservative Approach)
-- 
-- IMPORTANT: We KEEP all user_id indexes because:
-- 1. They're essential for RLS policy performance at scale
-- 2. They show as "unused" only because the app is new/low traffic
-- 3. PostgreSQL uses sequential scans on small tables, but will use indexes as data grows
--
-- We only drop indexes that are truly redundant or unlikely to be used.

-- ============================================
-- Indexes we're DROPPING (truly unused)
-- ============================================

-- sync_schedules: next_sync index - only useful for scheduled job queries
DROP INDEX IF EXISTS public.idx_sync_schedules_next_sync;

-- subscriptions: stripe_customer_id - only used for Stripe webhook lookups
-- Keeping this one actually - it's needed for Stripe webhooks
-- DROP INDEX IF EXISTS public.idx_subscriptions_stripe_customer_id;

-- oauth_tokens: provider index - redundant with (user_id, provider) unique constraint
DROP INDEX IF EXISTS public.idx_oauth_tokens_provider;

-- sync_state: device_id index - redundant with (user_id, device_id) unique constraint
DROP INDEX IF EXISTS public.idx_sync_state_device_id;

-- sync_sources: provider and repository indexes - low cardinality, not useful
DROP INDEX IF EXISTS public.idx_sync_sources_provider;
DROP INDEX IF EXISTS public.idx_sync_sources_repository;

-- cloud_bookmarks: tombstones index - JSONB index, rarely queried directly
DROP INDEX IF EXISTS public.idx_cloud_bookmarks_tombstones;

-- bookmark_analytics: visit_count and last_visited - analytics queries are rare
DROP INDEX IF EXISTS public.idx_bookmark_analytics_visit_count;
DROP INDEX IF EXISTS public.idx_bookmark_analytics_last_visited;

-- link_checks: status and checked_at - link checking is a background job
DROP INDEX IF EXISTS public.idx_link_checks_status;
DROP INDEX IF EXISTS public.idx_link_checks_checked_at;

-- ============================================
-- Indexes we're KEEPING (essential for RLS at scale)
-- ============================================
-- idx_sync_schedules_user_id
-- idx_subscriptions_user_id (if exists)
-- idx_subscriptions_stripe_customer_id (for Stripe webhooks)
-- idx_oauth_tokens_user_id
-- idx_cloud_bookmarks_user_id
-- idx_sync_state_user_id
-- idx_devices_user_id
-- idx_sync_sources_user_id
-- idx_user_tags_user_id
-- idx_bookmark_analytics_user_id
-- idx_link_checks_user_id
-- idx_bookmark_versions_user_id
-- idx_bookmark_versions_created_at
-- idx_bookmark_versions_user_version
