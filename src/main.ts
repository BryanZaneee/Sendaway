import { authService } from './services/auth.service';
import { formHandler } from './components/form-handler';
import { messagesDashboard } from './components/messages-dashboard';
import { toast } from './components/toast';
import { initScrollAnimations } from './utils/scroll-animations';

let dropdownCloseHandler: ((e: MouseEvent) => void) | null = null;

// Initialize the application
function init(): void {
  // Initialize form handler
  formHandler.init();

  // Initialize messages dashboard
  messagesDashboard.init();

  // Update UI based on auth state
  authService.onAuthStateChange((state) => {
    const user = state.user;
    const displayName = user
      ? user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Account'
      : '';
    const email = user?.email || '';
    updateAuthUI(user !== null, state.profile?.tier === 'pro', displayName, email);
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
function updateAuthUI(isLoggedIn: boolean, isPro: boolean, displayName: string, email: string): void {
  const navInner = document.querySelector('.nav-inner');
  if (!navInner) return;

  // Clean up previous dropdown close handler
  if (dropdownCloseHandler) {
    document.removeEventListener('click', dropdownCloseHandler);
    dropdownCloseHandler = null;
  }

  // Remove existing auth button if any
  const existingAuthBtn = document.getElementById('authBtn');
  existingAuthBtn?.remove();

  // Create auth button
  const authBtn = document.createElement('div');
  authBtn.id = 'authBtn';
  authBtn.style.cssText = 'display: flex; align-items: center; gap: 15px;';

  if (isLoggedIn) {
    // Truncate display name for the button
    const truncatedName = displayName.length > 20 ? displayName.substring(0, 20) + '...' : displayName;

    authBtn.innerHTML = `
      ${isPro ? `
        <span style="background: linear-gradient(135deg, var(--pastel-pink), var(--pastel-purple)); border: none; padding: 3px 10px; font-family: 'Caveat', cursive; font-weight: 600; font-size: 0.9rem; border-radius: 20px; color: #1A1721;">
          Pro
        </span>
      ` : ''}
      <div style="position: relative;">
        <button id="userMenuBtn" style="background: rgba(255, 255, 255, 0.6); border: 1px solid rgba(90, 80, 100, 0.15); border-radius: 50px; font-family: 'Lora', serif; font-weight: 600; cursor: pointer; padding: 6px 14px; display: flex; align-items: center; gap: 8px; font-size: 0.9rem; transition: all 0.3s ease; backdrop-filter: blur(8px); color: #5B5468;">
          ${truncatedName}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="2,4 6,8 10,4"></polyline>
          </svg>
        </button>
        <div id="userDropdown" style="display: none; position: absolute; right: 0; top: calc(100% + 8px); min-width: 220px; background: rgba(250, 246, 240, 0.95); border: 1px solid rgba(90, 80, 100, 0.15); border-radius: 16px; box-shadow: 0 8px 30px rgba(90, 80, 100, 0.12); backdrop-filter: blur(20px); z-index: 200; overflow: hidden;">
          <div style="padding: 14px 16px; border-bottom: 1px solid rgba(90, 80, 100, 0.1);">
            <div style="font-family: 'Playfair Display', serif; font-weight: 700; font-size: 0.95rem; word-break: break-word; color: #1A1721;">${displayName}</div>
            <div style="font-size: 0.8rem; color: #8A8494; margin-top: 2px; word-break: break-all;">${email}</div>
          </div>
          <button id="dropdownSignOutBtn" style="width: 100%; background: none; border: none; font-family: 'Lora', serif; font-weight: 600; font-size: 0.9rem; cursor: pointer; padding: 12px 16px; text-align: left; transition: all 0.3s ease; color: #5B5468;">
            Sign Out
          </button>
        </div>
      </div>
    `;
  } else {
    authBtn.innerHTML = `
      <button id="signInBtn" style="background: none; border: none; font-family: 'Lora', serif; font-weight: 600; cursor: pointer; border-bottom: 1px solid var(--pastel-pink); color: #5B5468; transition: color 0.3s ease;">
        Sign In
      </button>
    `;
  }

  navInner.appendChild(authBtn);

  // Attach listeners after DOM insertion
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  const dropdownSignOutBtn = document.getElementById('dropdownSignOutBtn');
  const signInBtn = document.getElementById('signInBtn');

  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = userDropdown.style.display === 'block';
      userDropdown.style.display = isOpen ? 'none' : 'block';
    });

    dropdownCloseHandler = () => {
      userDropdown.style.display = 'none';
    };
    document.addEventListener('click', dropdownCloseHandler);
  }

  dropdownSignOutBtn?.addEventListener('click', async () => {
    await authService.signOut();
    toast.info('Signed out');
  });

  // Hover effect on sign out button
  dropdownSignOutBtn?.addEventListener('mouseenter', () => {
    dropdownSignOutBtn.style.background = 'rgba(232, 196, 200, 0.3)';
  });
  dropdownSignOutBtn?.addEventListener('mouseleave', () => {
    dropdownSignOutBtn.style.background = 'none';
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
