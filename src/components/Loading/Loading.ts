import "../../styles/loading.css";

export interface LoadingStep {
  label: string;
  shortLabel: string;
}

export const LOADING_STEPS: readonly LoadingStep[] = [
  { label: "Reading the job posting", shortLabel: "Posting" },
  { label: "Checking link, domain age and HTTPS", shortLabel: "Domain" },
  { label: "Searching company registration records", shortLabel: "Registry" },
  { label: "Verifying office location and contact details", shortLabel: "Office" },
  { label: "Scanning employee reviews and scam reports", shortLabel: "Reviews" },
  { label: "Running 100-criteria integrity checklist", shortLabel: "Criteria" },
  { label: "Building your report", shortLabel: "Report" },
];

export interface LoadingController {
  element: HTMLElement;
  cleanup: () => void;
  advanceToStep?: (index: number) => void;
  fastForwardToEnd: () => Promise<void>;
}

export interface LoadingOptions {
  startTime?: number;
  onStepChange?: (stepIndex: number) => void;
}

/**
 * Creates the high-performance circular loading UI for JobCheck scam scans.
 * Displays an SVG gradient arc, counter-rotating inner dashed ring, orbiting dots,
 * live tabular elapsed timer, animated step transitions, and compact progress strip.
 */
export function createLoadingView(options?: LoadingOptions): LoadingController {
  const container = document.createElement("div");
  container.className = "c-loading";
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-label", "Running scam check");

  // 1. Centerpiece Circular Loader Container
  const circleContainer = document.createElement("div");
  circleContainer.className = "c-loading__circle-container";

  // Background radial pulsing glow
  const glow = document.createElement("div");
  glow.className = "c-loading__glow";
  glow.setAttribute("aria-hidden", "true");
  circleContainer.appendChild(glow);

  // Inline SVG (viewBox 0 0 200 200 - scalable, zero external dependencies)
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "c-loading__svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  svg.innerHTML = `
    <defs>
      <linearGradient id="jcLoaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2563eb" />
        <stop offset="50%" stop-color="#8b5cf6" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
      <filter id="jcLoaderDotGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <!-- Outer Track Ring -->
    <circle class="c-loading__track" cx="100" cy="100" r="82" stroke-width="3" />
    <!-- Rotating Arc with Gradient Stroke -->
    <circle class="c-loading__arc" cx="100" cy="100" r="82" stroke="url(#jcLoaderGrad)" stroke-width="5" stroke-linecap="round" />
    <!-- Inner Counter-Rotating Dashed Ring -->
    <circle class="c-loading__inner-ring" cx="100" cy="100" r="68" stroke-width="2" stroke-dasharray="6 10" />
    <!-- 3 Orbiting Dots at Different Speeds -->
    <g class="c-loading__orbit c-loading__orbit--1">
      <circle cx="100" cy="18" r="4" fill="#38bdf8" filter="url(#jcLoaderDotGlow)" />
    </g>
    <g class="c-loading__orbit c-loading__orbit--2">
      <circle cx="182" cy="100" r="3.5" fill="#a855f7" filter="url(#jcLoaderDotGlow)" />
    </g>
    <g class="c-loading__orbit c-loading__orbit--3">
      <circle cx="100" cy="182" r="3" fill="#22d3ee" filter="url(#jcLoaderDotGlow)" />
    </g>
  `;
  circleContainer.appendChild(svg);

  // Center Timer Content (large tabular-nums seconds + "sec" label)
  const centerContent = document.createElement("div");
  centerContent.className = "c-loading__center-content";
  centerContent.setAttribute("aria-hidden", "true");

  const timerValue = document.createElement("span");
  timerValue.className = "c-loading__timer-value";
  timerValue.textContent = "00";
  centerContent.appendChild(timerValue);

  const timerUnit = document.createElement("span");
  timerUnit.className = "c-loading__timer-unit";
  timerUnit.textContent = "sec";
  centerContent.appendChild(timerUnit);

  circleContainer.appendChild(centerContent);
  container.appendChild(circleContainer);

  // 2. Activity Text with Animated Trailing Dots
  const activityWrapper = document.createElement("div");
  activityWrapper.className = "c-loading__activity-wrapper";

  const activityText = document.createElement("p");
  activityText.className = "c-loading__activity-text";

  const activityLabelSpan = document.createElement("span");
  activityLabelSpan.className = "c-loading__activity-label";
  activityLabelSpan.textContent = LOADING_STEPS[0]!.label;
  activityText.appendChild(activityLabelSpan);

  const trailingDots = document.createElement("span");
  trailingDots.className = "c-loading__trailing-dots";
  trailingDots.setAttribute("aria-hidden", "true");
  trailingDots.innerHTML = "<span>.</span><span>.</span><span>.</span>";
  activityText.appendChild(trailingDots);

  activityWrapper.appendChild(activityText);
  container.appendChild(activityWrapper);

  // 3. Compact Progress Strip of Step Chips
  const stepsStrip = document.createElement("div");
  stepsStrip.className = "c-loading__steps-strip";
  stepsStrip.setAttribute("aria-hidden", "true");

  const chipElements: HTMLElement[] = [];

  LOADING_STEPS.forEach((step, idx) => {
    const chip = document.createElement("div");
    chip.className = `c-loading__step-chip ${idx === 0 ? "c-loading__step-chip--active" : "c-loading__step-chip--pending"}`;

    const dot = document.createElement("span");
    dot.className = "c-loading__step-dot";
    dot.textContent = idx === 0 ? "" : "";
    chip.appendChild(dot);

    const label = document.createElement("span");
    label.className = "c-loading__step-label";
    label.textContent = step.shortLabel;
    chip.appendChild(label);

    chipElements.push(chip);
    stepsStrip.appendChild(chip);
  });

  container.appendChild(stepsStrip);

  // 4. Timer Logic
  const startTimestamp = options?.startTime ?? Date.now();
  let currentStepIdx = 0;
  let isCleanedUp = false;

  const timerInterval = setInterval(() => {
    if (isCleanedUp) return;
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - startTimestamp) / 1000);
    timerValue.textContent = String(elapsedSeconds).padStart(2, "0");
  }, 200);

  // 5. Step Progression Logic (Advances every ~2.8s up to the final step)
  const STEP_DURATION_MS = 2800;
  const stepTimeouts: ReturnType<typeof setTimeout>[] = [];

  const updateStepUI = (stepIndex: number) => {
    if (isCleanedUp || stepIndex >= LOADING_STEPS.length) return;
    currentStepIdx = stepIndex;

    const step = LOADING_STEPS[stepIndex]!;

    // Trigger smooth fade/slide in
    activityText.style.animation = "none";
    // Force DOM reflow to restart animation cleanly
    void activityText.offsetWidth;
    activityText.style.animation = "jcStepSlideIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both";
    activityLabelSpan.textContent = step.label;

    // Update chips: finished -> green check, active -> pulsing, pending -> muted
    chipElements.forEach((chip, i) => {
      chip.className = "c-loading__step-chip";
      const dot = chip.querySelector(".c-loading__step-dot");
      if (!dot) return;

      if (i < currentStepIdx) {
        chip.classList.add("c-loading__step-chip--done");
        dot.textContent = "✓";
      } else if (i === currentStepIdx) {
        chip.classList.add("c-loading__step-chip--active");
        dot.textContent = "";
      } else {
        chip.classList.add("c-loading__step-chip--pending");
        dot.textContent = "";
      }
    });

    options?.onStepChange?.(stepIndex);
  };

  // Schedule auto progression for steps 1 through 6 (step 6 is the 7th step, "Building your report")
  for (let i = 1; i < LOADING_STEPS.length; i++) {
    const to = setTimeout(() => {
      updateStepUI(i);
    }, i * STEP_DURATION_MS);
    stepTimeouts.push(to);
  }

  const fastForwardToEnd = async (): Promise<void> => {
    // Clear any pending slow timeouts
    stepTimeouts.forEach((id) => clearTimeout(id));
    stepTimeouts.length = 0;

    const FAST_STEP_DELAY_MS = 140; // Quick, snappy 140ms progression per step

    // Rapidly progress through any uncompleted steps
    for (let step = currentStepIdx + 1; step < LOADING_STEPS.length; step++) {
      if (isCleanedUp) return;
      updateStepUI(step);
      await new Promise((r) => setTimeout(r, FAST_STEP_DELAY_MS));
    }

    if (isCleanedUp) return;

    // Final confirmation state: mark all step chips completed with checkmark
    chipElements.forEach((chip) => {
      chip.className = "c-loading__step-chip c-loading__step-chip--done";
      const dot = chip.querySelector(".c-loading__step-dot");
      if (dot) dot.textContent = "✓";
    });

    // Brief 220ms beat to let user see final checks complete before swapping view
    await new Promise((r) => setTimeout(r, 220));
  };

  const cleanup = () => {
    isCleanedUp = true;
    clearInterval(timerInterval);
    stepTimeouts.forEach((id) => clearTimeout(id));
    stepTimeouts.length = 0;
  };

  return {
    element: container,
    cleanup,
    advanceToStep: (idx: number) => {
      updateStepUI(idx);
    },
    fastForwardToEnd,
  };
}
