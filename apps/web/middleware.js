import { updateSession } from '@profullstack/stack/supabase';

/**
 * Middleware to refresh Supabase session on every request.
 *
 * Without this, the session cookie's JWT expires (1 hour default) and
 * the user gets logged out. The middleware intercepts each request,
 * reads the session cookies, calls getUser() to trigger a token refresh
 * if needed, and writes the updated cookies back to the response.
 */
export async function middleware(request) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
