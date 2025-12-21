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

  // Check Supabase connection
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
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
