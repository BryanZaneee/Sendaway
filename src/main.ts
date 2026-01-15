import { authService } from './services/auth.service';
import { formHandler } from './components/form-handler';
import { messagesDashboard } from './components/messages-dashboard';
import { toast } from './components/toast';

// Initialize the application
function init(): void {
  // Initialize form handler
  formHandler.init();

  // Initialize messages dashboard
  messagesDashboard.init();

  // Update UI based on auth state
  authService.onAuthStateChange((state) => {
    updateAuthUI(state.user !== null, state.profile?.tier === 'pro');
  });

  // Check for success/cancel from Stripe redirect
  handleStripeRedirect();

  console.log('Sendaway initialized');
}

/**
 * Update header UI based on auth state
 */
function updateAuthUI(isLoggedIn: boolean, isPro: boolean): void {
  const navInner = document.querySelector('.nav-inner');
  if (!navInner) return;

  // Remove existing auth button if any
  const existingAuthBtn = document.getElementById('authBtn');
  existingAuthBtn?.remove();

  // Create auth button
  const authBtn = document.createElement('div');
  authBtn.id = 'authBtn';
  authBtn.style.cssText = 'display: flex; align-items: center; gap: 15px;';

  if (isLoggedIn) {
    authBtn.innerHTML = `
      ${isPro ? `
        <span style="background: var(--pastel-pink); border: 2px solid black; padding: 3px 8px; font-weight: 700; font-size: 0.8rem;">
          PRO
        </span>
      ` : ''}
      <button id="signOutBtn" style="background: none; border: none; font-family: inherit; font-weight: 700; cursor: pointer; text-decoration: underline;">
        Sign Out
      </button>
    `;

    // Add sign out handler after insertion
    setTimeout(() => {
      document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        await authService.signOut();
        toast.info('Signed out');
      });
    }, 0);
  } else {
    authBtn.innerHTML = `
      <button id="signInBtn" style="background: none; border: none; font-family: inherit; font-weight: 700; cursor: pointer; border-bottom: 2px solid black;">
        Sign In
      </button>
    `;

    setTimeout(() => {
      document.getElementById('signInBtn')?.addEventListener('click', () => {
        import('./components/auth-modal').then(({ authModal }) => {
          authModal.show();
        });
      });
    }, 0);
  }

  // Find the "Start Now" link and insert auth button after it
  const startNowLink = navInner.querySelector('a[href="#create"]');
  if (startNowLink) {
    startNowLink.after(authBtn);
  } else {
    navInner.appendChild(authBtn);
  }
}

/**
 * Handle redirect from Stripe checkout
 */
function handleStripeRedirect(): void {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has('success')) {
    toast.success('Payment successful! You are now a Pro user.');
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    // Refresh profile to get updated tier
    authService.refreshProfile();
  }

  if (urlParams.has('canceled')) {
    toast.info('Payment was cancelled');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
