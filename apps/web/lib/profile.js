import { createProfileStore } from '@profullstack/profile';
import { createAdminClient } from './supabase/server';

/**
 * The shared @profullstack/profile fields live on public.users (keyed by the
 * auth user id; RLS lets only the owner read it). Server-only: it runs on the
 * service-role client.
 */
let cached = null;

export function profileStore() {
  cached ??= createProfileStore(createAdminClient(), { table: 'users', key: 'id' });
  return cached;
}
