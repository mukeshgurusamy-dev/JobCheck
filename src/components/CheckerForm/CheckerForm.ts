import "./CheckerForm.css";
import { createUrlInput } from "../UrlInput/UrlInput";
import { createButton, CustomButtonElement } from "../Button/Button";
import { createIcon } from "../Icon/Icon";
import { isTrustedPlatformUrl, validateAndNormalizeUrl } from "../../utils/url";

export interface CheckerFormOptions {
  onSubmit: (data: { url: string; description: string; isSecondAttempt?: boolean }) => Promise<void>;
  initialUrl?: string;
  initialDescription?: string;
  initiallyExpanded?: boolean;
}

export interface CheckerFormElement extends HTMLFormElement {
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  setUrl: (url: string) => void;
  setDescription: (desc: string) => void;
  resetForm: () => void;
}

export function createCheckerForm(options: CheckerFormOptions): CheckerFormElement {
  const { onSubmit, initialUrl = "", initialDescription = "" } = options;

  const form = document.createElement("form") as CheckerFormElement;
  form.className = "c-checker-form";
  form.noValidate = true;

  // Track submission attempts per URL for two-stage flow
  let lastUrlSubmitted = "";
  let hasShownWarningForCurrentUrl = false;

  // 1. URL Input molecule
  const urlInput = createUrlInput({
    id: "job-url-input",
    label: "Job Posting URL",
    placeholder: "Paste job link (e.g. https://careers.tcs.com/... or https://linkedin.com/jobs/...)",
    initialValue: initialUrl,
    onInput: (val: string) => {
      syncPlatformEnforcement(val);
    },
    onClear: () => {
      syncPlatformEnforcement("");
    }
  });
  form.appendChild(urlInput);

  // 2. Quick Sample Chips for freshers
  const samplesWrapper = document.createElement("div");
  samplesWrapper.className = "c-checker-form__samples";

  const samplesLabel = document.createElement("span");
  samplesLabel.className = "c-checker-form__samples-label";
  samplesLabel.textContent = "Quick samples:";
  samplesWrapper.appendChild(samplesLabel);

  const sampleLinks = [
    {
      label: "Authentic TCS",
      url: "https://careers.tcs.com/job/tcs-ninja-fresher-2026",
      desc: "About Company: Tata Consultancy Services. Key Responsibilities: Software development under mentorship. Qualifications: B.E/B.Tech/MCA graduates with minimum 60% aggregate. Package: 3.36 LPA - 3.6 LPA."
    },
    {
      label: "LinkedIn Scam with Link",
      url: "https://www.linkedin.com/jobs/view/987654321",
      desc: "TCS Ninja Recruitment 2026. Spot offer letter issued. Pay ₹2,500 registration fee and confirm slot at https://tcs-interview-portal.xyz/apply before seats run out."
    },
    {
      label: "WhatsApp Fee Scam",
      url: "https://careers-tcs-entry.xyz/apply",
      desc: "Selected for TCS Fresher role. Pay ₹1,500 refundable security deposit for interview gate pass via UPI."
    },
    {
      label: "Telegram Tasks",
      url: "https://t.me/freshers_daily_tasks_earn",
      desc: "Daily YouTube likes tasks. Earn ₹3,000 commission. Payout in USDT or bank transfer. Recharge ₹500 to unlock tasks."
    },
    {
      label: "Brand Typo (.xyz)",
      url: "https://infosyss.xyz/apply-online",
      desc: "Direct joining in Infosys. Deposit ₹2,000 for laptop delivery charges."
    }
  ];

  for (const sample of sampleLinks) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "c-checker-form__sample-chip";
    chip.textContent = sample.label;
    chip.addEventListener("click", () => {
      urlInput.setValue(sample.url);
      urlInput.setError(null);
      textarea.value = sample.desc;
      updateCharCount();
      syncPlatformEnforcement(sample.url);
      if (!disclosure.classList.contains("c-checker-form__disclosure--open")) {
        disclosure.classList.add("c-checker-form__disclosure--open");
        disclosureToggle.setAttribute("aria-expanded", "true");
      }
    });
    samplesWrapper.appendChild(chip);
  }
  form.appendChild(samplesWrapper);

  // 3. Description Textarea Section (Linear/Apple aesthetic, open by default)
  const isInitiallyOpen = options.initiallyExpanded ?? true;
  const disclosure = document.createElement("div");
  disclosure.className = isInitiallyOpen
    ? "c-checker-form__disclosure c-checker-form__disclosure--open"
    : "c-checker-form__disclosure";

  const disclosureToggle = document.createElement("button");
  disclosureToggle.type = "button";
  disclosureToggle.className = "c-checker-form__disclosure-toggle";
  disclosureToggle.setAttribute("aria-expanded", isInitiallyOpen ? "true" : "false");

  const toggleIcon = document.createElement("span");
  toggleIcon.className = "c-checker-form__toggle-icon";
  toggleIcon.appendChild(createIcon({ name: "file-text", size: "sm" }));

  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Job Description & Text Verification (Recommended)";

  disclosureToggle.appendChild(toggleIcon);
  disclosureToggle.appendChild(toggleLabel);
  disclosure.appendChild(disclosureToggle);

  const disclosureContent = document.createElement("div");
  disclosureContent.className = "c-checker-form__disclosure-content";

  // Banner for trusted platforms
  const platformBanner = document.createElement("div");
  platformBanner.className = "c-checker-form__platform-banner";
  platformBanner.style.display = "none";

  const bannerIcon = document.createElement("span");
  bannerIcon.className = "c-checker-form__platform-banner-icon";
  bannerIcon.appendChild(createIcon({ name: "shield-alert", size: "sm", colorClass: "c-icon--primary" }));

  const bannerText = document.createElement("div");
  bannerText.innerHTML = "<strong>📱 Mobile App & Portal Tip:</strong> Platforms like Indeed, Naukri, and LinkedIn block automated scraping and disable text selection inside their native apps.<br>To analyze this job: Open the link in your <strong>mobile browser (Chrome/Safari)</strong> or view it on a <strong>computer</strong>, copy the job description, and paste it below for a full 10-point scam check!";

  platformBanner.appendChild(bannerIcon);
  platformBanner.appendChild(bannerText);
  disclosureContent.appendChild(platformBanner);

  const textareaWrapper = document.createElement("div");
  textareaWrapper.className = "c-checker-form__textarea-wrapper";

  const textarea = document.createElement("textarea");
  textarea.className = "c-checker-form__textarea";
  textarea.id = "job-description-input";
  textarea.name = "description";
  textarea.placeholder = "Paste the full job description, WhatsApp message, or email body here...";
  textarea.value = initialDescription;
  textarea.maxLength = 25000;
  textareaWrapper.appendChild(textarea);
  disclosureContent.appendChild(textareaWrapper);

  const textareaMeta = document.createElement("div");
  textareaMeta.className = "c-checker-form__textarea-meta";

  const charCounter = document.createElement("span");
  function updateCharCount() {
    charCounter.textContent = `${textarea.value.length} / 25,000 characters`;
  }
  updateCharCount();
  textarea.addEventListener("input", () => {
    updateCharCount();
    textarea.classList.remove("c-checker-form__textarea--error");
  });

  const tipSpan = document.createElement("span");
  tipSpan.textContent = "Embedded links inside description are automatically inspected.";

  textareaMeta.appendChild(charCounter);
  textareaMeta.appendChild(tipSpan);
  disclosureContent.appendChild(textareaMeta);

  disclosure.appendChild(disclosureContent);

  function syncPlatformEnforcement(urlStr: string) {
    const isTrusted = isTrustedPlatformUrl(urlStr);
    if (isTrusted) {
      platformBanner.style.display = "flex";
      toggleLabel.textContent = "Paste Job Description (Recommended — portals block automated scraping)";
      toggleLabel.style.fontWeight = "600";
      if (!disclosure.classList.contains("c-checker-form__disclosure--open")) {
        disclosure.classList.add("c-checker-form__disclosure--open");
        disclosureToggle.setAttribute("aria-expanded", "true");
      }
    } else {
      platformBanner.style.display = "none";
      toggleLabel.textContent = "Job description (optional — paste text or offer message for deeper check)";
      toggleLabel.style.fontWeight = "";
    }
  }

  if (initialUrl) {
    syncPlatformEnforcement(initialUrl);
  }

  if (initialDescription) {
    disclosure.classList.add("c-checker-form__disclosure--open");
  }

  disclosureToggle.addEventListener("click", () => {
    const isOpen = disclosure.classList.toggle("c-checker-form__disclosure--open");
    disclosureToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen) {
      textarea.focus();
    }
  });

  form.appendChild(disclosure);

  // 3b. Warning message (shown on first submission without description)
  const warningBox = document.createElement("div");
  warningBox.className = "c-checker-form__warning-box";
  warningBox.style.display = "none";

  const warningIcon = document.createElement("span");
  warningIcon.className = "c-checker-form__warning-icon";
  warningIcon.appendChild(createIcon({ name: "info", size: "sm", colorClass: "c-icon--primary" }));

  const warningText = document.createElement("span");
  warningText.className = "c-checker-form__warning-text";
  warningText.innerHTML = "<strong>Paste the job description for full analysis.</strong> Portals like Indeed &amp; Naukri block automated scraping and mobile apps disable copying text. Open the link in your <strong>mobile browser (Chrome/Safari)</strong> or on a <strong>computer</strong> to copy &amp; paste the text, or click Run Scam Check again to check the URL only.";

  warningBox.appendChild(warningIcon);
  warningBox.appendChild(warningText);
  disclosure.insertBefore(warningBox, disclosureContent);

  // 4. Submit Row with Button
  const submitRow = document.createElement("div");
  submitRow.className = "c-checker-form__submit-row";

  const submitBtn: CustomButtonElement = createButton({
    text: "Run Scam Check",
    variant: "primary",
    size: "lg",
    type: "submit",
    iconBefore: "shield-check",
    className: "c-checker-form__submit-btn",
  });
  submitRow.appendChild(submitBtn);
  form.appendChild(submitRow);

  // 5. Form submission handler with two-stage logic
  form.addEventListener("submit", (e: Event) => {
    e.preventDefault();

    const rawUrl = urlInput.getValue();
    const validation = validateAndNormalizeUrl(rawUrl);

    if (!validation.valid || !validation.normalizedUrl) {
      urlInput.setError(validation.error || "Please enter a valid HTTP or HTTPS job link.");
      urlInput.focusInput();
      warningBox.style.display = "none";
      textarea.classList.remove("c-checker-form__textarea--warning");
      return;
    }

    const desc = textarea.value.trim();
    const normalizedUrl = validation.normalizedUrl;

    // Check if URL changed - reset warning state if it did
    if (normalizedUrl !== lastUrlSubmitted) {
      hasShownWarningForCurrentUrl = false;
      lastUrlSubmitted = normalizedUrl;
    }

    // Two-stage flow: First submission without description shows warning
    if (desc.length === 0 && !hasShownWarningForCurrentUrl) {
      // Stage 1: Show warning, don't process
      hasShownWarningForCurrentUrl = true;
      urlInput.setError(null);
      textarea.classList.add("c-checker-form__textarea--warning");
      warningBox.style.display = "flex";
      if (!disclosure.classList.contains("c-checker-form__disclosure--open")) {
        disclosure.classList.add("c-checker-form__disclosure--open");
        disclosureToggle.setAttribute("aria-expanded", "true");
      }
      textarea.focus();
      return;
    }

    // Stage 2 or beyond: Clear warning and proceed with processing
    urlInput.setError(null);
    textarea.classList.remove("c-checker-form__textarea--warning");
    warningBox.style.display = "none";
    hasShownWarningForCurrentUrl = false;

    // Pass flag to backend indicating this is a second+ attempt
    onSubmit({
      url: normalizedUrl,
      description: desc,
      isSecondAttempt: desc.length === 0
    } as any);
  });

  // Attached methods
  form.setLoading = (isLoading: boolean) => {
    submitBtn.setLoading(isLoading, "Analyzing Signals & Links...");
    urlInput.setDisabled(isLoading);
    textarea.disabled = isLoading;
  };

  form.setError = (message: string | null) => {
    urlInput.setError(message);
  };

  form.setUrl = (url: string) => {
    urlInput.setValue(url);
    syncPlatformEnforcement(url);
  };

  form.setDescription = (desc: string) => {
    textarea.value = desc;
    updateCharCount();
    if (desc && !disclosure.classList.contains("c-checker-form__disclosure--open")) {
      disclosure.classList.add("c-checker-form__disclosure--open");
      disclosureToggle.setAttribute("aria-expanded", "true");
    }
  };

  form.resetForm = () => {
    form.reset();
    urlInput.setValue("");
    urlInput.setError(null);
    textarea.value = "";
    textarea.classList.remove("c-checker-form__textarea--error");
    syncPlatformEnforcement("");
    updateCharCount();
    submitBtn.setLoading(false);
  };

  return form;
}

