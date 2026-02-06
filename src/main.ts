import { authService } from './services/auth.service';
import { formHandler } from './components/form-handler';
import { messagesDashboard } from './components/messages-dashboard';
import { toast } from './components/toast';
import { initScrollAnimations } from './utils/scroll-animations';

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

  // Set up scroll animations
  setupAnimations();

  console.log('FtrMsg initialized');
}

/**
 * Attach animation classes to page elements and initialize scroll observer
 */
function setupAnimations(): void {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hero headline — split into staggered lines
  const heroHeading = document.querySelector('.hero h1');
  if (heroHeading) {
    const lines = heroHeading.innerHTML.split('<br>');
    heroHeading.innerHTML = lines
      .map(
        (line, i) =>
          `<div style="opacity:0" class="animate-hero-text stagger-${i + 1}">${line}</div>`
      )
      .join('');
  }

  // Hero form — bounce entrance after short delay
  const form = document.querySelector('.capsule-form') as HTMLElement | null;
  if (form && !prefersReducedMotion) {
    form.style.opacity = '0';
    setTimeout(() => {
      form.classList.add('animate-form');
    }, 300);
  }

  // How It Works section heading
  const howHeading = document.querySelector('#howItWorks h2');
  if (howHeading) {
    howHeading.classList.add('animate-on-scroll');
    howHeading.setAttribute('data-animation', 'slide-left');
  }

  // Step cards — staggered card entrance
  document.querySelectorAll('.step-card').forEach((card, i) => {
    card.classList.add('animate-on-scroll', `stagger-${i + 1}`);
    card.setAttribute('data-animation', 'card');
  });

  // Step number circles — pop with spin
  document.querySelectorAll('.step-number').forEach((num) => {
    num.classList.add('animate-on-scroll');
    num.setAttribute('data-animation', 'number-pop');
  });

  // Message Demo section
  const demoHeading = document.querySelector('#messageDemoSection h2');
  if (demoHeading) {
    demoHeading.classList.add('animate-on-scroll');
    demoHeading.setAttribute('data-animation', 'slide-right');
  }

  const demoCard = document.querySelector('.demo-message-card');
  if (demoCard) {
    demoCard.classList.add('animate-on-scroll');
    demoCard.setAttribute('data-animation', 'card');
  }

  // Trust section heading + cards
  const trustHeading = document.querySelector('#trustSection h2');
  if (trustHeading) {
    trustHeading.classList.add('animate-on-scroll');
    trustHeading.setAttribute('data-animation', 'slide-left');
  }

  document.querySelectorAll('.trust-card').forEach((card, i) => {
    card.classList.add('animate-on-scroll', `stagger-${i + 1}`);
    card.setAttribute('data-animation', 'card');
  });

  // Pricing section heading + cards
  const pricingHeading = document.querySelector('#pricingSection h2');
  if (pricingHeading) {
    pricingHeading.classList.add('animate-on-scroll');
    pricingHeading.setAttribute('data-animation', 'slide-right');
  }

  document.querySelectorAll('.price-card').forEach((card, i) => {
    card.classList.add('animate-on-scroll', `stagger-${i + 1}`);
    card.setAttribute('data-animation', 'card');
  });

  // FAQ heading + details
  const faqHeading = document.querySelector('#faqSection h2');
  if (faqHeading) {
    faqHeading.classList.add('animate-on-scroll');
    faqHeading.setAttribute('data-animation', 'slide-left');
  }

  document.querySelectorAll('#faqSection details').forEach((detail, i) => {
    detail.classList.add('animate-on-scroll', `stagger-${i + 1}`);
    detail.setAttribute('data-animation', 'slide-left');
  });

  // Social proof counter
  const counterEl = document.querySelector('[data-counter]') as HTMLElement | null;
  if (counterEl) {
    counterEl.classList.add('animate-on-scroll');
  }

  // Initialize the observer
  initScrollAnimations();
}

/**
 * Initialize development tools (only in dev mode)
 * Uncomment initDevTools() call in init() to enable
 */
// function initDevTools(): void {
//   const isDev = window.location.hostname === 'localhost' ||
//     window.location.hostname === '127.0.0.1' ||
//     new URLSearchParams(window.location.search).has('dev');
//
//   if (isDev) {
//     import('./components/dev-color-picker').then(({ devColorPicker }) => {
//       devColorPicker.init();
//       console.log('Dev color picker loaded (Ctrl+Shift+C to toggle)');
//     });
//   }
// }

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
  } else {
    authBtn.innerHTML = `
      <button id="signInBtn" style="background: none; border: none; font-family: inherit; font-weight: 700; cursor: pointer; border-bottom: 2px solid black;">
        Sign In
      </button>
    `;
  }

  navInner.appendChild(authBtn);

  // Attach listeners after DOM insertion to ensure elements exist
  const signOutBtn = document.getElementById('signOutBtn');
  const signInBtn = document.getElementById('signInBtn');

  signOutBtn?.addEventListener('click', async () => {
    await authService.signOut();
    toast.info('Signed out');
  });

  signInBtn?.addEventListener('click', () => {
    import('./components/auth-modal').then(({ authModal }) => {
      authModal.show();
    });
  });
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
