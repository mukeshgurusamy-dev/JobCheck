import "./RiskOrb.css";
import { bindAnimationPause } from "../../utils/motion";

/**
 * The risk orb.
 *
 * Presentation only. It is handed a state string that the caller has already
 * derived from the result — it never reads a score, decides a level, or
 * influences one. Two mounts use it: the scanning state while a check runs,
 * and the header of the result panel, where it sits behind the score gauge and
 * takes the colour of the level the gauge is already showing.
 *
 * The centre is deliberately hollow. In the result panel the score number sits
 * there, and a filled disc behind a number is the fastest way to drop its
 * contrast below AA.
 *
 * Renderer note: this is CSS and gradients, not WebGL. three.js could not be
 * installed in this environment, so the mandated graceful-degradation path — a
 * static, CSS-animated orb — is what ships. It uses one element per layer,
 * animates only `transform` and `opacity`, and pauses itself when the tab is
 * hidden or the orb scrolls out of view.
 */

export type OrbState = "scanning" | "low" | "medium" | "high";

export interface RiskOrbOptions {
  state: OrbState;
  /**
   * Describes the orb for assistive technology. Omit it where the orb is
   * decorative because the same fact is already stated in text next to it — it
   * is then hidden from the accessibility tree instead of being announced
   * twice.
   */
  label?: string;
}

const BASE_CLASS = "c-risk-orb";

export function createRiskOrb(options: RiskOrbOptions): HTMLElement {
  const orb = document.createElement("div");
  orb.className = `${BASE_CLASS} ${BASE_CLASS}--${options.state}`;
  orb.dataset.state = options.state;

  if (options.label) {
    orb.setAttribute("role", "img");
    orb.setAttribute("aria-label", options.label);
  } else {
    orb.setAttribute("aria-hidden", "true");
  }

  const glow = document.createElement("div");
  glow.className = `${BASE_CLASS}__glow`;

  const swirl = document.createElement("div");
  swirl.className = `${BASE_CLASS}__swirl`;

  const swirlInner = document.createElement("div");
  swirlInner.className = `${BASE_CLASS}__swirl-inner`;

  orb.append(glow, swirl, swirlInner);

  bindAnimationPause(orb);

  return orb;
}
