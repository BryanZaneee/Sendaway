import { authClient } from '../config/auth';
import { supabase, setSupabaseAccessToken } from '../config/supabase';
import type { Profile } from '../types/database';



export interface FtrMsgUser {
  id: string;    // Supabase UUID (from bridge)
  email: string;
  name: string;
}

export interface AuthState {
  user: FtrMsgUser | null;
  profile: Profile | null;
}

export interface AuthResult {
  error: string | null;
}

export interface SignUpResult extends AuthResult {
  requiresEmailVerification: boolean;
}

interface BridgeTokenResponse {
  token: string;
  supabaseUserId: string;
}

class AuthService {
  private currentUser: FtrMsgUser | null = null;
  private currentProfile: Profile | null = null;
  private listeners: ((state: AuthState) => void)[] = [];
  private tokenExpiry: number = 0;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      const { data } = await authClient.getSession();
      if (data?.user) {
        const bridgeData = await this.fetchBridgeToken();
        if (bridgeData) {
          this.currentUser = {
            id: bridgeData.supabaseUserId,
            email: data.user.email,
            name: data.user.name || data.user.email,
          };
          setSupabaseAccessToken(bridgeData.token);
          await this.fetchProfile();
        }
      }

      // Handle password reset callback
      await this.handlePasswordResetCallback();
    } catch (err) {
      console.warn('Auth initialization failed:', err);
    }

    this.notifyListeners();
  }

  private async handlePasswordResetCallback() {
    const url = new URL(window.location.href);
    if (url.pathname === '/reset-password' && url.searchParams.has('token')) {
      const token = url.searchParams.get('token')!;
      const newPassword = prompt('Enter your new password (minimum 8 characters):');
      if (newPassword && newPassword.length >= 8) {
        const { error } = await authClient.resetPassword({
          newPassword,
          token,
        });
        if (error) {
          console.error('Password reset failed:', error.message);
        } else {
          window.history.replaceState({}, document.title, '/');
        }
      }
    }
  }

  private async fetchBridgeToken(): Promise<BridgeTokenResponse | null> {
    try {
      const res = await fetch('/api/bridge/supabase-token', {
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Bridge token fetch failed:', res.status);
        return null;
      }

      const data = await res.json();
      this.tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 min (bridge JWT has 1hr TTL)
      return data;
    } catch (err) {
      console.error('Bridge token fetch error:', err);
      return null;
    }
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.currentUser) return;

    // Refresh if within 10 minutes of expiry
    if (Date.now() > this.tokenExpiry - 10 * 60 * 1000) {
      const bridgeData = await this.fetchBridgeToken();
      if (bridgeData) {
        setSupabaseAccessToken(bridgeData.token);
      }
    }
  }

  private async fetchProfile() {
    if (!this.currentUser) return;

    await this.ensureFreshToken();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', this.currentUser.id)
      .single();

    if (data) {
      this.currentProfile = data;
      return;
    }

    // Profile missing — create via RPC
    console.warn('Profile not found, creating via RPC...', error?.message);
    const email = this.currentUser.email;
    await supabase.rpc('ensure_profile_exists', {
      p_user_id: this.currentUser.id,
      p_email: email,
    });

    const { data: newProfile, error: retryError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', this.currentUser.id)
      .single();

    if (newProfile) {
      this.currentProfile = newProfile;
    } else {
      console.error('Failed to create/fetch profile:', retryError);
    }
  }

  private notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    this.listeners.push(callback);
    callback(this.getState());
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  getState(): AuthState {
    return {
      user: this.currentUser,
      profile: this.currentProfile,
    };
  }

  getUser(): FtrMsgUser | null {
    return this.currentUser;
  }

  getProfile(): Profile | null {
    return this.currentProfile;
  }

  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  isPro(): boolean {
    return this.currentProfile?.tier === 'pro';
  }

  hasFreeMessageUsed(): boolean {
    return this.currentProfile?.free_message_used ?? false;
  }

  getRemainingStorage(): number {
    if (!this.currentProfile) return 0;
    return this.currentProfile.storage_limit_bytes - this.currentProfile.storage_used_bytes;
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: email.split('@')[0],
    });

    if (error) {
      return { error: error.message || String(error), requiresEmailVerification: false };
    }

    return { error: null, requiresEmailVerification: true };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      const msg = error.message || String(error);
      const isUnverified = /verif/i.test(msg) || /confirm/i.test(msg);
      if (isUnverified) {
        return {
          error: 'Please verify your email before signing in. Check your inbox for the verification link.',
        };
      }
      return { error: msg };
    }

    if (data?.user) {
      const bridgeData = await this.fetchBridgeToken();
      if (bridgeData) {
        this.currentUser = {
          id: bridgeData.supabaseUserId,
          email: data.user.email,
          name: data.user.name || data.user.email,
        };
        setSupabaseAccessToken(bridgeData.token);
        await this.fetchProfile();
        this.notifyListeners();
      }
    }

    return { error: null };
  }

  async signOut(): Promise<void> {
    await authClient.signOut();
    setSupabaseAccessToken(null);
    this.currentUser = null;
    this.currentProfile = null;
    this.tokenExpiry = 0;
    this.notifyListeners();
  }

  async resetPassword(email: string): Promise<AuthResult> {
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      return { error: error.message || String(error) };
    }

    return { error: null };
  }

  async signInWithGoogle(): Promise<AuthResult> {
    const { error } = await authClient.signIn.social({
      provider: 'google-ftrmsg',
      callbackURL: window.location.origin,
    });

    if (error) {
      return { error: error.message || String(error) };
    }

    return { error: null };
  }

  async refreshProfile(): Promise<void> {
    await this.fetchProfile();
    this.notifyListeners();
  }
}

export const authService = new AuthService();
