import "./ScoreGauge.css";
import { RiskLevel } from "../../types/types";

export interface ScoreGaugeOptions {
  score: number;
  level: RiskLevel;
  animated?: boolean;
}

export function createScoreGauge(options: ScoreGaugeOptions): HTMLElement {
  const { score, level, animated = true } = options;

  const container = document.createElement("div");
  container.className = `c-score-gauge c-score-gauge--${level.toLowerCase()}`;
  container.setAttribute("role", "meter");
  container.setAttribute("aria-valuenow", score.toString());
  container.setAttribute("aria-valuemin", "0");
  container.setAttribute("aria-valuemax", "100");
  container.setAttribute(
    "aria-label",
    `Risk score ${score} out of 100, ${level} risk`,
  );

  const radius = 56;
  const circumference = 2 * Math.PI * radius; // ~351.86

  // SVG structure
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 140 140");
  svg.setAttribute("class", "c-score-gauge__svg");
  svg.setAttribute("aria-hidden", "true");

  // Track circle (background)
  const track = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  track.setAttribute("class", "c-score-gauge__track");
  track.setAttribute("cx", "70");
  track.setAttribute("cy", "70");
  track.setAttribute("r", radius.toString());
  svg.appendChild(track);

  // Meter circle (foreground arc)
  const meter = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  meter.setAttribute("class", "c-score-gauge__meter");
  meter.setAttribute("cx", "70");
  meter.setAttribute("cy", "70");
  meter.setAttribute("r", radius.toString());
  meter.style.strokeDasharray = `${circumference} ${circumference}`;

  // Start with full offset (empty circle)
  meter.style.strokeDashoffset = circumference.toString();
  svg.appendChild(meter);

  container.appendChild(svg);

  // Center display (number + /100)
  const center = document.createElement("div");
  center.className = "c-score-gauge__center";

  const numberSpan = document.createElement("span");
  numberSpan.className = "c-score-gauge__number";
  numberSpan.textContent = animated ? "0" : score.toString();
  center.appendChild(numberSpan);

  const scaleSpan = document.createElement("span");
  scaleSpan.className = "c-score-gauge__scale";
  scaleSpan.textContent = "/ 100";
  center.appendChild(scaleSpan);

  container.appendChild(center);

  // Calculate target offset
  const targetOffset =
    circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Adds the glow to the arc, once it has stopped moving.
   *
   * The glow is a `drop-shadow` filter on the very path being drawn, and a
   * filter forces a full repaint of that layer every frame the stroke changes.
   * Deferring it until the arc is static means the animation stays on the
   * compositor and the glow is paid for once.
   */
  const settle = (): void => {
    container.classList.add("c-score-gauge--settled");
  };

  if (!animated || prefersReducedMotion) {
    meter.style.strokeDashoffset = targetOffset.toString();
    numberSpan.textContent = score.toString();
    // No transition will run, so no transitionend will fire.
    settle();
  } else {
    // Stagger slightly so animation triggers after mount
    requestAnimationFrame(() => {
      meter.style.strokeDashoffset = targetOffset.toString();

      // `transitionend` is the accurate signal, but it does not fire if the
      // element is not in the document when the transition runs, and it does
      // not fire at all when a transition duration resolves to zero. The timer
      // is the backstop; whichever arrives first wins, and the class is
      // idempotent.
      meter.addEventListener("transitionend", settle, { once: true });
      window.setTimeout(settle, 1400);

      // Count up number animation
      const duration = 1000; // 1 second
      const startTime = performance.now();

      function updateNumber(currentTime: number) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.round(ease * score);
        numberSpan.textContent = currentVal.toString();

        if (progress < 1) {
          requestAnimationFrame(updateNumber);
        } else {
          numberSpan.textContent = score.toString();
        }
      }

      requestAnimationFrame(updateNumber);
    });
  }

  return container;
}
