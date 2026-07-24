/**
 * Health Check API Route
 *
 * Used by Railway/Docker for container health checks.
 */

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
  };

  // Check Supabase connection.
  // NOTE: probe the GoTrue health endpoint, not the PostgREST root (/rest/v1/).
  // Under Supabase's new API-key system the REST root requires a *secret* key and
  // returns 401 ("Only secret API keys can be used for this endpoint") for the
  // publishable key the app uses — a false negative even though the project is
  // healthy and table queries work. /auth/v1/health needs no key and returns 200.
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        method: 'GET',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
      });
      health.supabase = response.ok ? 'connected' : 'error';
    } else {
      health.supabase = 'not configured';
    }
  } catch {
    health.supabase = 'error';
  }

  // Check Stripe connection
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      health.stripe = 'configured';
    } else {
      health.stripe = 'not configured';
    }
  } catch {
    health.stripe = 'error';
  }

  const isHealthy = health.status === 'healthy';

  return new Response(JSON.stringify(health, null, 2), {
    status: isHealthy ? 200 : 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
