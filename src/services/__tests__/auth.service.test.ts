import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignInWithIdToken = vi.fn();
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
      signInWithIdToken: mockSignInWithIdToken,
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

describe('Google OAuth redirect flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetSession.mockResolvedValue({ data: { session: null } });

    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://ftrmsg.com' } },
      writable: true,
    });
  });

  it('uses signInWithOAuth redirect (not signInWithIdToken popup)', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });

    const { authService } = await import('../auth.service');
    const result = await authService.signInWithGoogle();

    expect(result.error).toBeNull();
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://ftrmsg.com' },
    });
    // Must NOT call signInWithIdToken — popup mode is broken by Google's COOP header
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns error when OAuth redirect fails', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: null, error: { message: 'Provider not enabled' } });

    const { authService } = await import('../auth.service');
    const result = await authService.signInWithGoogle();

    expect(result.error).toBe('Provider not enabled');
  });

  it('does not expose signInWithGoogleIdToken method', async () => {
    const { authService } = await import('../auth.service');

    // The old GIS popup method must not exist — it causes COOP errors
    expect((authService as unknown as Record<string, unknown>).signInWithGoogleIdToken).toBeUndefined();
  });
});

describe('auth configuration guards', () => {
  it('source code does not import GIS/better-auth libraries', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const authServiceSrc = fs.readFileSync(
      path.resolve(__dirname, '../auth.service.ts'),
      'utf-8'
    );
    const authModalSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/auth-modal.ts'),
      'utf-8'
    );

    // No GIS popup usage (causes COOP postMessage errors)
    expect(authServiceSrc).not.toContain('signInWithIdToken');
    expect(authModalSrc).not.toContain('google.accounts.id.initialize');
    expect(authModalSrc).not.toContain('renderButton');

    // No BetterAuth (wrong auth provider)
    expect(authServiceSrc).not.toContain('better-auth');
    expect(authServiceSrc).not.toContain('auth.shuttrr');
    expect(authModalSrc).not.toContain('better-auth');
  });

  it('index.html does not load GIS script', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const indexHtml = fs.readFileSync(
      path.resolve(__dirname, '../../../index.html'),
      'utf-8'
    );

    // GIS script tag must not be present — popup mode is broken
    expect(indexHtml).not.toContain('accounts.google.com/gsi/client');
  });
});
