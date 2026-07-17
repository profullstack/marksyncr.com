import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// Create a mock fetch function that we can control
// (@profullstack/emailer posts directly to the Resend HTTP API)
const mockFetch = vi.fn();

// Set the environment variable before any imports
process.env.RESEND_API_KEY = 'test-api-key';

const mockSendSuccess = () =>
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: 'email-123' }),
  });

describe('Contact API Route', () => {
  let POST;

  beforeAll(async () => {
    vi.stubGlobal('fetch', mockFetch);
    // Import after setting env and mocking
    const module = await import('../app/api/contact/route.js');
    POST = module.POST;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body) => ({
    json: () => Promise.resolve(body),
  });

  describe('POST /api/contact', () => {
    it('should send email successfully with valid data', async () => {
      mockSendSuccess();

      const request = createRequest({
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'Hello, I have a question.',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.messageId).toBe('email-123');
    });

    it('should send the submission to the Resend API', async () => {
      mockSendSuccess();

      const request = createRequest({
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      await POST(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[Contact Form] General Inquiry'),
        })
      );
    });

    it('should return 400 when name is missing', async () => {
      const request = createRequest({
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required');
    });

    it('should return 400 when email is missing', async () => {
      const request = createRequest({
        name: 'John Doe',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email is required');
    });

    it('should return 400 when subject is missing', async () => {
      const request = createRequest({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Subject is required');
    });

    it('should return 400 when message is missing', async () => {
      const request = createRequest({
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'General Inquiry',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Message is required');
    });

    it('should return 400 for invalid email format', async () => {
      const request = createRequest({
        name: 'John Doe',
        email: 'invalid-email',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Valid email is required');
    });

    it('should return 400 for email without domain', async () => {
      const request = createRequest({
        name: 'John Doe',
        email: 'john@',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Valid email is required');
    });

    it('should return 500 when Resend returns an error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'API key invalid' } }),
      });

      const request = createRequest({
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to send message. Please try again later.');
    });

    it('should return 400 when the body is not valid JSON', async () => {
      const request = {
        json: () => Promise.reject(new Error('Parse error')),
      };

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON body');
    });

    it('should accept valid email formats', async () => {
      mockSendSuccess();

      const validEmails = ['test@example.com', 'user.name@domain.org', 'user+tag@example.co.uk'];

      for (const email of validEmails) {
        const request = createRequest({
          name: 'John Doe',
          email,
          subject: 'General Inquiry',
          message: 'Hello',
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });

    it('should handle empty string fields as missing', async () => {
      const request = createRequest({
        name: '',
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required');
    });
  });
});
