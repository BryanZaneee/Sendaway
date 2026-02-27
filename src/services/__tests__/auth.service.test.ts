import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: mockGetSession,
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      resetPasswordForEmail: mockResetPasswordForEmail,
      signInWithOAuth: mockSignInWithOAuth,
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({ error: null })),
  },
}));

describe('authService signup/signin email verification behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetSession.mockResolvedValue({ data: { session: null } });

    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://ftrmsg.com' } },
      writable: true,
    });
  });

  it('returns requiresEmailVerification=true when sign up has no session', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    const { authService } = await import('../auth.service');
    const result = await authService.signUp('test@example.com', 'TestPass123!');

    expect(result).toEqual({ error: null, requiresEmailVerification: true });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'TestPass123!',
      options: { emailRedirectTo: 'https://ftrmsg.com/' },
    });
  });

  it('returns requiresEmailVerification=false when sign up creates a session', async () => {
    mockSignUp.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null });

    const { authService } = await import('../auth.service');
    const result = await authService.signUp('test@example.com', 'TestPass123!');

    expect(result).toEqual({ error: null, requiresEmailVerification: false });
  });

  it('maps unconfirmed-email sign in to actionable guidance', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Email not confirmed' } });

    const { authService } = await import('../auth.service');
    const result = await authService.signIn('test@example.com', 'TestPass123!');

    expect(result.error).toBe('Please confirm your email before signing in. Check your inbox for the confirmation link.');
  });

  it('preserves other sign in errors unchanged', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    const { authService } = await import('../auth.service');
    const result = await authService.signIn('test@example.com', 'wrong');

    expect(result.error).toBe('Invalid login credentials');
  });
});
