import { createBrowserSupabase } from '@profullstack/stack/supabase';

/**
 * Create a Supabase client for client-side operations
 * This should be used in Client Components
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createClient() {
  return createBrowserSupabase();
}
