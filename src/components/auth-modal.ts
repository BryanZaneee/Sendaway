import { authService } from '../services/auth.service';
import { toast } from './toast';

type AuthMode = 'signin' | 'signup' | 'reset';

const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
</svg>`;

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
        <p style="margin-bottom: 25px; color: #555;">
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

          <button id="googleSignIn" type="button" class="btn" style="background: white; color: black; display: flex; align-items: center; justify-content: center; gap: 10px;">
            ${GOOGLE_SVG}
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
          <a href="#" id="switchToSignup" style="color: black; font-weight: 700;">Sign up</a>
          <br>
          <a href="#" id="switchToReset" style="color: #555; font-size: 0.85rem;">Forgot password?</a>
        `;
      case 'signup':
        return `
          <span>Already have an account? </span>
          <a href="#" id="switchToSignin" style="color: black; font-weight: 700;">Sign in</a>
        `;
      case 'reset':
        return `
          <a href="#" id="switchToSignin" style="color: black; font-weight: 700;">Back to sign in</a>
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

    // Google OAuth
    document.getElementById('googleSignIn')?.addEventListener('click', async () => {
      const btn = document.getElementById('googleSignIn') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = 'Redirecting...';

      const result = await authService.signInWithGoogle();
      if (result.error) {
        toast.error(result.error);
        btn.disabled = false;
        btn.innerHTML = `
          ${GOOGLE_SVG}
          Continue with Google
        `;
      }
      // On success, OAuth will redirect - no further action needed
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
        let result: { error: string | null };

        switch (this.mode) {
          case 'signin':
            result = await authService.signIn(email, password);
            break;
          case 'signup':
            result = await authService.signUp(email, password);
            break;
          case 'reset':
            result = await authService.resetPassword(email);
            break;
        }

        if (result.error) {
          toast.error(result.error);
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          return;
        }

        if (this.mode === 'signup') {
          toast.success('Check your email to confirm your account!');
          this.mode = 'signin';
          this.render();
        } else if (this.mode === 'reset') {
          toast.success('Password reset link sent to your email!');
          this.mode = 'signin';
          this.render();
        } else {
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
