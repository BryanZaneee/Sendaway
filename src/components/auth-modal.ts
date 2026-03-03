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

          <div id="googleSignInContainer" style="display: flex; justify-content: center;"></div>
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

    // Google Identity Services
    const googleContainer = document.getElementById('googleSignInContainer');
    if (googleContainer && window.google?.accounts?.id) {
      google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async (response: google.accounts.id.CredentialResponse) => {
          const result = await authService.signInWithGoogleIdToken(response.credential);
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success('Signed in with Google!');
            this.hide();
            this.onSuccessCallback?.();
          }
        },
      });
      google.accounts.id.renderButton(googleContainer, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: googleContainer.offsetWidth,
      });
    }

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
