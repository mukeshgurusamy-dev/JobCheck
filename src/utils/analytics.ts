/**
 * JobCheck Visitor Analytics — Frontend Tracking Module
 *
 * Captures browser info, tracks user actions (scans, PDF downloads, helpline
 * clicks), and reliably sends session duration to the backend when the user
 * leaves the page using navigator.sendBeacon().
 *
 * PRIVACY: No cookies are used. The session is tied to a random UUID stored
 * in sessionStorage (cleared when the tab closes). IP and geolocation are
 * resolved server-side by Netlify headers — never exposed to JavaScript.
 */

const TRACK_ENDPOINT = "/.netlify/functions/track";

// ---- Session ID (per-tab, non-persistent) ----

let _sessionId: string | null = null;
let _sessionStartMs = Date.now();

function getSessionId(): string {
  if (_sessionId) return _sessionId;
  try {
    const stored = window.sessionStorage.getItem("jc_sid");
    if (stored) {
      _sessionId = stored;
      return stored;
    }
  } catch { /* private browsing */ }

  _sessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.sessionStorage.setItem("jc_sid", _sessionId);
  } catch { /* ok */ }
  return _sessionId;
}

// ---- Browser / Device Detection ----

interface DeviceInfo {
  browser: string;
  os: string;
  device_type: string;
  is_mobile: boolean;
  screen_resolution: string;
  language: string;
  referrer: string;
  landing_page: string;
}

function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;

  // Browser
  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  // OS
  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/CrOS/i.test(ua)) os = "Chrome OS";

  // Mobile vs Desktop
  const is_mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const device_type = is_mobile ? "Mobile" : "Desktop";

  return {
    browser,
    os,
    device_type,
    is_mobile,
    screen_resolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language || "en",
    referrer: document.referrer || "Direct",
    landing_page: window.location.pathname + window.location.search,
  };
}

// ---- Sending Events ----

function sendEvent(payload: Record<string, unknown>): void {
  payload.session_id = getSessionId();
  try {
    fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* non-critical, swallow silently */ });
  } catch {
    /* fetch not available — swallow */
  }
}

function sendBeaconEvent(payload: Record<string, unknown>): void {
  payload.session_id = getSessionId();
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(TRACK_ENDPOINT, blob);
  } catch {
    // Fallback to fetch with keepalive
    sendEvent(payload);
  }
}

// ---- Public API ----

let _initialized = false;

/**
 * Call once on page load. Sends the initial visit event with device info.
 */
export function initAnalytics(): void {
  if (_initialized) return;
  _initialized = true;
  _sessionStartMs = Date.now();

  const device = detectDevice();
  sendEvent({
    action: "init",
    ...device,
  });

  // Register exit handlers to send session duration when user leaves
  const sendExit = () => {
    const durationSeconds = Math.round((Date.now() - _sessionStartMs) / 1000);
    sendBeaconEvent({
      action: "exit",
      duration_seconds: durationSeconds,
    });
  };

  // Global listener for helpline link clicks
  document.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement)?.closest("a");
    if (
      target &&
      target.href &&
      (target.href.includes("cybercrime.gov.in") ||
        target.href.includes("ic3.gov") ||
        target.href.includes("1930"))
    ) {
      try {
        trackHelplineClick();
      } catch {
        // non-blocking
      }
    }
  });

  // visibilitychange fires reliably on tab close / navigation in modern browsers
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      sendExit();
    }
  });

  // pagehide is the most reliable event for mobile Safari
  window.addEventListener("pagehide", sendExit);
}

/**
 * Call after a job scan completes with the assessment results.
 */
export function trackJobSearch(data: {
  jobUrl?: string;
  companyName?: string;
  riskLevel: string;
  score: number;
  scamTypes: string[];
}): void {
  sendEvent({
    action: "search",
    job_url: data.jobUrl || "",
    company_name: data.companyName || "",
    risk_level: data.riskLevel,
    score: data.score,
    scam_types: data.scamTypes,
  });
}

/**
 * Call when user clicks "Download PDF Report".
 */
export function trackPdfDownload(): void {
  sendEvent({ action: "pdf_download" });
}

/**
 * Call when user clicks a helpline link (1930 / cybercrime.gov.in / ic3.gov).
 */
export function trackHelplineClick(): void {
  sendEvent({ action: "helpline_click" });
}

/**
 * Call when user copies the report text.
 */
export function trackCopyReport(): void {
  sendEvent({ action: "copy_report" });
}
