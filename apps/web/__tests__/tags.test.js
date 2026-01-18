/**
 * @fileoverview Tests for Tags API endpoints
 * Using Vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Next.js modules
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data, options = {}) => ({
      data,
      status: options.status || 200,
      json: async () => data,
    }),
  },
}));

// Mock Supabase client
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

// Import after mocks
const { GET, POST } = await import('../app/api/tags/route.js');

describe('Tags API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tags', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const response = await GET();

      expect(response.status).toBe(401);
      expect(response.data.error).toBe('Unauthorized');
    });

    it('should return 403 if user does not have Pro subscription', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'free', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const response = await GET();

      expect(response.status).toBe(403);
      expect(response.data.code).toBe('PRO_REQUIRED');
    });

    it('should return tags for Pro user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const mockTags = [
        { id: 'tag-1', name: 'work', color: '#3B82F6', created_at: '2025-01-01' },
        { id: 'tag-2', name: 'personal', color: '#10B981', created_at: '2025-01-02' },
      ];

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for tags
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockTags,
              error: null,
            }),
          }),
        }),
      });

      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.data.tags).toEqual(mockTags);
    });

    it('should return tags for Team user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'team', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for tags
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      });

      const response = await GET();

      expect(response.status).toBe(200);
      expect(response.data.tags).toEqual([]);
    });
  });

  describe('POST /api/tags', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'test' }),
      };

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should return 403 if user does not have Pro subscription', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'free', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'test' }),
      };

      const response = await POST(request);

      expect(response.status).toBe(403);
      expect(response.data.code).toBe('PRO_REQUIRED');
    });

    it('should return 400 if tag name is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({}),
      };

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Tag name is required');
    });

    it('should return 400 if tag name is empty', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: '   ' }),
      };

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Tag name cannot be empty');
    });

    it('should return 400 if tag name is too long', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'a'.repeat(51) }),
      };

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe('Tag name must be 50 characters or less');
    });

    it('should return 400 if color format is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'test', color: 'invalid' }),
      };

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(response.data.error).toContain('Invalid color format');
    });

    it('should create a tag successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const createdTag = {
        id: 'tag-new',
        name: 'work',
        color: '#3B82F6',
        created_at: '2025-01-01',
      };

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for insert
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: createdTag,
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'Work' }),
      };

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(response.data.tag).toEqual(createdTag);
    });

    it('should normalize tag name to lowercase', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      let insertedData = null;

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for insert - capture the inserted data
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockImplementation((data) => {
          insertedData = data;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'tag-new', ...data, created_at: '2025-01-01' },
                error: null,
              }),
            }),
          };
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: '  UPPERCASE TAG  ' }),
      };

      await POST(request);

      expect(insertedData.name).toBe('uppercase tag');
    });

    it('should return 409 if tag already exists', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for insert - duplicate error
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23505', message: 'duplicate key' },
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'existing' }),
      };

      const response = await POST(request);

      expect(response.status).toBe(409);
      expect(response.data.error).toBe('Tag already exists');
    });
  });
});

// Test individual tag routes
const { GET: GETTag, PATCH, DELETE } = await import('../app/api/tags/[tagId]/route.js');

describe('Individual Tag API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tags/[tagId]', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const response = await GETTag({}, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(401);
    });

    it('should return 404 if tag not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' },
              }),
            }),
          }),
        }),
      });

      const response = await GETTag({}, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(404);
    });

    it('should return tag if found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const mockTag = { id: 'tag-123', name: 'work', color: '#3B82F6', created_at: '2025-01-01' };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockTag,
                error: null,
              }),
            }),
          }),
        }),
      });

      const response = await GETTag({}, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(200);
      expect(response.data.tag).toEqual(mockTag);
    });
  });

  describe('PATCH /api/tags/[tagId]', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'updated' }),
      };

      const response = await PATCH(request, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(401);
    });

    it('should return 400 if no valid fields to update', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({}),
      };

      const response = await PATCH(request, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(400);
      expect(response.data.error).toBe('No valid fields to update');
    });

    it('should update tag name successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const updatedTag = {
        id: 'tag-123',
        name: 'updated',
        color: '#3B82F6',
        created_at: '2025-01-01',
      };

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for update
      mockSupabase.from.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: updatedTag,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ name: 'Updated' }),
      };

      const response = await PATCH(request, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(200);
      expect(response.data.tag).toEqual(updatedTag);
    });
  });

  describe('DELETE /api/tags/[tagId]', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const response = await DELETE({}, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(401);
    });

    it('should delete tag successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // First call for subscription check
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { plan: 'pro', status: 'active' },
              error: null,
            }),
          }),
        }),
      });

      // Second call for delete
      mockSupabase.from.mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              error: null,
            }),
          }),
        }),
      });

      const response = await DELETE({}, { params: Promise.resolve({ tagId: 'tag-123' }) });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });
});
