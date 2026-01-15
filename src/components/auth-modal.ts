import { authService } from '../services/auth.service';
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
    this.mode = 'signin';
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
      signup: 'Create Account',
      reset: 'Reset Password'
    };

    const buttonTexts: Record<AuthMode, string> = {
      signin: 'Sign In',
      signup: 'Create Account',
      reset: 'Send Reset Link'
    };

    return `
      <div class="modal" style="max-width: 450px;">
        <h2>${titles[this.mode]}</h2>
        <p style="margin-bottom: 25px; color: #555;">
          ${this.mode === 'reset'
            ? "Enter your email and we'll send you a reset link."
            : 'Sign in to send your Sendaway message.'
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

        <div style="margin-top: 20px; font-size: 0.9rem;">
          ${this.getFooterLinks()}
        </div>

        <button
          onclick="document.getElementById('authModal').querySelector('.modal-overlay')?.click()"
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
