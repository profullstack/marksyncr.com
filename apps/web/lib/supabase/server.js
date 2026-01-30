import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Cached client instances for singleton pattern
 * These prevent memory leaks from creating new clients per request
 */
let cachedAdminClient = null;
let cachedStatelessClient = null;

/**
 * Create a Supabase client for server-side operations
 * This should be used in Server Components, Server Actions, and Route Handlers
 * NOTE: This client uses cookies and must be created per-request (cannot be cached)
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase admin client with service role key
 * This should only be used for admin operations that bypass RLS
 *
 * IMPORTANT: Do NOT call session-setting auth methods (refreshSession, verifyOtp,
 * signInWithPassword, etc.) on this client. Those methods store a user session
 * in memory, causing _getAccessToken() to return the user's JWT instead of
 * the service role key for all subsequent requests — which triggers RLS violations.
 * Use createFreshClient() for those operations instead.
 *
 * Uses singleton pattern to prevent memory leaks from creating new clients per request
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createAdminClient() {
  if (!cachedAdminClient) {
    cachedAdminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return cachedAdminClient;
}

/**
 * Create a fresh (non-cached) Supabase client for auth operations that set sessions
 * Use this for refreshSession(), verifyOtp(), signInWithPassword(), etc.
 * Each call returns a new instance so session state never leaks between requests.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createFreshClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );
}

/**
 * Create a stateless Supabase client for API routes
 * This client does NOT use cookies and does NOT persist sessions
 * Use this for API routes called by the extension or other clients
 * that manage their own session tokens
 * Uses singleton pattern to prevent memory leaks from creating new clients per request
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createStatelessClient() {
  if (!cachedStatelessClient) {
    cachedStatelessClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return cachedStatelessClient;
}

/**
 * Get the current authenticated user from server-side
 * @returns {Promise<import('@supabase/supabase-js').User | null>}
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('Error getting user:', error.message);
    return null;
  }

  return user;
}

/**
 * Get the current session from server-side
 * @returns {Promise<import('@supabase/supabase-js').Session | null>}
 */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error.message);
    return null;
  }

  return session;
}
