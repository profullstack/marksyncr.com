/**
 * Authentication helper for API routes
 * Supports both session cookies (web app) and Bearer tokens (extension)
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Allowed origins for CORS (extension and web app)
export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://marksyncr.com',
  'https://www.marksyncr.com',
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
];

/**
 * Get CORS origin from request
 */
export function getCorsOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  
  // Check if origin matches allowed patterns
  if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    return origin;
  }
  return null;
}

/**
 * Create CORS headers for response
 * @param {Request} request - The incoming request
 * @param {string[]} methods - Allowed HTTP methods
 */
export function corsHeaders(request, methods = ['GET', 'POST', 'OPTIONS']) {
  const origin = getCorsOrigin(request);
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': methods.join(', '),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/**
 * Get authenticated user from Bearer token or session cookie
 * 
 * This function supports two authentication methods:
 * 1. Bearer token (for browser extensions) - sent in Authorization header
 * 2. Session cookie (for web app) - handled by Supabase SSR
 * 
 * @param {Request} request - The incoming request
 * @returns {Promise<{user: object|null, supabase: object|null}>}
 */
export async function getAuthenticatedUser(request) {
  // First try Bearer token from Authorization header (for extension)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    // Create a Supabase client with the user's token
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { user, supabase };
    }
  }
  
  // Fall back to session cookie authentication (for web app)
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (!error && user) {
    return { user, supabase };
  }
  
  return { user: null, supabase: null };
}
