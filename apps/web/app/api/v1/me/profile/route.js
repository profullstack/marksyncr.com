import { createProfileHandlers } from '@profullstack/profile';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { profileStore } from '@/lib/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET / PUT / PATCH /api/v1/me/profile: the signed-in user's profile fields
// (session cookie for the web app, Bearer token for the extension).
const handlers = () =>
  createProfileHandlers({
    store: profileStore(),
    getUser: async (request) => {
      const { user } = await getAuthenticatedUser(request);
      return user ? { id: user.id, email: user.email ?? null } : null;
    },
  });

export const GET = (req) => handlers().GET(req);
export const PUT = (req) => handlers().PUT(req);
export const PATCH = (req) => handlers().PATCH(req);
