import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/reset.css";
import "./styles/base.css";
import "./styles/homepage.css";
import "./styles/loading.css";
import "./styles/motion.css";
import "./styles/typography-responsive.css";
import "./styles/typography-extensions.css";
import "./styles/mobile-responsive.css";
import "./styles/result-responsive.css";
import "./styles/comprehensive-responsive.css";
import "./styles/hero-video.css";
import "./styles/hero-video-prompt.css";

import { parseHandoff } from "./utils/handoff";
import { initQuality, revealOnScroll, initAOS } from "./utils/motion";
import { preloadNonCriticalBundles } from "./utils/lazyLoading";
import { CRITERIA, PILLAR_ORDER } from "./criteria/definitions";
import { PATTERN_GROUPS } from "./rules/patterns";
import { ALL_URL_RULES } from "./rules/urlRules";
import { createIcon } from "./components/Icon/Icon";
import { createCheckerForm } from "./components/CheckerForm/CheckerForm";
import { createResultPanel } from "./components/ResultPanel/ResultPanel";
import { inspectUrl } from "./services/api";
import { analyzeJob } from "./engine/engine";
import { JobInput } from "./types/types";
import { createHeroVideo } from "./components/HeroVideo/HeroVideo";
import { createLoadingView, LoadingController } from "./components/Loading/Loading";

// Disable browser scroll restoration and force scroll to top
if (window.history && window.history.scrollRestoration) {
  window.history.scrollRestoration = "manual";
}

// Reset scroll to top immediately on page load
window.scrollTo(0, 0);

// Also set scroll to top on load event
window.addEventListener("load", () => {
  window.scrollTo(0, 0);
}, { once: true });

const THEME_STORAGE_KEY = "jobcheck:theme";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function storedTheme(): "light" | "dark" | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    // Private browsing and blocked third-party storage both throw on read.
    // The toggle still works for the session; it just does not remember.
    return null;
  }
}

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Applies the saved theme to the document root.
 *
 * Called as the first thing `initApp` does, before any markup exists: the
 * whole interface is built by this module, so there is no painted frame to
 * flash. A `data-theme` attribute set from an inline <script> would be the
 * usual no-flash trick, and the `script-src 'self'` policy forbids it.
 */
function applyStoredTheme(): void {
  const saved = storedTheme();
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  }
}

function persistTheme(theme: "light" | "dark"): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Not fatal: the theme applies, it just will not survive a reload. */
  }
}

/* ===================================================================
   Theme toggle
   =================================================================== */
/**
 * The colour-theme switch.
 *
 * A single button carrying `aria-pressed`, with a name that does not change
 * ("Dark theme"). A screen reader then announces "Dark theme, toggle button,
 * pressed" — the state is reported rather than left to be inferred from a
 * glyph. It previously used a `refresh` icon and said only "Toggle color
 * theme", with nothing indicating which theme was active.
 *
 * The glyph shows the theme that pressing the button will switch *to*.
 */
function createThemeToggle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "c-header__icon-btn c-header__icon-btn--theme";

  const paint = (): void => {
    const theme = currentTheme();
    const next = theme === "dark" ? "light" : "dark";
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    button.setAttribute("aria-label", "Dark theme");
    button.title = `Switch to ${next} theme`;
    button.replaceChildren(
      createIcon({ name: theme === "dark" ? "sun" : "moon", size: "sm" })
    );
  };

  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    persistTheme(next);
    paint();
  });

  // With no explicit choice stored, the operating system owns the theme and
  // can change it while the page is open (scheduled dark mode, a system
  // setting toggle). Keep the button's reported state honest when it does.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (!storedTheme()) paint();
    });

  paint();
  return button;
}

/* ===================================================================
   Settings Drawer — About, Terms, Privacy, FAQ
   =================================================================== */
function createSettingsDrawer(): {
  overlay: HTMLElement;
  open: () => void;
  close: () => void;
} {
  const overlay = document.createElement("div");
  overlay.className = "c-settings-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Settings & Governance");

  const drawer = document.createElement("div");
  drawer.className = "c-settings-drawer";

  // Header
  const header = document.createElement("div");
  header.className = "c-settings-drawer__header";

  const title = document.createElement("h2");
  title.className = "c-settings-drawer__title";
  title.appendChild(createIcon({ name: "settings", size: "md" }));
  const titleText = document.createElement("span");
  titleText.textContent = "Settings & Governance";
  title.appendChild(titleText);
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "c-settings-drawer__close";
  closeBtn.setAttribute("aria-label", "Close settings");
  closeBtn.appendChild(createIcon({ name: "x", size: "sm" }));
  header.appendChild(closeBtn);

  drawer.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "c-settings-drawer__body";

  // About Section
  body.appendChild(
    createSettingsSection(
      "About JobCheck",
      "info",
      `<p><strong>JobCheck</strong> is a free, instant anti-scam tool built to help job seekers, freshers, and professionals spot fake recruiters and fraudulent job postings.</p>
       <p>We combine automated URL and description analysis with Google-grounded AI search: domain age, HTTPS, lookalike domains, fee demands, messaging-app traps, and whatever the public web says about the company.</p>
       <p><strong>Core Engine:</strong> 20 domain and URL rules · 27 scam-pattern groups · a 100-criteria integrity checklist run on every scan · 100-post labelled test corpus with a zero-false-negative rule. We surface risk signals — we cannot prove a company is genuine.</p>`,
    ),
  );

  // Terms & Conditions Section
  body.appendChild(
    createSettingsSection(
      "Terms & Conditions",
      "book-open",
      `<p>By using JobCheck, you agree to the following:</p>
       <p>• <strong>Guidance Only:</strong> JobCheck calculates risk scores based on automated safety signals. It provides safety guidance and does not replace your own due diligence. Always confirm open positions directly on official company career portals.</p>
       <p>• <strong>Strict Privacy:</strong> Your submitted job links and text are processed in temporary memory and are never stored or sold.</p>
       <p>• <strong>Immediate Reporting (India):</strong> If you have already transferred money to a scammer, report immediately to the National Cybercrime Portal at <strong>cybercrime.gov.in</strong> or call the <strong>1930</strong> helpline.</p>
       <p>• <strong>Immediate Reporting (Worldwide):</strong> International users can report job scams to the <strong><a href="https://www.fbi.gov/investigate/cyber" target="_blank" rel="noopener noreferrer">FBI's Internet Crime Complaint Center (IC3)</a></strong> or local law enforcement in your country.</p>`,
    ),
  );

  // Privacy Policy Section
  body.appendChild(
    createSettingsSection(
      "Privacy Policy",
      "shield-check",
      `<p><strong>Zero Personal Data Retention:</strong></p>
       <p>• Job descriptions and URLs submitted for inspection are never stored in any database.</p>
       <p>• No user tracking cookies or profiling scripts are loaded on this website.</p>
       <p>• Every check runs through secure, encrypted stateless pipelines.</p>`,
    ),
  );

  drawer.appendChild(body);
  overlay.appendChild(drawer);

  // Close handlers
  const close = () => {
    overlay.classList.remove("c-settings-overlay--open");
    document.body.style.overflow = "";
  };
  const open = () => {
    overlay.classList.add("c-settings-overlay--open");
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  });

  return { overlay, open, close };
}

function createSettingsSection(
  titleStr: string,
  iconName: "info" | "book-open" | "shield-check",
  htmlContent: string,
): HTMLElement {
  const section = document.createElement("div");
  section.className = "c-settings-section";

  const title = document.createElement("h3");
  title.className = "c-settings-section__title";
  title.appendChild(createIcon({ name: iconName, size: "sm" }));
  const text = document.createElement("span");
  text.textContent = titleStr;
  title.appendChild(text);

  const content = document.createElement("div");
  content.className = "c-settings-section__content";
  content.innerHTML = htmlContent;

  section.appendChild(title);
  section.appendChild(content);
  return section;
}

/* ===================================================================
   Supported Global Platforms Marquee Component
   =================================================================== */
interface SupportedPlatform {
  name: string;
  type: string;
  color: string;
  svg: string;
}

const SUPPORTED_PLATFORMS: SupportedPlatform[] = [
  {
    name: "LinkedIn",
    type: "Network",
    color: "#0a66c2",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.64 1.64 0 1 0 0-3.28 1.64 1.64 0 0 0 0 3.28m1.4 9.74v-8.37H5.06v8.37h2.8z"/></svg>`
  },
  {
    name: "Naukri",
    type: "Job Board",
    color: "#2563eb",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-4c0-.55-.45-1-1-1s-1 .45-1 1v4H9v-6h2v1.1c.54-.69 1.45-1.1 2.25-1.1 1.52 0 2.75 1.23 2.75 2.75V17z"/></svg>`
  },
  {
    name: "Indeed",
    type: "Job Board",
    color: "#2164f3",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.56 0c2.42 0 4.6 1.31 5.72 3.44.82 1.56.98 3.38.45 5.09l-.16.5-3.32-1.07.16-.52a3.84 3.84 0 0 0-.29-3.27 3.85 3.85 0 0 0-3.88-1.81 3.85 3.85 0 0 0-3.41 2.6c-.33 1.07-.17 2.22.44 3.16l2.13 3.32H6.42l-1.92-3A6.86 6.86 0 0 1 4.7 3.86C5.9 1.45 8.57 0 11.56 0zm-2.09 13.91h5.83v10.09H9.47V13.91z"/></svg>`
  },
  {
    name: "Glassdoor",
    type: "Reviews & Jobs",
    color: "#0caa41",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.8 3.5H5.2c-.9 0-1.7.8-1.7 1.7v13.6c0 .9.8 1.7 1.7 1.7h13.6c.9 0 1.7-.8 1.7-1.7V5.2c0-.9-.8-1.7-1.7-1.7zm-2.5 13.5H7.7v-2h8.6v2zm0-4H7.7V11h8.6v2zm0-4H7.7V7h8.6v2z"/></svg>`
  },
  {
    name: "Internshala",
    type: "Fresher & Intern",
    color: "#00a5ec",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm0 8.7L4.74 8.7 12 4.75l7.26 3.96L12 11.7zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>`
  },
  {
    name: "Wellfound",
    type: "Startups",
    color: "#ff4d4d",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zm0 8.5L5.4 7 12 3.7 18.6 7 12 10.5zM3 10.5v6.2L12 22l9-5.3v-6.2l-9 5-9-5z"/></svg>`
  },
  {
    name: "Greenhouse",
    type: "Enterprise ATS",
    color: "#00b259",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A6 6 0 0 1 8 12a1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 0 1 2 0 6 6 0 0 1-7 4.93zM12 6a4 4 0 0 1 4 4 1 1 0 0 1-2 0 2 2 0 0 0-4 0 1 1 0 0 1-2 0 4 4 0 0 1 4-4z"/></svg>`
  },
  {
    name: "Lever",
    type: "Enterprise ATS",
    color: "#2563eb",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h4v16H4V4zm6 6h4v10h-4V10zm6 4h4v6h-4v-6z"/></svg>`
  },
  {
    name: "Workday",
    type: "Global ATS",
    color: "#ff8c00",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8l7 3.5v7.4l-7 3.5-7-3.5V8.3l7-3.5z"/></svg>`
  },
  {
    name: "Google for Jobs",
    type: "Search Index",
    color: "#ea4335",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V17a1 1 0 0 1-2 0v-.07A6 6 0 0 1 8 12a1 1 0 0 1 2 0 4 4 0 0 0 8 0 1 1 0 0 1 2 0 6 6 0 0 1-7 4.93z"/></svg>`
  },
  {
    name: "Foundit",
    type: "APAC Jobs",
    color: "#8b5cf6",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 15a5 5 0 1 1 5-5 5 5 0 0 1-5 5zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3z"/></svg>`
  },
  {
    name: "Unstop",
    type: "Campus & Tech",
    color: "#06b6d4",
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  }
];

function createSupportedPlatformsTicker(): HTMLElement {
  const container = document.createElement("div");
  container.className = "c-platforms-ticker";
  const label = document.createElement("div");
  label.className = "c-platforms-ticker__label";
  label.innerHTML = `
    <span class="c-platforms-ticker__label-dot"></span>
    <span>Works with jobs from top job portals & company career sites</span>
  `;
  container.appendChild(label);

  const trackWrapper = document.createElement("div");
  trackWrapper.className = "c-platforms-ticker__track-wrapper";

  const track = document.createElement("div");
  track.className = "c-platforms-ticker__track";

  // Duplicate list twice to ensure a seamless infinite seamless scroll loop
  const duplicatedPlatforms = [...SUPPORTED_PLATFORMS, ...SUPPORTED_PLATFORMS];

  for (const plat of duplicatedPlatforms) {
    const chip = document.createElement("div");
    chip.className = "c-platform-chip";

    const iconSpan = document.createElement("span");
    iconSpan.className = "c-platform-chip__icon";
    iconSpan.style.setProperty("color", plat.color);
    iconSpan.innerHTML = plat.svg;

    const nameSpan = document.createElement("span");
    nameSpan.className = "c-platform-chip__name";
    nameSpan.textContent = plat.name;

    const typeSpan = document.createElement("span");
    typeSpan.className = "c-platform-chip__type";
    typeSpan.textContent = plat.type;

    chip.appendChild(iconSpan);
    chip.appendChild(nameSpan);
    chip.appendChild(typeSpan);
    track.appendChild(chip);
  }

  trackWrapper.appendChild(track);
  container.appendChild(trackWrapper);
  return container;
}

/* ===================================================================
   Enterprise App Init
   =================================================================== */
function initApp(): void {
  const app = document.getElementById("app");
  if (!app) return;

  // Before anything is built: the saved theme has to be on the root element
  // before the first frame this module paints, or a returning visitor sees the
  // wrong theme flash. Nothing above this line paints.
  applyStoredTheme();

  // Reads the device tier and starts the frame monitor. Until this runs, the
  // quality level is "off", which is what the test suite sees.
  initQuality();

  app.innerHTML = "";

  // Skip link. First focusable element in the document, so one Tab press
  // reaches it and Enter drops the focus ring past the nav. The stylesheet
  // hides it off-screen with a transform, which means it is still focusable —
  // `display: none` would have taken it out of the tab order entirely.
  const skipLink = document.createElement("a");
  skipLink.className = "c-skip-link";
  skipLink.href = "#main-content";
  skipLink.textContent = "Skip to main content";
  app.appendChild(skipLink);

  // 1. Sticky Navigation Bar
  const nav = document.createElement("nav");
  nav.className = "c-nav";

  const navInner = document.createElement("div");
  navInner.className = "c-nav__inner";

  // Brand
  const brand = document.createElement("a");
  brand.href = "#";
  brand.className = "c-nav__brand";

  // Size, radius, clipping and glow all come from .c-header__logo-wrapper in
  // CSS now: a `style=""` attribute would be refused by `style-src 'self'`.
  const logoWrapper = document.createElement("div");
  logoWrapper.className = "c-header__logo-wrapper";
  const picElement = document.createElement("picture");
  const sourceWebp = document.createElement("source");
  sourceWebp.srcset = "/logo.webp";
  sourceWebp.type = "image/webp";
  picElement.appendChild(sourceWebp);
  const logoImg = document.createElement("img");
  logoImg.src = "/logo.png";
  logoImg.alt = "JobCheck Security Shield";
  picElement.appendChild(logoImg);
  logoWrapper.appendChild(picElement);
  brand.appendChild(logoWrapper);

  const brandTitle = document.createElement("span");
  brandTitle.className = "c-header__title";
  brandTitle.textContent = "JobCheck";
  brand.appendChild(brandTitle);

  navInner.appendChild(brand);

  // Nav Links
  const navLinks = document.createElement("div");
  navLinks.className = "c-nav__links";

  const linksData = [
    { text: "How It Works", href: "#how-it-works" },
    { text: "Score Guide", href: "#score-guide" },
    { text: "Common Scams", href: "#threat-intel" },
    // Counted from the criteria the engine actually runs, so the label cannot
    // outlive the checklist it names.
    { text: `${CRITERIA.length}-Point Check`, href: "#inspection-engine" },
    { text: "FAQ", href: "#faq" },
  ];

  for (const item of linksData) {
    const a = document.createElement("a");
    a.className = "c-nav__link";
    a.href = item.href;
    a.textContent = item.text;
    navLinks.appendChild(a);
  }
  navInner.appendChild(navLinks);

  // Controls (Helpline + FBI + Theme + Settings)
  const navControls = document.createElement("div");
  navControls.className = "c-nav__controls";

  const helplineLink = document.createElement("a");
  helplineLink.className = "c-nav__helpline";
  helplineLink.href = "https://cybercrime.gov.in";
  helplineLink.target = "_blank";
  helplineLink.rel = "noopener noreferrer";
  helplineLink.title = "Report job scams to Indian Cybercrime Portal";
  helplineLink.textContent = "🚨 Helpline: 1930";
  navControls.appendChild(helplineLink);

  navControls.appendChild(createThemeToggle());

  const settings = createSettingsDrawer();
  const settingsBtn = document.createElement("button");
  settingsBtn.className = "c-header__icon-btn";
  settingsBtn.setAttribute("aria-label", "Open settings");
  settingsBtn.appendChild(createIcon({ name: "settings", size: "sm" }));
  settingsBtn.addEventListener("click", () => settings.open());
  navControls.appendChild(settingsBtn);

  navInner.appendChild(navControls);
  nav.appendChild(navInner);
  app.appendChild(nav);

  // Append settings overlay to body
  document.body.appendChild(settings.overlay);

  // Main Container for content - will hold either video or hero section
  const mainContainer = document.createElement("main");
  mainContainer.id = "main-content";
  // Focusable so the skip link can actually move focus here rather than only
  // scrolling to it.
  mainContainer.tabIndex = -1;
  mainContainer.className = "l-container l-stack l-stack--gap-lg";

  // Hero Video Section - insert below nav, above main content (Mastercard style)
  const startVideoPlayback = () => {
    // Scroll to absolute top first (scroll bar at top)
    requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      // After scroll to top completes, then start video playback
      // Smooth scroll takes ~1000-1200ms, add buffer to ensure we're at the top
      setTimeout(() => {
        const videoElement = heroVideoElement.querySelector("video") as HTMLVideoElement | null;
        if (videoElement && videoElement.src) {
          // Try to play with current mute setting
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              // Autoplay with sound blocked by browser, mute and retry
              videoElement.muted = true;
              videoElement.play().catch(() => {
                // If still fails, keep muted
                videoElement.muted = true;
              });
            });
          }
        }
      }, 1300);
    });
  };

  const heroVideoElement = createHeroVideo({
    videoSrc: "/sonic/SonicLogo.mp4",
    onReadyToPlay: startVideoPlayback,
    onVideoComplete: () => {
      // Fade in the main content after video completes
      mainContainer.classList.add("l-container--fade-in");
    },
  });

  // Only append video if it has content (not already seen or expired)
  if (heroVideoElement.children.length > 0) {
    app.appendChild(heroVideoElement);
  }

  // 2. Enterprise Hero Section
  const hero = document.createElement("section");
  hero.className = "c-ent-hero";

  const statusPill = document.createElement("div");
  statusPill.className = "c-ent-hero__status-pill";
  statusPill.setAttribute("data-aos", "fade-down");
  const pulseDot = document.createElement("span");
  pulseDot.className = "c-ent-hero__pulse-dot";
  statusPill.appendChild(pulseDot);
  const statusText = document.createElement("span");
  statusText.textContent = "Live Scam Detection — Over 100 Safety Checks in Seconds";
  statusPill.appendChild(statusText);
  hero.appendChild(statusPill);

  const heroHeading = document.createElement("h1");
  heroHeading.className = "c-ent-hero__title";
  heroHeading.setAttribute("data-aos", "fade-up");
  heroHeading.innerHTML =
    'Is That Job Offer Real or a Scam? <span class="c-ent-hero__gradient-text">Check Before You Apply</span>';
  hero.appendChild(heroHeading);

  const heroSub = document.createElement("p");
  heroSub.className = "c-ent-hero__subtitle";
  heroSub.setAttribute("data-aos", "fade-up");
  heroSub.setAttribute("data-aos-delay", "100");
  heroSub.textContent =
    "Paste any job link or offer message to instantly spot fake recruiters, registration fee demands, suspicious WhatsApp contacts, and copycat company websites. 100% free, private, and instant.";
  hero.appendChild(heroSub);

  mainContainer.appendChild(hero);

  // 3. Inspection Terminal (CheckerForm)
  const resultRegion = document.createElement("section");
  resultRegion.id = "result-region";
  resultRegion.className = "l-stack l-stack--gap-md";
  resultRegion.setAttribute("aria-live", "polite");

  const checkerForm = createCheckerForm({
    onSubmit: async (data: { url: string; description: string }) => {
      checkerForm.setLoading(true);
      renderLoadingState(resultRegion);

      // Smooth scroll to results
      resultRegion.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

      const startTime = Date.now();

      let fetchedData = undefined;
      let couldNotReadNotice: string | null = null;
      let actualSearchTime = 0; // Track actual API response time

      try {
        const inspectRes = await inspectUrl(data.url, data.description);
        actualSearchTime = Date.now() - startTime; // Capture actual API time

        if (inspectRes.fetched && inspectRes.data) {
          fetchedData = inspectRes.data;
          const wordCount = inspectRes.data.text
            ? inspectRes.data.text.trim().split(/\s+/).filter(Boolean).length
            : 0;
          const src = inspectRes.data.fetchSource;

          if (src === "jina") {
            couldNotReadNotice = `✅ Page content retrieved via reader proxy (${wordCount.toLocaleString()} words scanned). Deep analysis completed for fee demands, contact methods, and fraud patterns.`;
          } else if (src === "google-cache") {
            couldNotReadNotice = `✅ Page content retrieved from web cache (${wordCount.toLocaleString()} words scanned). Deep analysis completed for fee demands, contact methods, and fraud patterns.`;
          } else if (src === "search-index") {
            couldNotReadNotice = `✅ Site index & careers profile retrieved via search engine (${wordCount.toLocaleString()} words analyzed). Deep analysis completed for fraud patterns.`;
          } else if (src === "duckduckgo") {
            couldNotReadNotice = `✅ Organization summary retrieved from search directory. Analyzed domain reputation and official profile.`;
          } else {
            couldNotReadNotice = `✅ Live page content successfully extracted (${wordCount.toLocaleString()} words scanned). Deep analysis completed for fee demands, contact methods, and fraud patterns.`;
          }
        } else {
          if (inspectRes.data) {
            fetchedData = inspectRes.data;
          }
          if (inspectRes.isTrustedPlatform) {
            couldNotReadNotice =
              "Major job portals (LinkedIn, Naukri, Glassdoor, etc.) require user login. Analysis is based on your submitted job description and any embedded links.";
          } else {
            couldNotReadNotice =
              "Could not read remote page content directly. Analysis is based on URL structure, domain records, and your submitted job description.";
          }
        }

        const jobInput: JobInput = {
          url: data.url,
          description: data.description,
          fetched: fetchedData,
          extractedLinks: inspectRes.extractedLinks,
          aiIntel: inspectRes.aiIntel,
          isTrustedPlatform: inspectRes.isTrustedPlatform,
        };

        const assessment = analyzeJob(jobInput);

        // If result arrives on an intermediate step, fast-forward remaining steps quickly and cleanly
        await completeLoadingState(resultRegion);

        // Use actual search time (API response time)
        const searchTimeSeconds = Math.ceil(actualSearchTime / 1000);

        cleanupLoadingState(resultRegion);
        resultRegion.innerHTML = "";

        const resultPanel = createResultPanel({
          assessment,
          jobUrl: data.url,
          jobDescription: data.description,
          fetchNotice: couldNotReadNotice,
          searchTimeSeconds,
          onReset: () => {
            cleanupLoadingState(resultRegion);
            resultRegion.innerHTML = "";
            checkerForm.resetForm();
            window.scrollTo({
              top: 0,
              behavior: prefersReducedMotion() ? "auto" : "smooth",
            });
          },
        });

        resultRegion.appendChild(resultPanel);
      } catch (err: unknown) {
        renderErrorState(
          resultRegion,
          err instanceof Error ? err.message : "Failed to analyze job link.",
        );
      } finally {
        checkerForm.setLoading(false);
      }
    },
  });

  mainContainer.appendChild(checkerForm);

  // 3b. Supported Global Platforms Marquee Ticker
  const platformsTicker = createSupportedPlatformsTicker();
  mainContainer.appendChild(platformsTicker);

  // 4. Enterprise Live Stats Grid
  const statsGrid = document.createElement("div");
  statsGrid.className = "c-stats-grid";

  // Every figure here must be verifiable from this repository. The previous
  // version advertised invented usage numbers ("₹4,200+ Cr saved", "1.8M+
  // protected", "99.9% accuracy") with no measurement behind them.
  //
  // The three counts are read from the arrays the scanner actually iterates,
  // so a rule added tomorrow changes the number on this card instead of
  // leaving it stale. Only the fourth is a literal, and it is a statement
  // about the architecture rather than a measurement.
  const statsData = [
    {
      num: String(PATTERN_GROUPS.length),
      label: "Scam Pattern Groups",
      sub: "Fee demands, task scams, crypto payments, fake govt jobs and more",
    },
    {
      num: String(ALL_URL_RULES.length),
      label: "Domain & URL Rules",
      sub: "Lookalike domains, disposable TLDs, domain age, redirect chains",
    },
    {
      num: String(CRITERIA.length),
      label: "Integrity Criteria Checked",
      sub: `Every scan runs the same ${CRITERIA.length}-criteria checklist and shows which checks could not be completed`,
    },
    {
      num: "0",
      label: "Accounts or Data Stored",
      sub: "No sign-up, no database, nothing kept after your scan finishes",
    },
  ];

  for (const st of statsData) {
    const card = document.createElement("div");
    card.className = "c-stat-card";
    const num = document.createElement("span");
    num.className = "c-stat-card__number";
    num.textContent = st.num;
    const lbl = document.createElement("span");
    lbl.className = "c-stat-card__label";
    lbl.textContent = st.label;
    const sub = document.createElement("span");
    sub.className = "c-stat-card__subtext";
    sub.textContent = st.sub;
    card.appendChild(num);
    card.appendChild(lbl);
    card.appendChild(sub);
    statsGrid.appendChild(card);
  }
  mainContainer.appendChild(statsGrid);

  // Results Region inserted here
  mainContainer.appendChild(resultRegion);

  // 5. How It Works Section
  const howSection = document.createElement("section");
  howSection.id = "how-it-works";
  howSection.className = "c-ent-section";

  const howHeader = document.createElement("div");
  howHeader.className = "c-ent-section__header";
  howHeader.setAttribute("data-aos", "fade-up");
  howHeader.innerHTML = `
    <span class="c-ent-section__tag">Simple & Fast</span>
    <h2 class="c-ent-section__title">How JobCheck Protects You in 4 Steps</h2>
    <p class="c-ent-section__desc">Paste a job link or description. Our verification engine scans it across multiple safety layers in just a few seconds.</p>
  `;
  howSection.appendChild(howHeader);

  const pipelineGrid = document.createElement("div");
  pipelineGrid.className = "c-pipeline-grid";

  const pipelineSteps = [
    {
      step: "STEP 01",
      icon: "globe",
      title: "Website & Domain Verification",
      desc: "We check domain registration age, SSL certificates, and catch lookalike fake websites (like 'tcs-careers.xyz' instead of 'tcs.com')."
    },
    {
      step: "STEP 02",
      icon: "file-text",
      title: "Job Description & Red Flag Scan",
      desc: "Our engine scans for hidden traps: demands for registration fees, laptop security deposits, WhatsApp redirects, and 'daily task' schemes."
    },
    {
      step: "STEP 03",
      icon: "search",
      title: "Live Web & Company Footprint Search",
      desc: "We search the public web for the company — its online footprint, employee reviews, and any reported scam activity — and show what was found. Anything the search could not confirm is labelled as not checked, never counted as a pass."
    },
    {
      step: "STEP 04",
      icon: "shield-check",
      title: "Instant Safety Score & Action Plan",
      desc: "You get a clear safety score from 0 to 100, highlighted red flags with evidence quotes, and clear instructions on what to do next."
    }
  ];

  for (const p of pipelineSteps) {
    const card = document.createElement("div");
    card.className = "c-pipeline-card";
    const stTag = document.createElement("span");
    stTag.className = "c-pipeline-card__step";
    stTag.textContent = p.step;
    const ic = document.createElement("div");
    ic.className = "c-pipeline-card__icon";
    ic.appendChild(createIcon({ name: p.icon as any, size: "md" }));
    const t = document.createElement("h3");
    t.className = "c-pipeline-card__title";
    t.textContent = p.title;
    const d = document.createElement("p");
    d.className = "c-pipeline-card__desc";
    d.textContent = p.desc;
    card.appendChild(stTag);
    card.appendChild(ic);
    card.appendChild(t);
    card.appendChild(d);
    pipelineGrid.appendChild(card);
  }
  howSection.appendChild(pipelineGrid);
  mainContainer.appendChild(howSection);

  // 5A. Google AI Search Intelligence Section
  const aiSection = document.createElement("section");
  aiSection.id = "ai-intelligence";
  aiSection.className = "c-ent-section";

  const aiHeader = document.createElement("div");
  aiHeader.className = "c-ent-section__header";
  aiHeader.setAttribute("data-aos", "fade-up");
  aiHeader.innerHTML = `
    <span class="c-ent-section__tag">Advanced Intelligence</span>
    <h2 class="c-ent-section__title">Powered by Google AI Search</h2>
    <p class="c-ent-section__desc">We leverage Google's advanced search intelligence to verify company legitimacy and uncover hidden risks. Our AI investigates public records, scam reports, and registration status in real-time.</p>
  `;
  aiSection.appendChild(aiHeader);

  const aiGrid = document.createElement("div");
  aiGrid.className = "c-ai-grid";

  const aiFeatures = [
    {
      icon: "🔍",
      title: "Company Background Check",
      desc: "Verify the company's official registration, business history, and legitimacy through public databases and official records."
    },
    {
      icon: "⚠️",
      title: "Scam Report Detection",
      desc: "Search for any public complaints, fraud reports, or warnings about the company across multiple trusted sources."
    },
    {
      icon: "✓",
      title: "Registration Verification",
      desc: "Confirm if the company is properly registered with government authorities and maintains active business status."
    },
    {
      icon: "🌐",
      title: "Web Footprint Analysis",
      desc: "Analyze the company's online presence, website credibility, social media activity, and digital reputation."
    }
  ];

  for (const feature of aiFeatures) {
    const card = document.createElement("div");
    card.className = "c-ai-card";

    const iconEl = document.createElement("div");
    iconEl.className = "c-ai-card__icon";
    iconEl.textContent = feature.icon;

    const titleEl = document.createElement("h3");
    titleEl.className = "c-ai-card__title";
    titleEl.textContent = feature.title;

    const descEl = document.createElement("p");
    descEl.className = "c-ai-card__desc";
    descEl.textContent = feature.desc;

    card.appendChild(iconEl);
    card.appendChild(titleEl);
    card.appendChild(descEl);
    aiGrid.appendChild(card);
  }

  aiSection.appendChild(aiGrid);

  // Add Powered By Google footer below the grid
  const poweredByFooter = document.createElement("div");
  poweredByFooter.className = "c-ai-powered-by";

  const poweredByText = document.createElement("span");
  poweredByText.className = "c-ai-powered-by__text";
  poweredByText.textContent = "Powered By ";
  poweredByFooter.appendChild(poweredByText);

  const googleText = document.createElement("span");
  googleText.className = "c-ai-powered-by__google";
  googleText.textContent = "Google";
  poweredByFooter.appendChild(googleText);

  aiSection.appendChild(poweredByFooter);

  mainContainer.appendChild(aiSection);

  // 6. Reading the score.
  //
  // The band ranges mirror src/engine/scoring.ts (>= 55 High, >= 25 Medium,
  // else Low — the thresholds are inline literals there and cannot be imported)
  // and the outcome lines mirror the headlines in
  // components/ResultPanel/finalVerdict.ts, so this section cannot promise a
  // result the result panel would not actually show. If either source moves,
  // this table has to move with it.
  const scoreSection = document.createElement("section");
  scoreSection.id = "score-guide";
  scoreSection.className = "c-ent-section";

  const scoreHeader = document.createElement("div");
  scoreHeader.className = "c-ent-section__header";
  scoreHeader.setAttribute("data-aos", "fade-up");
  scoreHeader.innerHTML = `
    <span class="c-ent-section__tag">Reading Your Score</span>
    <h2 class="c-ent-section__title">What Each Score Range Means</h2>
    <p class="c-ent-section__desc">Every scan returns a risk score from 0 to 100. Higher is worse: the number counts the scam signals that were found, not how good the job is. Each band ends in a different instruction.</p>
  `;
  scoreSection.appendChild(scoreHeader);

  const scoreGrid = document.createElement("div");
  scoreGrid.className = "c-score-grid";

  const scoreBands = [
    {
      level: "low",
      range: "0 – 24",
      label: "Low Risk",
      outcome: "Safe to apply — through the official portal",
      desc: "No scam signals were found, and the web investigation turned up no reports against this employer. Apply on the company's careers page and keep the usual habits.",
    },
    {
      level: "medium",
      range: "25 – 54",
      label: "Medium Risk",
      outcome: "Verify these things before you apply",
      desc: "Nothing here proves the posting is fake, but several signals did not check out. Confirm the employer directly before you share anything or commit your time.",
    },
    {
      level: "high",
      range: "55 – 100",
      label: "High Risk",
      outcome: "Do not apply — and do not pay anything",
      desc: "This posting carries the signals of a scam. Legitimate employers never ask a candidate for money, documents or an OTP. Stop replying and keep what you have as evidence.",
    },
  ] as const;

  for (const band of scoreBands) {
    const card = document.createElement("div");
    card.className = `c-score-card c-score-card--${band.level}`;

    const range = document.createElement("span");
    range.className = "c-score-card__range";
    range.textContent = band.range;

    const label = document.createElement("h3");
    label.className = "c-score-card__label";
    label.textContent = band.label;

    const outcome = document.createElement("p");
    outcome.className = "c-score-card__outcome";
    outcome.textContent = band.outcome;

    const desc = document.createElement("p");
    desc.className = "c-score-card__desc";
    desc.textContent = band.desc;

    card.append(range, label, outcome, desc);
    scoreGrid.appendChild(card);
  }
  scoreSection.appendChild(scoreGrid);

  mainContainer.appendChild(scoreSection);

  // 7. The Threat Landscape Section
  const threatSection = document.createElement("section");
  threatSection.id = "threat-intel";
  threatSection.className = "c-ent-section";

  const threatHeader = document.createElement("div");
  threatHeader.className = "c-ent-section__header";
  threatHeader.setAttribute("data-aos", "fade-up");
  threatHeader.innerHTML = `
    <span class="c-ent-section__tag c-ent-section__tag--risk">Common Scams</span>
    <h2 class="c-ent-section__title">What Fake Job Offers Are Actually After</h2>
    <p class="c-ent-section__desc">A fake recruiter wants one of two things: your money, or your documents. Both are hard to undo once handed over. These are the four patterns behind almost every fake posting JobCheck sees.</p>
  `;
  threatSection.appendChild(threatHeader);

  const threatGrid = document.createElement("div");
  threatGrid.className = "c-threat-grid";

  const threatsData = [
    {
      title: "They ask you to pay to get the job",
      badge: "Most Common",
      desc: "A 'refundable security deposit', a training or certification fee, a laptop or courier charge, an interview gate pass. The amount starts small and grows once you have paid something. No genuine employer in India charges a candidate to be hired — the demand itself is the scam, whatever the reason given.",
      loss: "At risk: money sent over UPI, which is almost never recoverable."
    },
    {
      title: "They collect documents to borrow in your name",
      badge: "Identity Theft",
      desc: "Before any offer, they want your Aadhaar, PAN, a bank statement, a cancelled cheque, a selfie, sometimes an OTP 'to verify'. Those are exactly the inputs needed to open a loan, a SIM or a payment account in your name — and the loan is then yours to repay, not theirs.",
      loss: "At risk: loans and accounts opened in your name without your knowledge."
    },
    {
      title: "They resell what they collect",
      badge: "Dark Web",
      desc: "Aadhaar, PAN, phone number and bank details together are a saleable package on underground markets, and they stay there for years. An OTP or CVV request is the second half of the same trick: it takes over an account you already have rather than opening a new one.",
      loss: "At risk: your data resold, and your bank or email account taken over."
    },
    {
      title: "There is no job at all",
      badge: "Task & Investment Traps",
      desc: "A fake offer letter, a 'work from home' role on WhatsApp or Telegram paying per task, or a direct appointment with no interview. Small payouts build trust, then you are asked to deposit more to 'unlock' your earnings, or to pay a joining advance that never comes back.",
      loss: "At risk: days of unpaid work, and deposits that vanish with the group."
    }
  ];

  for (const td of threatsData) {
    const card = document.createElement("div");
    card.className = "c-threat-card";
    const head = document.createElement("div");
    head.className = "c-threat-card__header";
    const tt = document.createElement("h3");
    tt.className = "c-threat-card__title";
    tt.textContent = td.title;
    const bd = document.createElement("span");
    bd.className = "c-threat-card__badge";
    bd.textContent = td.badge;
    head.appendChild(tt);
    head.appendChild(bd);

    const desc = document.createElement("p");
    desc.className = "c-threat-card__desc";
    desc.textContent = td.desc;

    const loss = document.createElement("div");
    loss.className = "c-threat-card__loss";
    loss.textContent = td.loss;

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(loss);
    threatGrid.appendChild(card);
  }
  threatSection.appendChild(threatGrid);
  mainContainer.appendChild(threatSection);

  // 8. The 100 employment-integrity criteria, grouped into their pillars
  const pillarsSection = document.createElement("section");
  pillarsSection.id = "inspection-engine";
  pillarsSection.className = "c-ent-section";

  const pillarsHeader = document.createElement("div");
  pillarsHeader.className = "c-ent-section__header";
  pillarsHeader.setAttribute("data-aos", "fade-up");
  // Both numbers are read from the criteria engine rather than typed here.
  // This heading used to say "6 Areas" against a checklist that has seven
  // pillars, and its boxes carried names that matched nothing in the code.
  pillarsHeader.innerHTML = `
    <span class="c-ent-section__tag">How The Score Is Built</span>
    <h2 class="c-ent-section__title">The ${PILLAR_ORDER.length} Areas of the ${CRITERIA.length}-Criteria Check</h2>
    <p class="c-ent-section__desc">Every scan runs the same ${CRITERIA.length} questions about the posting, grouped into these ${PILLAR_ORDER.length} areas. Each answer is then folded into one risk score. Where a question needs evidence the scan could not obtain, it is reported as not checked — it is never counted as a pass.</p>
  `;
  pillarsSection.appendChild(pillarsHeader);

  const pillarsGrid = document.createElement("div");
  pillarsGrid.className = "c-pillars-grid";

  // Derived from the criteria engine rather than written by hand: the pillar
  // names, the per-area count and the bullet list are all read from the same
  // definitions the scanner actually runs, so the marketing cannot drift away
  // from the implementation again.
  const PILLAR_ICONS: Record<string, string> = {
    "digital-footprint": "🌐",
    "payment-demands": "💸",
    "offer-realism": "📑",
    "legal-identity": "🏛️",
    "physical-presence": "📍",
    "contact-channels": "📞",
    "reputation": "🛡️",
  };

  const pillarsData = PILLAR_ORDER.map(({ pillar, label }) => {
    const checks = CRITERIA.filter((criterion) => criterion.pillar === pillar);
    return {
      icon: PILLAR_ICONS[pillar] ?? "•",
      title: label,
      desc: `${checks.length} of the ${CRITERIA.length} checks in every scan sit in this area.`,
      points: checks.slice(0, 4).map((criterion) => criterion.title),
    };
  });

  for (const pil of pillarsData) {
    const box = document.createElement("div");
    box.className = "c-pillar-box";
    const head = document.createElement("div");
    head.className = "c-pillar-box__head";
    const ic = document.createElement("span");
    ic.className = "c-pillar-box__icon";
    ic.textContent = pil.icon;
    const ti = document.createElement("h3");
    ti.className = "c-pillar-box__title";
    ti.textContent = pil.title;
    head.appendChild(ic);
    head.appendChild(ti);

    const de = document.createElement("p");
    de.className = "c-pillar-box__desc";
    de.textContent = pil.desc;

    const ul = document.createElement("ul");
    ul.className = "c-pillar-box__list";
    for (const pt of pil.points) {
      const li = document.createElement("li");
      li.textContent = pt;
      ul.appendChild(li);
    }

    box.appendChild(head);
    box.appendChild(de);
    box.appendChild(ul);
    pillarsGrid.appendChild(box);
  }
  pillarsSection.appendChild(pillarsGrid);
  mainContainer.appendChild(pillarsSection);

  // 9. FAQ Section
  const faqSection = document.createElement("section");
  faqSection.id = "faq";
  faqSection.className = "c-ent-section";

  const faqHeader = document.createElement("div");
  faqHeader.className = "c-ent-section__header";
  faqHeader.setAttribute("data-aos", "fade-up");
  faqHeader.innerHTML = `
    <span class="c-ent-section__tag">Got Questions?</span>
    <h2 class="c-ent-section__title">Frequently Asked Questions</h2>
    <p class="c-ent-section__desc">Clear answers about spotting fake jobs, how our checks work, and protecting your career.</p>
  `;
  faqSection.appendChild(faqHeader);

  const faqList = document.createElement("div");
  faqList.className = "c-ent-faq-list l-stack l-stack--gap-sm";

  const homeFaqs = [
    {
      q: "How does JobCheck detect job scams in seconds?",
      a: "JobCheck fetches the page, checks the domain's age and reputation, runs 20 domain rules and 27 scam-pattern groups over the text, and asks a Google-grounded AI model to search the public web for the company's footprint. It reports risk signals — it cannot prove that a company is genuine, so always confirm openings on the official careers page."
    },
    {
      q: "Can a fake job appear on trusted platforms like LinkedIn, Naukri, or Indeed?",
      a: "Yes. Scammers frequently create fake employer accounts or compromise recruiter credentials on LinkedIn, Naukri, and Indeed. They bypass job board filters by asking applicants to message them on WhatsApp, join Telegram channels, or fill out external forms."
    },
    {
      q: "What should I do if a company asks for an interview fee or laptop deposit?",
      a: "Never pay a single rupee. Legitimate companies never charge candidates for applications, gate passes, training, uniforms, or laptop delivery. If they ask for money, it is 100% a scam. Stop communicating immediately and report them on cybercrime.gov.in or call helpline 1930."
    },
    {
      q: "Is my resume or job description stored or shared?",
      a: "No, never. JobCheck respects your privacy completely. Your submitted URLs and text are analyzed live in temporary memory and permanently discarded as soon as the scan finishes. We do not store, profile, or sell your data."
    },
    {
      q: "What is the 100-Point Safety Framework?",
      a: "It is a fixed checklist of 100 employment-integrity criteria, grouped into 7 areas: digital footprint and domain, payment and document demands, offer realism, legal identity, physical presence, contact channels, and reputation. Each criterion is reported as passed, warned, failed, or 'not assessed' when the evidence needed to check it was not available. The 6-pillar employer audit you see in the report is a summary view of the same evidence."
    }
  ];

  for (const f of homeFaqs) {
    const item = document.createElement("div");
    item.className = "c-faq-item";

    const question = document.createElement("button");
    question.className = "c-faq-item__question";
    question.type = "button";
    const qText = document.createElement("span");
    qText.textContent = f.q;
    question.appendChild(qText);
    question.appendChild(createIcon({ name: "chevron-down", size: "sm" }));

    const answer = document.createElement("div");
    answer.className = "c-faq-item__answer";
    answer.textContent = f.a;

    question.addEventListener("click", () => {
      item.classList.toggle("c-faq-item--open");
    });

    item.appendChild(question);
    item.appendChild(answer);
    faqList.appendChild(item);
  }
  faqSection.appendChild(faqList);
  mainContainer.appendChild(faqSection);

  app.appendChild(mainContainer);

  // 10. Comprehensive Multi-Column Enterprise Footer
  const footer = document.createElement("footer");
  footer.className = "c-ent-footer";

  const footerGrid = document.createElement("div");
  footerGrid.className = "c-ent-footer__grid";

  // Brand Column
  const brandCol = document.createElement("div");
  brandCol.className = "c-ent-footer__brand-col";
  brandCol.innerHTML = `
    <div class="c-header__brand">
      <div class="c-header__logo-wrapper c-header__logo-wrapper--sm">
        <picture>
          <source srcset="/logo.webp" type="image/webp" />
          <img src="/logo.png" alt="JobCheck Shield" />
        </picture>
      </div>
      <span class="c-header__title">JobCheck</span>
    </div>
    <p class="c-ent-footer__mission">Protecting freshers, college graduates, and job seekers from recruitment fraud, fake offer letters, and registration fee scams across India and worldwide.</p>
    <ul class="c-ent-footer__facts">
      <li>No account and no sign-up</li>
      <li>Nothing you paste is stored</li>
      <li>No tracking or analytics scripts</li>
    </ul>
  `;
  footerGrid.appendChild(brandCol);

  // Affected-user column. This replaced a "Help & Privacy" column whose three
  // links — About, Terms, Privacy — all opened the same settings drawer at the
  // same scroll position, so every label promised a destination it did not
  // deliver. Those three now sit as a utility row in the bottom bar where they
  // belong, and the space carries the one thing a scam checker should lead with
  // when a reader arrives too late: what to do in the next ten minutes.
  const urgentCol = document.createElement("div");
  urgentCol.className = "c-ent-footer__col";
  urgentCol.innerHTML = `
    <h4 class="c-ent-footer__heading">If You've Already Paid</h4>
    <ol class="c-ent-footer__steps">
      <li class="c-ent-footer__step">
        <span><strong>India:</strong> Call <a class="c-ent-footer__step-link" href="tel:1930">1930</a> or report at
        <a class="c-ent-footer__step-link" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a></span>
      </li>
      <li class="c-ent-footer__step">
        <span><strong>Worldwide:</strong> Report to <a class="c-ent-footer__step-link" href="https://www.fbi.gov/investigate/cyber" target="_blank" rel="noopener noreferrer">FBI IC3</a> or local law enforcement</span>
      </li>
      <li class="c-ent-footer__step">
        <span>Tell your bank to freeze the transfer, and quote the UTR/reference from the payment.</span>
      </li>
      <li class="c-ent-footer__step">
        <span>Keep the evidence — chats, the job link, the account you paid into.</span>
      </li>
      <li class="c-ent-footer__step">
        <span>Report the posting to the job platform so it is taken down for the next applicant.</span>
      </li>
    </ol>
  `;
  footerGrid.appendChild(urgentCol);

  footer.appendChild(footerGrid);

  // Bottom Disclaimer Bar
  const bottomBar = document.createElement("div");
  bottomBar.className = "c-ent-footer__bottom";

  const copyright = document.createElement("span");
  copyright.textContent =
    "© 2026 JobCheck Anti-Fraud Initiative. Built to keep job seekers safe.";

  const disclaimer = document.createElement("span");
  disclaimer.className = "c-ent-footer__disclaimer";
  disclaimer.textContent =
    "Disclaimer: Automated safety assessment. Always confirm vacancies on official corporate careers portals.";

  // Utility row. These were `href="#"` anchors in the old privacy column: the
  // dead href jumped to the top of the page whenever the click handler was not
  // attached, and the labels did not match where they landed. They are buttons
  // because they open a drawer rather than navigate — a button is truthful
  // about that, needs no preventDefault, and works the same without JS.
  const legalRow = document.createElement("nav");
  legalRow.className = "c-ent-footer__legal";
  legalRow.setAttribute("aria-label", "Policies");
  for (const [id, label] of [
    ["footer-about-link", "About"],
    ["footer-terms-link", "Terms"],
    ["footer-privacy-link", "Privacy"],
  ] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.className = "c-ent-footer__legal-link";
    btn.textContent = label;
    legalRow.appendChild(btn);
  }

  bottomBar.append(copyright, legalRow, disclaimer);

  footer.appendChild(bottomBar);

  app.appendChild(footer);

  // The three policy buttons all open the settings drawer, which is where
  // About, Terms and Privacy actually live.
  for (const id of ["footer-about-link", "footer-terms-link", "footer-privacy-link"]) {
    document.getElementById(id)?.addEventListener("click", () => settings.open());
  }

  // Bookmarklet prefill handler
  const handoff = parseHandoff(window.location.hash);
  if (handoff.url || handoff.description) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (handoff.url) checkerForm.setUrl(handoff.url);
    if (handoff.description) checkerForm.setDescription(handoff.description);
  }

  // Scroll reveals, last: every element is in the document by now, so the
  // observer sees the true viewport positions on its first pass. Lists are
  // capped at twelve staggered items each, so the longest group here (the six
  // pillar boxes) finishes in well under 600ms.
  revealOnScroll(
    Array.from(document.querySelectorAll<HTMLElement>(".c-stat-card")),
    { staggerMs: 60 },
  );
  revealOnScroll(
    Array.from(document.querySelectorAll<HTMLElement>(".c-pipeline-card")),
    { staggerMs: 70 },
  );
  revealOnScroll(
    Array.from(document.querySelectorAll<HTMLElement>(".c-score-card")),
    { staggerMs: 60 },
  );
  revealOnScroll(
    Array.from(document.querySelectorAll<HTMLElement>(".c-threat-card")),
    { staggerMs: 70 },
  );
  revealOnScroll(
    Array.from(document.querySelectorAll<HTMLElement>(".c-pillar-box")),
    { staggerMs: 60 },
  );

  // Initialize AOS (Animate On Scroll) across document
  initAOS(document);

  // Register service worker for offline support and caching (Priority 3)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, but app still works
      // This is graceful degradation - performance optimization, not critical path
    });
  }

  // Preload non-critical bundles after page is interactive (Priority 4)
  preloadNonCriticalBundles();
}

interface LoadingTargetElement extends HTMLElement {
  __loadingController?: LoadingController;
  __loadingIntervals?: {
    timer: ReturnType<typeof setInterval>;
    steps: (ReturnType<typeof setTimeout> | number)[];
  };
}

/**
 * Renders modern circular loading state with elapsed time, progress steps, and real-time updates.
 */
function renderLoadingState(target: HTMLElement): void {
  cleanupLoadingState(target);
  target.innerHTML = "";

  const controller = createLoadingView();
  (target as LoadingTargetElement).__loadingController = controller;
  target.appendChild(controller.element);
}

/**
 * Fast-forwards the loading animation through remaining steps when scan finishes
 */
async function completeLoadingState(target: HTMLElement): Promise<void> {
  const el = target as LoadingTargetElement;
  if (el.__loadingController && typeof el.__loadingController.fastForwardToEnd === "function") {
    await el.__loadingController.fastForwardToEnd();
  }
}

/**
 * Cleanup loading state intervals and timers
 */
function cleanupLoadingState(target: HTMLElement): void {
  const el = target as LoadingTargetElement;
  if (el.__loadingController) {
    el.__loadingController.cleanup();
    delete el.__loadingController;
  }
  if (el.__loadingIntervals) {
    clearInterval(el.__loadingIntervals.timer);
    el.__loadingIntervals.steps.forEach((id) => clearTimeout(id as any));
    delete el.__loadingIntervals;
  }
}

/**
 * Renders error state
 */
function renderErrorState(target: HTMLElement, errorMessage: string): void {
  target.innerHTML = "";

  const card = document.createElement("div");
  card.className = "c-error";

  const titleRow = document.createElement("div");
  titleRow.className = "c-error__header";
  titleRow.appendChild(
    createIcon({
      name: "alert-circle",
      size: "md",
      colorClass: "c-icon--risk-high",
    }),
  );
  const title = document.createElement("h3");
  title.className = "c-error__title";
  title.textContent = "Inspection Error";
  titleRow.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "c-error__message";
  desc.textContent = errorMessage;

  card.appendChild(titleRow);
  card.appendChild(desc);
  target.appendChild(card);
}

document.addEventListener("DOMContentLoaded", () => {
  // Load site directly with hero video below navigation (Mastercard style)
  // First-time visitors see the video, subsequent visitors skip it
  initApp();
});
