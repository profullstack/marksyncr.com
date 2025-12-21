/**
 * Supabase Server Utilities
 *
 * This file re-exports server-side Supabase utilities.
 * All Supabase operations should be done server-side.
 *
 * For client components, use Server Actions from app/actions/auth.js
 */

export { createClient, createAdminClient, getUser, getSession } from './supabase/server';
