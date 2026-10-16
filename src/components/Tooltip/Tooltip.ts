import "./Tooltip.css";
import { createIcon } from "../Icon/Icon";

let tooltipIdCounter = 0;

export interface TooltipOptions {
  text: string;
  triggerElement?: HTMLElement;
  position?: "top" | "bottom";
  className?: string;
}

export function createTooltip(options: TooltipOptions): HTMLElement {
  const {
    text,
    triggerElement,
    position = "top",
    className
  } = options;

  const tooltipId = `tooltip-desc-${++tooltipIdCounter}`;

  const container = document.createElement("span");
  container.className = `c-tooltip c-tooltip--${position}${className ? ` ${className}` : ""}`;

  let trigger: HTMLElement;
  if (triggerElement) {
    trigger = triggerElement;
  } else {
    const defaultBtn = document.createElement("button");
    defaultBtn.type = "button";
    defaultBtn.className = "c-tooltip__trigger";
    defaultBtn.setAttribute("aria-label", "More info");
    defaultBtn.appendChild(createIcon({ name: "info", size: "sm" }));
    trigger = defaultBtn;
  }

  trigger.setAttribute("aria-describedby", tooltipId);
  container.appendChild(trigger);

  const bubble = document.createElement("span");
  bubble.id = tooltipId;
  bubble.className = "c-tooltip__bubble";
  bubble.setAttribute("role", "tooltip");
  bubble.textContent = text;
  container.appendChild(bubble);

  // Keyboard accessibility: dismiss on Escape
  container.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      container.classList.remove("c-tooltip--active");
      (trigger as HTMLElement).blur();
    }
  });

  return container;
}
