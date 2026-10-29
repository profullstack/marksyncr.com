import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// @profullstack/emailer posts directly to the Resend HTTP API; every call
// lands here instead.
const mockFetch = vi.fn();

// The guard is on, as in production (it signs with FORM_GUARD_SECRET).
process.env.RESEND_API_KEY = 'test-api-key';
process.env.FORM_GUARD_SECRET = 'test-form-guard-secret-0123456789abcdef';

vi.mock('server-only', () => ({}));

const mockSendSuccess = () =>
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: 'email-123' }),
  });

describe('Contact API Route', () => {
  let POST;
  let contact;
  let ip = 0;

  beforeAll(async () => {
    vi.stubGlobal('fetch', mockFetch);
    POST = (await import('../app/api/contact/route.js')).POST;
    contact = (await import('../lib/contact.js')).contact;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A fresh address per request keeps the 5-an-hour limit out of the way.
  const createRequest = (body) =>
    new Request('https://marksyncr.com/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${++ip}` },
      body: JSON.stringify(body),
    });

  // What the rendered form sends: its fields plus a token minted at render.
  const rendered = async (fields) => ({
    ...fields,
    fg_token: await contact.guard.issue(Date.now() - 10_000),
    website: '',
  });

  const valid = {
    name: 'John Doe',
    email: 'john@example.com',
    subject: 'General Inquiry',
    message: 'Hello, I have a question.',
  };

  it('answers a post that never rendered the form like a success, and sends nothing', async () => {
    const response = await POST(createRequest(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should send email successfully with valid data', async () => {
    mockSendSuccess();
    const response = await POST(createRequest(await rendered(valid)));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.messageId).toBe('email-123');
  });

  it('should send the submission to the Resend API', async () => {
    mockSendSuccess();
    await POST(createRequest(await rendered(valid)));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('[Contact Form] General Inquiry'),
      })
    );
  });

  it.each([
    ['name', 'Name is required'],
    ['email', 'Email is required'],
    ['subject', 'Subject is required'],
    ['message', 'Message is required'],
  ])('should return 400 when %s is missing', async (field, error) => {
    const { [field]: _omit, ...rest } = valid;
    const response = await POST(createRequest(await rendered(rest)));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });

  it('should handle empty string fields as missing', async () => {
    const response = await POST(createRequest(await rendered({ ...valid, name: '' })));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Name is required');
  });

  it.each(['invalid-email', 'john@'])('should return 400 for the invalid email %s', async (email) => {
    const response = await POST(createRequest(await rendered({ ...valid, email })));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/valid email/);
  });

  it('should reject a subject that is not one of the options', async () => {
    const response = await POST(createRequest(await rendered({ ...valid, subject: 'Free money' })));
    expect(response.status).toBe(400);
  });

  it('should return 500 when Resend returns an error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'API key invalid' } }),
    });
    const response = await POST(createRequest(await rendered(valid)));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Failed to send message. Please try again later.');
  });

  it('should return 400 when the body is not valid JSON', async () => {
    const response = await POST(
      new Request('https://marksyncr.com/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
    );
    expect(response.status).toBe(400);
  });

  it('should accept valid email formats', async () => {
    mockSendSuccess();
    for (const email of ['test@example.com', 'user.name@domain.org', 'user+tag@example.co.uk']) {
      const response = await POST(createRequest(await rendered({ ...valid, email })));
      expect(response.status).toBe(200);
    }
  });

  it('renders the subject behind its placeholder, so the person has to choose', async () => {
    const props = await contact.props();
    const subject = props.questions.find((q) => q.name === 'subject');
    expect(subject.required).toBe(true);
    expect(subject.placeholder).toBe('Select a subject');
    expect(props.tokenField).toBe('fg_token');
  });
});
