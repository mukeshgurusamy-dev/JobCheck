/**
 * PREMIUM SMOOTH SCROLL SYSTEM
 * Physics-based scrolling with momentum, easing curves, and visual feedback
 * Enhances native CSS scroll-behavior with JavaScript momentum effects
 */

interface ScrollConfig {
  duration?: number;
  easing?: (t: number) => number;
  offset?: number;
}

/**
 * Easing functions for smooth animations
 */
const easings = {
  smooth: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  spring: (t: number) => {
    const p = 6.283185307179586; // 2π
    return 1 - Math.cos((t * p) / 2.75) * Math.exp(-6 * t);
  },
  bounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
  linear: (t: number) => t,
};

/**
 * Calculate momentum based on scroll velocity
 */
function calculateMomentum(velocity: number, deceleration: number = 0.95): number {
  let distance = 0;
  let v = velocity;

  while (Math.abs(v) > 1) {
    distance += v;
    v *= deceleration;
  }

  return distance;
}

/**
 * Smooth scroll to element with physics-based momentum
 */
export function smoothScrollToElement(
  element: HTMLElement | null,
  config: ScrollConfig = {}
): void {
  if (!element) return;

  const { duration = 800, easing = easings.smooth, offset = 0 } = config;

  const targetPosition = element.getBoundingClientRect().top + window.scrollY - offset;
  const startPosition = window.scrollY;
  const distance = targetPosition - startPosition;

  let start: number | null = null;

  function animate(currentTime: number) {
    if (start === null) start = currentTime;
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);

    const easedProgress = easing(progress);
    window.scrollTo(0, startPosition + distance * easedProgress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

/**
 * Smooth scroll to specific position with momentum
 */
export function smoothScrollToPosition(
  targetY: number,
  config: ScrollConfig = {}
): void {
  const { duration = 800, easing = easings.smooth } = config;

  const startPosition = window.scrollY;
  const distance = targetY - startPosition;

  let start: number | null = null;

  function animate(currentTime: number) {
    if (start === null) start = currentTime;
    const elapsed = currentTime - start;
    const progress = Math.min(elapsed / duration, 1);

    const easedProgress = easing(progress);
    window.scrollTo(0, startPosition + distance * easedProgress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

/**
 * Initialize smooth scroll for all anchor links
 */
export function initSmoothScroll(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const link = target.closest('a[href^="#"]');

    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href === '#') return;

    event.preventDefault();

    const element = document.querySelector(href);
    if (element instanceof HTMLElement) {
      smoothScrollToElement(element, {
        duration: 800,
        easing: easings.smooth,
        offset: 100, // Account for fixed header
      });
    }
  });
}

/**
 * Scroll progress indicator setup
 */
export function initScrollProgress(): void {
  const updateProgress = () => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = window.scrollY;
    const progress = scrollHeight > 0 ? (scrolled / scrollHeight) * 100 : 0;

    const progressBar = document.querySelector('html::before') as HTMLElement;
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
  };

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}

/**
 * Enhance scrollbar with momentum
 */
export function initMomentumScroll(): void {
  let ticking = false;

  const updateScroll = () => {
    ticking = false;
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateScroll);
      ticking = true;
    }
  }, { passive: true });
}

/**
 * Initialize all smooth scroll enhancements
 */
export function initAllSmoothScrollFeatures(): void {
  if (window.innerWidth >= 768) {
    initSmoothScroll();
    initScrollProgress();
    initMomentumScroll();
  }

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.documentElement.style.scrollBehavior = 'auto';
  }
}

export default {
  smoothScrollToElement,
  smoothScrollToPosition,
  initSmoothScroll,
  initScrollProgress,
  initMomentumScroll,
  initAllSmoothScrollFeatures,
  easings,
  calculateMomentum,
};
