/**
 * Scroll-triggered animation system using IntersectionObserver.
 * Watches elements with `.animate-on-scroll` and applies animation classes on entry.
 */

const ANIMATION_MAP: Record<string, string> = {
  card: 'animate-card',
  'slide-left': 'animate-slide-left',
  'slide-right': 'animate-slide-right',
  'number-pop': 'animate-number-pop',
  'hero-text': 'animate-hero-text',
};

export function initScrollAnimations(): void {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    // Immediately reveal all scroll-animated elements
    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
      (el as HTMLElement).style.opacity = '1';
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target as HTMLElement;
        const animationType = el.dataset.animation;

        if (animationType && ANIMATION_MAP[animationType]) {
          el.classList.add(ANIMATION_MAP[animationType]);
        }

        // Counter animation
        if (el.dataset.counter) {
          const target = parseInt(el.dataset.counter, 10);
          animateCounter(el, target, 1500);
        }

        observer.unobserve(el);
      });
    },
    {
      rootMargin: '-100px',
      threshold: 0.1,
    }
  );

  document.querySelectorAll('.animate-on-scroll').forEach((el) => {
    observer.observe(el);
  });
}

export function animateCounter(element: HTMLElement, target: number, duration: number): void {
  const start = performance.now();

  function update(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic for a natural deceleration
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);

    element.textContent = current.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}
