/* ==========================================================================
   Presentation-only motion helpers.

   Nothing in this file reads or changes a score, a finding or any other
   computed value. It decides *how* the interface moves, never *what* it says.

   Two things live here:

   1. The adaptive quality ladder. three.js is not a dependency of this
      project, so there is no WebGL to budget for; the ladder still governs the
      CSS-and-SVG orb, which is the delivered renderer. The rules are the ones
      the performance brief specifies: start at "lite" on a low-core or
      low-memory device, step down when the rolling two-second average frame
      time exceeds 24ms, never step back up within a session, and force "off"
      when the user has asked for reduced motion.

   2. Scroll reveals. Compositor-only (transform and opacity), capped at twelve
      staggered items per list, skipped entirely when motion is reduced. The
      initial hidden state is applied by this module rather than by markup, so
      with JavaScript off nothing is ever hidden.
   ========================================================================== */

export type QualityLevel = "full" | "lite" | "off";

/** Ordered so a step down is always a move to a lower level. */
const STEP_DOWN: Record<QualityLevel, QualityLevel> = { full: "lite", lite: "off", off: "off" };

const FRAME_BUDGET_MS = 24;
const SAMPLE_WINDOW_MS = 2000;

const QUALITY_ATTRIBUTE = "data-quality";

let current: QualityLevel = "off";
let initialised = false;
let frameHandle = 0;
let windowStart = 0;
let windowFrames = 0;

const qualityListeners = new Set<(level: QualityLevel) => void>();

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Current quality level. Defaults to "off" until `initQuality()` runs. */
export function getQuality(): QualityLevel {
  return current;
}

export function onQualityChange(listener: (level: QualityLevel) => void): () => void {
  qualityListeners.add(listener);
  return () => {
    qualityListeners.delete(listener);
  };
}

function apply(next: QualityLevel): void {
  if (next === current) return;
  current = next;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(QUALITY_ATTRIBUTE, next);
  }
  for (const listener of qualityListeners) listener(next);
}

/**
 * Step down one level. There is deliberately no public way to step up: a
 * device that missed the frame budget once will miss it again, and a UI that
 * oscillates between smooth and stuttering is worse than one that stays plain.
 */
export function stepDownQuality(): void {
  apply(STEP_DOWN[current]);
}

function startLevel(): QualityLevel {
  if (prefersReducedMotion()) return "off";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  return cores <= 4 || memory <= 4 ? "lite" : "full";
}

/**
 * Measures real frames and steps the ladder down if the two-second average
 * exceeds the frame budget. Stops its own loop once quality reaches "off", and
 * while the tab is hidden.
 */
function monitorFrames(): void {
  if (frameHandle !== 0) return;
  windowStart = 0;
  windowFrames = 0;

  const tick = (now: number): void => {
    if (document.hidden || current === "off") {
      frameHandle = 0;
      return;
    }
    if (windowStart === 0) windowStart = now;
    windowFrames += 1;
    const elapsed = now - windowStart;

    if (elapsed >= SAMPLE_WINDOW_MS) {
      const average = elapsed / windowFrames;
      windowStart = 0;
      windowFrames = 0;
      if (average > FRAME_BUDGET_MS) {
        stepDownQuality();
        if (getQuality() === "off") {
          frameHandle = 0;
          return;
        }
      }
    }

    frameHandle = window.requestAnimationFrame(tick);
  };

  frameHandle = window.requestAnimationFrame(tick);
}

/**
 * Reads the device tier, publishes it on `documentElement` so CSS can respond,
 * and starts the frame monitor. Idempotent, and a no-op outside a browser.
 *
 * Called from `initApp()`. Left uncalled — as it is under test — quality stays
 * at "off", so no orb animation and no animation frame loop ever starts.
 */
export function initQuality(): void {
  if (initialised) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  initialised = true;

  apply(startLevel());

  if (current === "off") return;
  if (typeof window.requestAnimationFrame !== "function") return;

  monitorFrames();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (frameHandle !== 0) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
      return;
    }
    if (current !== "off") monitorFrames();
  });

  if (typeof window.matchMedia === "function") {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", (event) => {
        if (event.matches) apply("off");
      });
    }
  }
}

/* ==========================================================================
   Pause on hidden tab, and on elements scrolled out of view.

   One `visibilitychange` listener and one IntersectionObserver per element,
   both in this module rather than per component, so a page full of orbs does
   not add a listener each.
   ========================================================================== */

const pauseTargets = new Set<HTMLElement>();
let visibilityBound = false;

function syncPause(): void {
  const hidden = typeof document !== "undefined" && document.hidden;
  for (const target of pauseTargets) {
    if (!target.isConnected) {
      pauseTargets.delete(target);
      continue;
    }
    target.classList.toggle("is-paused", hidden || target.dataset.offscreen === "true");
  }
}

/**
 * Pauses every CSS animation inside `element` while it is off-screen or while
 * the tab is hidden. CSS animations keep running (and keep the compositor
 * busy) when nobody can see them, which is exactly the waste the brief rules
 * out.
 */
export function bindAnimationPause(element: HTMLElement): void {
  if (typeof document === "undefined") return;
  pauseTargets.add(element);

  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener("visibilitychange", syncPause);
  }

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          target.dataset.offscreen = entry.isIntersecting ? "false" : "true";
          target.classList.toggle(
            "is-paused",
            document.hidden || !entry.isIntersecting,
          );
        }
      },
      { threshold: 0 },
    );
    observer.observe(element);
  }

  syncPause();
}

/* ==========================================================================
   Scroll reveals.
   ========================================================================== */

export interface RevealOptions {
  /** Delay added per item, in milliseconds. */
  staggerMs?: number;
  /** How many items may carry a stagger before the rest share the last delay. */
  maxStaggered?: number;
}

/**
 * Reveals `elements` with a transform-and-opacity fade as they scroll in.
 *
 * Staggering stops at `maxStaggered` (twelve by default) so the total delay
 * stays well under 600ms no matter how long the list is, and each element is
 * unobserved as soon as it has appeared.
 */
export function revealOnScroll(
  elements: readonly HTMLElement[],
  options: RevealOptions = {},
): void {
  if (elements.length === 0) return;
  // Nothing hidden, nothing animated, nothing to do. The content is already on
  // screen and simply stays there.
  if (prefersReducedMotion()) return;

  const stagger = options.staggerMs ?? 60;
  const maxStaggered = options.maxStaggered ?? 12;

  if (typeof IntersectionObserver !== "function") {
    for (const element of elements) {
      element.classList.add("is-revealed");
      element.classList.add("aos-animate");
    }
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        entry.target.classList.add("aos-animate");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
  );

  elements.forEach((element, index) => {
    const delay = Math.min(index, maxStaggered) * stagger;
    element.style.setProperty("--reveal-delay", `${delay}ms`);
    element.classList.add("u-reveal");
    observer.observe(element);
  });
}

/**
 * Initializes AOS (Animate On Scroll) for all elements with [data-aos] attributes.
 * Automatically adds .aos-animate as elements scroll into the viewport.
 */
export function initAOS(root: Document | HTMLElement = document): void {
  if (typeof document === "undefined") return;
  if (prefersReducedMotion()) {
    const items = root.querySelectorAll<HTMLElement>("[data-aos]");
    items.forEach((el) => el.classList.add("aos-animate"));
    return;
  }

  const aosElements = Array.from(root.querySelectorAll<HTMLElement>("[data-aos]"));
  if (aosElements.length === 0) return;

  if (typeof IntersectionObserver !== "function") {
    aosElements.forEach((el) => el.classList.add("aos-animate"));
    return;
  }

  const aosObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("aos-animate");
          aosObserver.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
  );

  aosElements.forEach((el) => aosObserver.observe(el));
}

