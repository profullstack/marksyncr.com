import { createProfileStore } from '@profullstack/profile';
import { createAdminClient } from './supabase/server';

/**
 * The shared @profullstack/profile fields live on public.users (keyed by the
 * auth user id; RLS lets only the owner read it). Server-only: it runs on the
 * service-role client.
 *
 * public.users.email is the account email and is not user-editable (it is
 * pinned for API roles by a trigger, migration 20261027010000). The store runs
 * as service_role, so the pin is enforced here too: whatever `email` a caller
 * sends is dropped and the account email from auth.users is written instead.
 * That also keeps the store's upsert valid (email is NOT NULL), so a PATCH that
 * omits email no longer 500s.
 */
let cached = null;

export function profileStore() {
  cached ??= pinAccountEmail(
    createProfileStore(createAdminClient(), { table: 'users', key: 'id' }),
    (userId) => accountEmail(createAdminClient(), userId)
  );
  return cached;
}

async function accountEmail(admin, userId) {
  const { data } = await admin.auth.admin.getUserById(String(userId));
  if (data?.user?.email) return data.user.email;
  const { data: row } = await admin.from('users').select('email').eq('id', userId).maybeSingle();
  return row?.email ?? null;
}

/**
 * Wrap a profile store so `email` always equals the account email.
 * @param {object} inner store from createProfileStore
 * @param {(userId: string) => Promise<string|null>} lookupEmail
 */
export function pinAccountEmail(inner, lookupEmail) {
  const withoutEmail = (profile) => {
    const { email: _ignored, ...rest } = profile ?? {};
    return rest;
  };
  const store = {
    ...inner,
    async save(userId, profile) {
      const email = await lookupEmail(userId);
      if (!email) throw new Error('profile: no account email for user');
      return inner.save(userId, { ...withoutEmail(profile), email });
    },
    async fillBlanks(userId, profile) {
      const current = (await inner.get(userId)) ?? {};
      const fields = withoutEmail(profile);
      for (const k of Object.keys(fields)) if (current[k]) delete fields[k];
      return store.save(userId, fields);
    },
  };
  return store;
}
