import { supabase } from '../config/supabase';
import type { Profile } from '../types/database';
import type { User } from '@supabase/supabase-js';

export interface AuthState {
  user: User | null;
  profile: Profile | null;
}

export interface AuthResult {
  error: string | null;
}

export interface SignUpResult extends AuthResult {
  requiresEmailVerification: boolean;
}

class AuthService {
  private currentUser: User | null = null;
  private currentProfile: Profile | null = null;
  private listeners: ((state: AuthState) => void)[] = [];

  constructor() {
    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (_event, session) => {
      this.currentUser = session?.user ?? null;

      if (this.currentUser) {
        await this.fetchProfile();
      } else {
        this.currentProfile = null;
      }

      this.notifyListeners();
    });

    // Initialize on load
    this.initialize();
  }

  private async initialize() {
    const { data: { session } } = await supabase.auth.getSession();
    this.currentUser = session?.user ?? null;

    if (this.currentUser) {
      await this.fetchProfile();
    }

    this.notifyListeners();
  }

  private async fetchProfile() {
    if (!this.currentUser) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', this.currentUser.id)
      .single();

    if (data) {
      this.currentProfile = data;
      return;
    }

    // Profile missing — create it via RPC (handles OAuth identity linking,
    // missing trigger, or trigger failure)
    console.warn('Profile not found, creating via RPC...', error?.message);
    const email = this.currentUser.email ?? this.currentUser.user_metadata?.email ?? '';
    await supabase.rpc('ensure_profile_exists', {
      p_user_id: this.currentUser.id,
      p_email: email,
    });

    // Fetch the newly created profile
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

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    this.listeners.push(callback);

    // Immediately call with current state
    callback(this.getState());

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Get current auth state
   */
  getState(): AuthState {
    return {
      user: this.currentUser,
      profile: this.currentProfile,
    };
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.currentUser;
  }

  /**
   * Get current profile
   */
  getProfile(): Profile | null {
    return this.currentProfile;
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Check if user is pro tier
   */
  isPro(): boolean {
    return this.currentProfile?.tier === 'pro';
  }

  /**
   * Check if free message has been used
   */
  hasFreeMessageUsed(): boolean {
    return this.currentProfile?.free_message_used ?? false;
  }

  /**
   * Get remaining storage in bytes
   */
  getRemainingStorage(): number {
    if (!this.currentProfile) return 0;
    return this.currentProfile.storage_limit_bytes - this.currentProfile.storage_used_bytes;
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });

    if (error) {
      return { error: error.message, requiresEmailVerification: false };
    }

    return {
      error: null,
      requiresEmailVerification: data.session === null
    };
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      const isUnconfirmedEmail = /email.*not.*confirm/i.test(error.message);
      if (isUnconfirmedEmail) {
        return {
          error: 'Please confirm your email before signing in. Check your inbox for the confirmation link.'
        };
      }

      return { error: error.message };
    }

    return { error: null };
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  }

  /**
   * Refresh profile data from database
   */
  async refreshProfile(): Promise<void> {
    await this.fetchProfile();
    this.notifyListeners();
  }

  /**
   * Sign in with Google via Supabase OAuth redirect flow.
   * Uses full-page redirect (not popup) to avoid COOP/postMessage issues
   * and Safari ITP cookie blocking.
   */
  async signInWithGoogle(): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  }
}

// Export singleton instance
export const authService = new AuthService();
