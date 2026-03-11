import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignUpEmail = vi.fn();
const mockSignInEmail = vi.fn();
const mockSignInSocial = vi.fn();
const mockSignOut = vi.fn();
const mockForgetPassword = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../config/auth', () => ({
  authClient: {
    getSession: mockGetSession,
    signUp: { email: mockSignUpEmail },
    signIn: { email: mockSignInEmail, social: mockSignInSocial },
    signOut: mockSignOut,
    forgetPassword: mockForgetPassword,
    resetPassword: vi.fn(),
  },
}));

const mockSetSupabaseAccessToken = vi.fn();

vi.mock('../../config/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(async () => ({ error: null })),
  },
  setSupabaseAccessToken: mockSetSupabaseAccessToken,
}));

describe('authService signup/signin with BetterAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetSession.mockResolvedValue({ data: { session: null } });

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          origin: 'https://ftrmsg.com',
          href: 'https://ftrmsg.com/',
          pathname: '/',
          search: '',
        },
        history: { replaceState: vi.fn() },
      },
      writable: true,
    });

    globalThis.fetch = vi.fn();
  });

  it('sign-up always returns requiresEmailVerification=true', async () => {
    mockSignUpEmail.mockResolvedValue({ data: {}, error: null });

    const { authService } = await import('../auth.service');
    const result = await authService.signUp('test@example.com', 'TestPass123!');

    expect(result).toEqual({ error: null, requiresEmailVerification: true });
    expect(mockSignUpEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'TestPass123!',
      name: 'test',
    });
  });

  it('maps unverified-email sign in to guidance message', async () => {
    mockSignInEmail.mockResolvedValue({
      data: null,
      error: { message: 'Email not verified' },
    });

    const { authService } = await import('../auth.service');
    const result = await authService.signIn('test@example.com', 'TestPass123!');

    expect(result.error).toBe(
      'Please verify your email before signing in. Check your inbox for the verification link.'
    );
  });

  it('preserves other sign in errors unchanged', async () => {
    mockSignInEmail.mockResolvedValue({
      data: null,
      error: { message: 'Invalid credentials' },
    });

    const { authService } = await import('../auth.service');
    const result = await authService.signIn('test@example.com', 'wrong');

    expect(result.error).toBe('Invalid credentials');
  });

  it('returns sign-up error when BetterAuth fails', async () => {
    mockSignUpEmail.mockResolvedValue({
      data: null,
      error: { message: 'Password too short' },
    });

    const { authService } = await import('../auth.service');
    const result = await authService.signUp('test@example.com', 'short');

    expect(result).toEqual({
      error: 'Password too short',
      requiresEmailVerification: false,
    });
  });
});

describe('Google OAuth via BetterAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGetSession.mockResolvedValue({ data: { session: null } });

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          origin: 'https://ftrmsg.com',
          href: 'https://ftrmsg.com/',
          pathname: '/',
          search: '',
        },
        history: { replaceState: vi.fn() },
      },
      writable: true,
    });

    globalThis.fetch = vi.fn();
  });

  it('uses signIn.social with google-ftrmsg provider', async () => {
    mockSignInSocial.mockResolvedValue({ data: {}, error: null });

    const { authService } = await import('../auth.service');
    const result = await authService.signInWithGoogle();

    expect(result.error).toBeNull();
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: 'google-ftrmsg',
      callbackURL: 'https://ftrmsg.com',
    });
  });

  it('returns error when OAuth fails', async () => {
    mockSignInSocial.mockResolvedValue({
      data: null,
      error: { message: 'Provider not configured' },
    });

    const { authService } = await import('../auth.service');
    const result = await authService.signInWithGoogle();

    expect(result.error).toBe('Provider not configured');
  });
});

describe('auth configuration guards', () => {
  it('source code uses BetterAuth, not Supabase auth', async () => {
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

    // Must NOT use Supabase auth directly
    expect(authServiceSrc).not.toContain('supabase.auth');
    expect(authServiceSrc).not.toContain('signInWithIdToken');

    // Must NOT use GIS popup
    expect(authModalSrc).not.toContain('google.accounts.id.initialize');
    expect(authModalSrc).not.toContain('renderButton');

    // MUST use BetterAuth via config/auth (which imports from better-auth)
    expect(authServiceSrc).toContain('../config/auth');

    const authConfigSrc = fs.readFileSync(
      path.resolve(__dirname, '../../config/auth.ts'),
      'utf-8'
    );
    expect(authConfigSrc).toContain('better-auth');
  });

  it('index.html does not load GIS script', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const indexHtml = fs.readFileSync(
      path.resolve(__dirname, '../../../index.html'),
      'utf-8'
    );

    expect(indexHtml).not.toContain('accounts.google.com/gsi/client');
  });
});
