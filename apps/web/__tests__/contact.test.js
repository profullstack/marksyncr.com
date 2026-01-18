import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

// Create a mock send function that we can control
const mockSend = vi.fn();

// Set the environment variable before any imports
process.env.RESEND_API_KEY = 'test-api-key';

// Mock Resend module
vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      constructor() {
        this.emails = {
          send: mockSend,
        };
      }
    },
  };
});

describe('Contact API Route', () => {
  let POST;

  beforeAll(async () => {
    // Import after setting env and mocking
    const module = await import('../app/api/contact/route.js');
    POST = module.POST;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body) => ({
    json: () => Promise.resolve(body),
  });

  describe('POST /api/contact', () => {
    it('should send email successfully with valid data', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-123' },
        error: null,
      });

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

    it('should return 400 when name is missing', async () => {
      const request = createRequest({
        email: 'john@example.com',
        subject: 'General Inquiry',
        message: 'Hello',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('All fields are required');
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
      expect(data.error).toBe('All fields are required');
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
      expect(data.error).toBe('All fields are required');
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
      expect(data.error).toBe('All fields are required');
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
      expect(data.error).toBe('Invalid email format');
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
      expect(data.error).toBe('Invalid email format');
    });

    it('should return 500 when Resend returns an error', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'API key invalid' },
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

    it('should return 500 when an unexpected error occurs', async () => {
      const request = {
        json: () => Promise.reject(new Error('Parse error')),
      };

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('An unexpected error occurred');
    });

    it('should accept valid email formats', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'email-123' },
        error: null,
      });

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
      expect(data.error).toBe('All fields are required');
    });
  });
});
