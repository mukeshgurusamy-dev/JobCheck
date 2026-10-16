import "./UrlInput.css";
import { createIcon } from "../Icon/Icon";

export interface UrlInputOptions {
  id: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  onInput?: (value: string) => void;
  onClear?: () => void;
}

export interface UrlInputElement extends HTMLElement {
  getValue: () => string;
  setValue: (val: string) => void;
  setError: (errorMessage: string | null) => void;
  focusInput: () => void;
  setDisabled: (disabled: boolean) => void;
}

export function createUrlInput(options: UrlInputOptions): UrlInputElement {
  const {
    id,
    label,
    placeholder = "e.g. https://careers.tcs.com/job/123",
    initialValue = "",
    onInput,
    onClear
  } = options;

  const container = document.createElement("div");
  container.className = "c-url-input";

  // Label
  const labelEl = document.createElement("label");
  labelEl.htmlFor = id;
  labelEl.className = "c-url-input__label";
  labelEl.textContent = label;
  container.appendChild(labelEl);

  // Control wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "c-url-input__control-wrapper";

  // Prefix icon
  const prefixIcon = document.createElement("span");
  prefixIcon.className = "c-url-input__icon-prefix";
  prefixIcon.appendChild(createIcon({ name: "search", size: "sm" }));
  wrapper.appendChild(prefixIcon);

  // Input field
  const input = document.createElement("input");
  input.type = "url";
  input.id = id;
  input.name = "url";
  input.className = "c-url-input__field";
  input.placeholder = placeholder;
  input.value = initialValue;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-required", "true");
  wrapper.appendChild(input);

  // Clear button
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "c-url-input__clear-btn";
  clearBtn.setAttribute("aria-label", "Clear URL");
  clearBtn.appendChild(createIcon({ name: "shield-x", size: "sm" }));
  wrapper.appendChild(clearBtn);

  container.appendChild(wrapper);

  // Error message container
  const errorEl = document.createElement("div");
  errorEl.id = `${id}-error`;
  errorEl.className = "c-url-input__error";
  errorEl.setAttribute("role", "alert");
  container.appendChild(errorEl);

  input.setAttribute("aria-describedby", `${id}-error`);

  function updateClearBtnVisibility() {
    if (input.value.length > 0) {
      clearBtn.classList.add("c-url-input__clear-btn--visible");
    } else {
      clearBtn.classList.remove("c-url-input__clear-btn--visible");
    }
  }

  updateClearBtnVisibility();

  input.addEventListener("input", () => {
    updateClearBtnVisibility();
    if (input.getAttribute("aria-invalid") === "true") {
      setError(null);
    }
    if (onInput) {
      onInput(input.value);
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    updateClearBtnVisibility();
    setError(null);
    input.focus();
    if (onClear) onClear();
    if (onInput) onInput("");
  });

  const setError = (errorMessage: string | null) => {
    if (errorMessage) {
      input.setAttribute("aria-invalid", "true");
      errorEl.innerHTML = "";
      const icon = createIcon({ name: "alert-circle", size: "xs", colorClass: "c-icon--risk-high" });
      const textSpan = document.createElement("span");
      textSpan.textContent = errorMessage;
      errorEl.appendChild(icon);
      errorEl.appendChild(textSpan);
    } else {
      input.removeAttribute("aria-invalid");
      errorEl.innerHTML = "";
    }
  };

  const methods: Omit<UrlInputElement, keyof HTMLElement> = {
    getValue: () => input.value.trim(),
    setValue: (val: string) => {
      input.value = val;
      updateClearBtnVisibility();
      if (onInput) onInput(val);
    },
    setError,
    focusInput: () => {
      input.focus();
    },
    setDisabled: (disabled: boolean) => {
      input.disabled = disabled;
      clearBtn.disabled = disabled;
    }
  };

  return Object.assign(container, methods);
}
