import "./Button.css";
import { createIcon, IconName } from "../Icon/Icon";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonOptions {
  text: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  iconBefore?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
}

export interface CustomButtonElement extends HTMLButtonElement {
  setLoading: (loading: boolean, loadingText?: string) => void;
  setDisabled: (disabled: boolean) => void;
}

export function createButton(options: ButtonOptions): CustomButtonElement {
  const {
    text,
    variant = "primary",
    size = "md",
    type = "button",
    iconBefore,
    iconAfter,
    loading = false,
    disabled = false,
    fullWidth = false,
    className,
    ariaLabel,
    onClick
  } = options;

  const button = document.createElement("button") as CustomButtonElement;
  button.type = type;

  const classList = [
    "c-button",
    `c-button--${variant}`,
    `c-button--${size}`
  ];

  if (fullWidth) classList.push("c-button--full-width");
  if (className) classList.push(className);
  button.className = classList.join(" ");

  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
  }
  if (disabled) {
    button.disabled = true;
  }

  let originalText = text;
  let currentLoading = loading;

  function renderContent(loadingState: boolean, currentLabel: string) {
    button.innerHTML = "";

    if (loadingState) {
      button.classList.add("c-button--loading");
      button.setAttribute("aria-busy", "true");
      button.disabled = true;

      const spinner = document.createElement("span");
      spinner.className = "c-button__spinner";
      spinner.appendChild(createIcon({ name: "loader", size: size === "lg" ? "md" : "sm" }));
      button.appendChild(spinner);

      const textNode = document.createElement("span");
      textNode.textContent = currentLabel;
      button.appendChild(textNode);
      return;
    }

    button.classList.remove("c-button--loading");
    button.removeAttribute("aria-busy");
    button.disabled = disabled;

    if (iconBefore) {
      const iconEl = createIcon({ name: iconBefore, size: size === "lg" ? "md" : "sm" });
      button.appendChild(iconEl);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = currentLabel;
    button.appendChild(textSpan);

    if (iconAfter) {
      const iconEl = createIcon({ name: iconAfter, size: size === "lg" ? "md" : "sm" });
      button.appendChild(iconEl);
    }
  }

  renderContent(currentLoading, originalText);

  if (onClick) {
    button.addEventListener("click", onClick);
  }

  button.setLoading = (isLoading: boolean, loadingText?: string) => {
    currentLoading = isLoading;
    renderContent(isLoading, loadingText || originalText);
  };

  button.setDisabled = (isDisabled: boolean) => {
    button.disabled = isDisabled;
  };

  return button;
}
