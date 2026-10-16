import "./Badge.css";
import { createIcon, IconName } from "../Icon/Icon";

export type BadgeVariant =
  | "risk-low"
  | "risk-medium"
  | "risk-high"
  | "trust"
  | "neutral"
  | "primary";

export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeOptions {
  text: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  iconName?: IconName;
  showDefaultIcon?: boolean;
  className?: string;
}

const DEFAULT_VARIANT_ICONS: Partial<Record<BadgeVariant, IconName>> = {
  "risk-low": "shield-check",
  "risk-medium": "alert-triangle",
  "risk-high": "shield-alert",
  trust: "check"
};

export function createBadge(options: BadgeOptions): HTMLSpanElement {
  const {
    text,
    variant = "neutral",
    size = "md",
    iconName,
    showDefaultIcon = true,
    className
  } = options;

  const badge = document.createElement("span");
  const classList = ["c-badge", `c-badge--${variant}`, `c-badge--${size}`];

  if (className) {
    classList.push(className);
  }
  badge.className = classList.join(" ");

  const resolvedIcon: IconName | undefined =
    iconName || (showDefaultIcon ? DEFAULT_VARIANT_ICONS[variant] : undefined);

  if (resolvedIcon) {
    const iconWrapper = document.createElement("span");
    iconWrapper.className = "c-badge__icon";
    const iconSize = size === "lg" ? "md" : "sm";
    const iconEl = createIcon({ name: resolvedIcon, size: iconSize });
    iconWrapper.appendChild(iconEl);
    badge.appendChild(iconWrapper);
  }

  const textEl = document.createElement("span");
  textEl.className = "c-badge__text";
  textEl.textContent = text;
  badge.appendChild(textEl);

  return badge;
}
