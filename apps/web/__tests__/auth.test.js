/**
 * @fileoverview Tests for auth server actions
 * Tests the signUpWithEmail, signInWithEmail, signInWithOAuth, resetPassword functions
 * Uses Vitest with mocked Supabase client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Supabase auth methods
const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockUpdateUser = vi.fn();

// Mock @supabase/ssr createServerClient
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
    },
  })),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// Mock next/headers - need to mock both headers and cookies
const mockHeadersGet = vi.fn();
const mockCookiesGetAll = vi.fn(() => []);
const mockCookiesSet = vi.fn();

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: mockHeadersGet,
    })
  ),
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: mockCookiesGetAll,
      set: mockCookiesSet,
    })
  ),
}));

// Import after mocks are set up
const { signUpWithEmail, signInWithEmail, signInWithOAuth, resetPassword, signOut } = await import(
  '../app/actions/auth.js'
);

/**
 * Helper to create FormData from an object
 * @param {Record<string, string>} data
 * @returns {FormData}
 */
function createFormData(data) {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
}

describe('Auth Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default header mocks
    mockHeadersGet.mockImplementation((name) => {
      if (name === 'origin') return 'https://marksyncr.com';
      if (name === 'host') return 'marksyncr.com';
      return null;
    });
    // Clear env var
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('signUpWithEmail', () => {
    it('should return error when email is missing', async () => {
      const formData = createFormData({ password: 'password123' });

      const result = await signUpWithEmail(formData);

      expect(result).toEqual({ error: 'Email and password are required' });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should return error when password is missing', async () => {
      const formData = createFormData({ email: 'test@example.com' });

      const result = await signUpWithEmail(formData);

      expect(result).toEqual({ error: 'Email and password are required' });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('should call supabase signUp with correct parameters', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
        error: null,
      });

      const formData = createFormData({
        email: 'test@example.com',
        password: 'password123',
      });

      const result = await signUpWithEmail(formData);

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: 'https://marksyncr.com/auth/callback',
        },
      });
      expect(result).toEqual({
        success: true,
        message: 'Check your email for the confirmation link',
      });
    });

    it('should use NEXT_PUBLIC_APP_URL when available', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.marksyncr.com';
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
        error: null,
      });

      const formData = createFormData({
        email: 'test@example.com',
        password: 'password123',
      });

      await signUpWithEmail(formData);

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: 'https://app.marksyncr.com/auth/callback',
        },
      });
    });

    it('should fallback to host with https when origin is not available', async () => {
      mockHeadersGet.mockImplementation((name) => {
        if (name === 'origin') return null;
        if (name === 'host') return 'marksyncr.com';
        return null;
      });
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
        error: null,
      });

      const formData = createFormData({
        email: 'test@example.com',
        password: 'password123',
      });

      await signUpWithEmail(formData);

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: 'https://marksyncr.com/auth/callback',
        },
      });
    });

    it('should return error when supabase returns an error', async () => {
      mockSignUp.mockResolvedValue({
        data: null,
        error: { message: 'Email already registered' },
      });

      const formData = createFormData({
        email: 'test@example.com',
        password: 'password123',
      });

      const result = await signUpWithEmail(formData);

      expect(result).toEqual({ error: 'Email already registered' });
    });

    it('should detect existing user with empty identities array', async () => {
      mockSignUp.mockResolvedValue({
        data: { user: { id: 'user-123', identities: [] } },
        error: null,
      });

      const formData = createFormData({
        email: 'existing@example.com',
        password: 'password123',
      });

      const result = await signUpWithEmail(formData);

      expect(result).toEqual({
        error: 'An account with this email already exists. Please sign in instead.',
      });
    });
  });

  describe('signInWithEmail', () => {
    it('should return error when email is missing', async () => {
      const formData = createFormData({ password: 'password123' });

      const result = await signInWithEmail(formData);

      expect(result).toEqual({ error: 'Email and password are required' });
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('should return error when password is missing', async () => {
      const formData = createFormData({ email: 'test@example.com' });

      const result = await signInWithEmail(formData);

      expect(result).toEqual({ error: 'Email and password are required' });
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it('should call supabase signInWithPassword and redirect on success', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const formData = createFormData({
        email: 'test@example.com',
        password: 'password123',
      });

      await expect(signInWithEmail(formData)).rejects.toThrow('REDIRECT:/dashboard');

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should return error when supabase returns an error', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' },
      });

      const formData = createFormData({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      const result = await signInWithEmail(formData);

      expect(result).toEqual({ error: 'Invalid login credentials' });
    });
  });

  describe('signInWithOAuth', () => {
    it('should call supabase signInWithOAuth with github provider', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: 'https://github.com/login/oauth/authorize?...' },
        error: null,
      });

      await expect(signInWithOAuth('github')).rejects.toThrow(
        'REDIRECT:https://github.com/login/oauth/authorize?...'
      );

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'https://marksyncr.com/auth/callback',
        },
      });
    });

    it('should call supabase signInWithOAuth with google provider', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
        error: null,
      });

      await expect(signInWithOAuth('google')).rejects.toThrow(
        'REDIRECT:https://accounts.google.com/o/oauth2/auth?...'
      );

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://marksyncr.com/auth/callback',
        },
      });
    });

    it('should use NEXT_PUBLIC_APP_URL when available', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.marksyncr.com';
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: 'https://github.com/login/oauth/authorize?...' },
        error: null,
      });

      await expect(signInWithOAuth('github')).rejects.toThrow('REDIRECT:');

      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'https://app.marksyncr.com/auth/callback',
        },
      });
    });

    it('should return error when supabase returns an error', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: null,
        error: { message: 'OAuth provider not configured' },
      });

      const result = await signInWithOAuth('github');

      expect(result).toEqual({ error: 'OAuth provider not configured' });
    });

    it('should return error when no URL is returned', async () => {
      mockSignInWithOAuth.mockResolvedValue({
        data: { url: null },
        error: null,
      });

      const result = await signInWithOAuth('github');

      expect(result).toEqual({ error: 'Failed to get OAuth URL' });
    });
  });

  describe('resetPassword', () => {
    it('should return error when email is missing', async () => {
      const formData = createFormData({});

      const result = await resetPassword(formData);

      expect(result).toEqual({ error: 'Email is required' });
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should call supabase resetPasswordForEmail with correct parameters', async () => {
      mockResetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      });

      const formData = createFormData({ email: 'test@example.com' });

      const result = await resetPassword(formData);

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: 'https://marksyncr.com/reset-password',
      });
      expect(result).toEqual({
        success: true,
        message: 'Check your email for the password reset link',
      });
    });

    it('should use NEXT_PUBLIC_APP_URL when available', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.marksyncr.com';
      mockResetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      });

      const formData = createFormData({ email: 'test@example.com' });

      await resetPassword(formData);

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: 'https://app.marksyncr.com/reset-password',
      });
    });

    it('should return error when supabase returns an error', async () => {
      mockResetPasswordForEmail.mockResolvedValue({
        data: null,
        error: { message: 'User not found' },
      });

      const formData = createFormData({ email: 'nonexistent@example.com' });

      const result = await resetPassword(formData);

      expect(result).toEqual({ error: 'User not found' });
    });
  });

  describe('signOut', () => {
    it('should call supabase signOut and redirect on success', async () => {
      mockSignOut.mockResolvedValue({
        error: null,
      });

      await expect(signOut()).rejects.toThrow('REDIRECT:/');

      expect(mockSignOut).toHaveBeenCalled();
    });

    it('should return error when supabase returns an error', async () => {
      mockSignOut.mockResolvedValue({
        error: { message: 'Session not found' },
      });

      const result = await signOut();

      expect(result).toEqual({ error: 'Session not found' });
    });
  });
});

describe('Origin URL Construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('should prioritize NEXT_PUBLIC_APP_URL over headers', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom.marksyncr.com';
    mockHeadersGet.mockImplementation((name) => {
      if (name === 'origin') return 'https://different.com';
      if (name === 'host') return 'different.com';
      return null;
    });
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
      error: null,
    });

    const formData = createFormData({
      email: 'test@example.com',
      password: 'password123',
    });

    await signUpWithEmail(formData);

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: 'https://custom.marksyncr.com/auth/callback',
        },
      })
    );
  });

  it('should use origin header when NEXT_PUBLIC_APP_URL is not set', async () => {
    mockHeadersGet.mockImplementation((name) => {
      if (name === 'origin') return 'https://origin.marksyncr.com';
      if (name === 'host') return 'host.marksyncr.com';
      return null;
    });
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
      error: null,
    });

    const formData = createFormData({
      email: 'test@example.com',
      password: 'password123',
    });

    await signUpWithEmail(formData);

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: 'https://origin.marksyncr.com/auth/callback',
        },
      })
    );
  });

  it('should construct URL from host with https when origin is null', async () => {
    mockHeadersGet.mockImplementation((name) => {
      if (name === 'origin') return null;
      if (name === 'host') return 'host.marksyncr.com';
      return null;
    });
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-123', identities: [{ id: 'identity-1' }] } },
      error: null,
    });

    const formData = createFormData({
      email: 'test@example.com',
      password: 'password123',
    });

    await signUpWithEmail(formData);

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: 'https://host.marksyncr.com/auth/callback',
        },
      })
    );
  });
});
