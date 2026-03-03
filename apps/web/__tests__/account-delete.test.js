/**
 * @fileoverview Tests for POST /api/account/delete endpoint
 * Tests the account deletion functionality with confirmation
 * Uses Vitest with mocked auth helper and admin client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUser = { id: 'user-456', email: 'delete-me@example.com' };

let deleteCalls;
let mockDeleteUserError;

vi.mock('@/lib/auth-helper', () => ({
  corsHeaders: vi.fn((request, methods) => ({
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': methods?.join(', ') || 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table) => ({
      delete: vi.fn(() => ({
        eq: vi.fn((col, val) => {
          deleteCalls.push({ table, col, val });
          const tableError = deleteCalls._errors?.[table];
          return { error: tableError || null };
        }),
      })),
    })),
    auth: {
      admin: {
        deleteUser: vi.fn((userId) => {
          deleteCalls.push({ action: 'deleteUser', userId });
          return { error: mockDeleteUserError };
        }),
      },
    },
  })),
}));

const { POST, OPTIONS } = await import('../app/api/account/delete/route.js');
const { getAuthenticatedUser } = await import('@/lib/auth-helper');

function createMockRequest(options = {}) {
  const { method = 'POST', body = null, headers = {} } = options;
  return {
    method,
    headers: { get: (name) => headers[name] || null },
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCalls = [];
    mockDeleteUserError = null;
  });

  it('returns 401 when not authenticated', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null });
    const req = createMockRequest({ body: { confirm: 'DELETE' } });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Authentication required');
  });

  it('returns 400 when confirm is missing', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: {} });
    const req = createMockRequest({ body: {} });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Must send');
  });

  it('returns 400 when confirm is wrong value', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: {} });
    const req = createMockRequest({ body: { confirm: 'yes' } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('deletes all tables and auth user on valid confirmation', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: {} });
    const req = createMockRequest({ body: { confirm: 'DELETE' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toContain('deleted successfully');

    const expectedTables = [
      'bookmark_versions', 'cloud_bookmarks', 'user_tags',
      'extension_sessions', 'devices', 'sync_sources',
      'user_settings', 'subscriptions',
    ];
    const deletedTables = deleteCalls.filter((c) => c.table).map((c) => c.table);
    expect(deletedTables).toEqual(expectedTables);

    deleteCalls.filter((c) => c.table).forEach((c) => {
      expect(c.col).toBe('user_id');
      expect(c.val).toBe(mockUser.id);
    });

    const authDelete = deleteCalls.find((c) => c.action === 'deleteUser');
    expect(authDelete).toBeDefined();
    expect(authDelete.userId).toBe(mockUser.id);
  });

  it('returns 500 when auth user deletion fails', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: {} });
    mockDeleteUserError = { message: 'Auth service error' };
    const req = createMockRequest({ body: { confirm: 'DELETE' } });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('contact support');
  });

  it('succeeds even if some table deletes fail', async () => {
    getAuthenticatedUser.mockResolvedValue({ user: mockUser, supabase: {} });
    deleteCalls._errors = { user_tags: { message: 'permission denied' } };
    const req = createMockRequest({ body: { confirm: 'DELETE' } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('OPTIONS /api/account/delete', () => {
  it('returns 204 with CORS headers', async () => {
    const req = createMockRequest({ method: 'OPTIONS', headers: { origin: 'https://marksyncr.com' } });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
  });
});
