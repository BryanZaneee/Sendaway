import { authService, type AuthResult, type SignUpResult } from '../services/auth.service';
import { toast } from './toast';

type AuthMode = 'signin' | 'signup' | 'reset';

class AuthModal {
  private overlay: HTMLElement | null = null;
  private mode: AuthMode = 'signin';
  private onSuccessCallback: (() => void) | null = null;

  /**
   * Show the auth modal
   */
  show(onSuccess?: () => void): void {
    this.onSuccessCallback = onSuccess || null;
    this.mode = 'signup';
    this.render();
  }

  /**
   * Hide the auth modal
   */
  hide(): void {
    if (this.overlay) {
      this.overlay.classList.remove('active');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
      }, 200);
    }
  }

  private render(): void {
    // Remove existing modal if any
    this.overlay?.remove();

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay active';
    this.overlay.id = 'authModal';
    this.overlay.innerHTML = this.getModalHTML();

    document.body.appendChild(this.overlay);

    // Event listeners
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    this.setupFormHandler();
  }

  private getModalHTML(): string {
    const titles: Record<AuthMode, string> = {
      signin: 'Welcome Back',
      signup: 'Sign Up',
      reset: 'Reset Password'
    };

    const buttonTexts: Record<AuthMode, string> = {
      signin: 'Sign In',
      signup: 'Sign Up',
      reset: 'Send Reset Link'
    };

    return `
      <div class="modal" style="max-width: 450px;">
        <h2>${titles[this.mode]}</h2>
        <p style="margin-bottom: 25px; color: #8A8494;">
          ${this.mode === 'reset'
            ? "Enter your email and we'll send you a reset link."
            : this.mode === 'signup'
            ? 'Sign up to send your FtrMsg.'
            : 'Sign in to send your FtrMsg message.'
          }
        </p>

        <form id="authForm" style="text-align: left;">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="authEmail" required placeholder="you@example.com">
          </div>

          ${this.mode !== 'reset' ? `
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="authPassword" required placeholder="Your password" minlength="6">
            </div>
          ` : ''}

          <button type="submit" class="btn" style="margin-top: 10px;">
            ${buttonTexts[this.mode]}
          </button>
        </form>

        ${this.mode !== 'reset' ? `
          <div style="display: flex; align-items: center; margin: 20px 0; gap: 15px;">
            <div style="flex: 1; height: 1px; background: #ddd;"></div>
            <span style="color: #888; font-size: 0.85rem;">or</span>
            <div style="flex: 1; height: 1px; background: #ddd;"></div>
          </div>

          <button id="googleSignInBtn" type="button" style="
            display: flex; align-items: center; justify-content: center; gap: 10px;
            width: 100%; padding: 10px 16px; border: 1px solid #dadce0; border-radius: 50px;
            background: #fff; cursor: pointer; font-family: 'Lora', serif; font-size: 0.95rem;
            font-weight: 500; color: #3c4043; transition: background 0.2s ease, box-shadow 0.2s ease;
          ">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        ` : ''}

        <div style="margin-top: 20px; font-size: 0.9rem;">
          ${this.getFooterLinks()}
        </div>

        <button id="closeAuthModal"
          style="position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 1.5rem; cursor: pointer;"
        >&times;</button>
      </div>
    `;
  }

  private getFooterLinks(): string {
    switch (this.mode) {
      case 'signin':
        return `
          <span>Don't have an account? </span>
          <a href="#" id="switchToSignup" style="color: #1A1721; font-weight: 600;">Sign up</a>
          <br>
          <a href="#" id="switchToReset" style="color: #8A8494; font-size: 0.85rem;">Forgot password?</a>
        `;
      case 'signup':
        return `
          <span>Already have an account? </span>
          <a href="#" id="switchToSignin" style="color: #1A1721; font-weight: 600;">Sign in</a>
        `;
      case 'reset':
        return `
          <a href="#" id="switchToSignin" style="color: #1A1721; font-weight: 600;">Back to sign in</a>
        `;
    }
  }

  private setupFormHandler(): void {
    const form = document.getElementById('authForm') as HTMLFormElement;
    const emailInput = document.getElementById('authEmail') as HTMLInputElement;
    const passwordInput = document.getElementById('authPassword') as HTMLInputElement | null;

    // Close button
    document.getElementById('closeAuthModal')?.addEventListener('click', () => {
      this.hide();
    });

    // Mode switching
    document.getElementById('switchToSignup')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.mode = 'signup';
      this.render();
    });

    document.getElementById('switchToSignin')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.mode = 'signin';
      this.render();
    });

    document.getElementById('switchToReset')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.mode = 'reset';
      this.render();
    });

    // Google OAuth via Supabase redirect (not GIS popup — popup mode is broken
    // by Google's Cross-Origin-Opener-Policy blocking postMessage).
    const googleBtn = document.getElementById('googleSignInBtn');
    googleBtn?.addEventListener('click', async () => {
      googleBtn.setAttribute('disabled', 'true');
      googleBtn.textContent = 'Redirecting...';
      const result = await authService.signInWithGoogle();
      if (result.error) {
        toast.error(result.error);
        googleBtn.removeAttribute('disabled');
        googleBtn.textContent = 'Continue with Google';
      }
      // On success, page redirects — no need to handle here
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput?.value || '';
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      const originalText = submitBtn.textContent;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait...';

      try {
        if (this.mode === 'signup') {
          const result: SignUpResult = await authService.signUp(email, password);

          if (result.error) {
            toast.error(result.error);
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
          }

          if (result.requiresEmailVerification) {
            toast.success('Check your email to confirm your account!');
            this.mode = 'signin';
            this.render();
            return;
          }

          toast.success('Account created and signed in successfully!');
          this.hide();
          this.onSuccessCallback?.();
        } else {
          const result: AuthResult = this.mode === 'signin'
            ? await authService.signIn(email, password)
            : await authService.resetPassword(email);

          if (result.error) {
            toast.error(result.error);
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
          }

          if (this.mode === 'reset') {
            toast.success('Password reset link sent to your email!');
            this.mode = 'signin';
            this.render();
            return;
          }

          toast.success('Signed in successfully!');
          this.hide();
          this.onSuccessCallback?.();
        }
      } catch (err) {
        toast.error('An unexpected error occurred');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
}

export const authModal = new AuthModal();
