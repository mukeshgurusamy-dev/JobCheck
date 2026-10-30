/**
 * URL parsing, normalization, validation, and domain hierarchy extraction.
 */

import { TRUSTED_JOB_PLATFORMS } from "../rules/lists";

const KNOWN_MULTI_PART_TLDS = new Set([
  "co.in",
  "org.in",
  "net.in",
  "ac.in",
  "edu.in",
  "gov.in",
  "res.in",
  "mil.in",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "com.br",
  "com.sg",
  "edu.sg",
  "gov.sg"
]);

export interface NormalizedUrlResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export interface DomainParts {
  hostname: string;
  rootDomain: string;
  subdomain: string;
  sld: string; // The primary name label (e.g. "infosys" in "infosys.com")
  tld: string; // The full suffix (e.g. ".com" or ".co.in")
  subdomainPartsCount: number;
}

/**
 * Checks if a string represents an IPv4 or IPv6 address.
 */
export function isIpAddress(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, "");
  // IPv4 check
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(clean)) {
    const parts = clean.split(".").map(Number);
    return parts.every((p) => p >= 0 && p <= 255);
  }

  // IPv6 check: contains colons, valid hex/colons, at most one double-colon
  if (clean.includes(":") && /^[0-9a-fA-F:]+$/.test(clean)) {
    const parts = clean.split(":");
    const doubleColonCount = (clean.match(/::/g) || []).length;
    if (doubleColonCount <= 1 && parts.length <= 9) {
      return parts.every((p) => p.length <= 4);
    }
  }

  return false;
}

/**
 * Checks if an IP string is a private, loopback, or link-local address.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, "").toLowerCase();

  if (clean === "localhost" || clean === "127.0.0.1" || clean === "::1" || clean === "0.0.0.0") {
    return true;
  }

  // IPv4 check
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4])
    ];
    const first = octets[0];
    const second = octets[1];

    if (first === undefined || second === undefined) return false;

    // 127.0.0.0/8 (Loopback)
    if (first === 127) return true;
    // 10.0.0.0/8 (Private)
    if (first === 10) return true;
    // 172.16.0.0/12 (Private 172.16 - 172.31)
    if (first === 172 && second >= 16 && second <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (first === 192 && second === 168) return true;
    // 169.254.0.0/16 (Link-local)
    if (first === 169 && second === 254) return true;
    // 100.64.0.0/10 (Carrier NAT)
    if (first === 100 && second >= 64 && second <= 127) return true;
    // 0.0.0.0/8
    if (first === 0) return true;

    return false;
  }

  // IPv6 local / link-local / unique local
  if (clean.startsWith("fe80:") || clean.startsWith("fc00:") || clean.startsWith("fd00:")) {
    return true;
  }

  return false;
}

/**
 * Strips tracking query parameters and canonicalizes URLs from job platforms (Indeed, Naukri, LinkedIn).
 */
export function cleanJobBoardUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // Indeed: keep only jk or vjk parameter, strip mobile share parameters (from=appshareandroid, etc.)
    if (host.includes("indeed.")) {
      const jk = parsed.searchParams.get("jk") || parsed.searchParams.get("vjk");
      if (jk) {
        return `https://${parsed.hostname}/viewjob?jk=${encodeURIComponent(jk)}`;
      }
    }

    // Naukri: strip mobile tracking parameters
    if (host.includes("naukri.com")) {
      const TRACKING_PARAMS = ["src", "xp", "px", "sid", "q", "k", "from", "utm_source", "utm_medium", "utm_campaign"];
      TRACKING_PARAMS.forEach((p) => parsed.searchParams.delete(p));
      return parsed.toString();
    }

    // LinkedIn: strip tracking parameters
    if (host.includes("linkedin.com")) {
      const TRACKING_PARAMS = ["refId", "trackingId", "trk", "midToken", "from", "utm_source", "utm_medium"];
      TRACKING_PARAMS.forEach((p) => parsed.searchParams.delete(p));
      return parsed.toString();
    }

    // Generic tracking parameter cleanup
    const COMMON_TRACKING = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    let changed = false;
    COMMON_TRACKING.forEach((p) => {
      if (parsed.searchParams.has(p)) {
        parsed.searchParams.delete(p);
        changed = true;
      }
    });

    return changed ? parsed.toString() : url;
  } catch {
    return url;
  }
}

/**
 * Normalizes user URL input:
 * - Trims whitespace
 * - Adds https:// if protocol is missing
 * - Rejects unsupported schemes (javascript:, data:, file:)
 * - Rejects localhost and private/internal IPs
 * - Cleans mobile app share and tracking parameters
 */
export function validateAndNormalizeUrl(input: string): NormalizedUrlResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: "URL cannot be empty." };
  }

  // Check for dangerous protocol prefixes before URL parsing
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return { valid: false, error: "Unsupported or dangerous URL protocol." };
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Only HTTP and HTTPS links are allowed." };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      return { valid: false, error: "Invalid hostname in URL." };
    }

    if (hostname === "localhost" || isPrivateOrReservedIp(hostname)) {
      return { valid: false, error: "Localhost and private network addresses are blocked." };
    }

    const cleanedUrl = cleanJobBoardUrl(parsed.toString());

    return {
      valid: true,
      normalizedUrl: cleanedUrl
    };
  } catch {
    return { valid: false, error: "Please enter a valid web address." };
  }
}

/**
 * Extracts domain components (hostname, root domain, subdomain, sld, tld).
 */
export function extractDomainParts(urlOrHostname: string): DomainParts {
  let hostname = urlOrHostname.trim().toLowerCase();
  if (hostname.includes("://")) {
    try {
      hostname = new URL(hostname).hostname.toLowerCase();
    } catch {
      // Fallback: strip scheme manually
      hostname = hostname.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? "";
    }
  } else if (hostname.includes("/")) {
    hostname = hostname.split("/")[0] ?? "";
  }

  // Strip port if present
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    hostname = hostname.split(":")[0] ?? "";
  }

  // If it's an IP address, rootDomain is the IP itself
  if (isIpAddress(hostname)) {
    return {
      hostname,
      rootDomain: hostname,
      subdomain: "",
      sld: hostname,
      tld: "",
      subdomainPartsCount: 0
    };
  }

  const parts = hostname.split(".");
  if (parts.length <= 1) {
    return {
      hostname,
      rootDomain: hostname,
      subdomain: "",
      sld: hostname,
      tld: "",
      subdomainPartsCount: 0
    };
  }

  // Check for known 2-level TLDs (e.g. co.in, com.au)
  const lastTwo = parts.slice(-2).join(".");
  let rootDomain: string;
  let subdomain: string;
  let sld: string;
  let tld: string;

  if (KNOWN_MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    sld = parts[parts.length - 3] ?? "";
    tld = `.${lastTwo}`;
    rootDomain = `${sld}.${lastTwo}`;
    const subParts = parts.slice(0, parts.length - 3);
    subdomain = subParts.join(".");
  } else {
    sld = parts[parts.length - 2] ?? "";
    const lastPart = parts[parts.length - 1] ?? "";
    tld = `.${lastPart}`;
    rootDomain = `${sld}.${lastPart}`;
    const subParts = parts.slice(0, parts.length - 2);
    subdomain = subParts.join(".");
  }

  const subdomainPartsCount = subdomain ? subdomain.split(".").length : 0;

  return {
    hostname,
    rootDomain,
    subdomain,
    sld,
    tld,
    subdomainPartsCount
  };
}

/**
 * Extracts URLs from raw text (e.g. from a job description or messaging post).
 * Finds explicit URLs and common domain-style links (wa.me, t.me, bit.ly, forms.gle, etc.).
 * Validates each with validateAndNormalizeUrl, deduplicates, and limits to maxCount.
 */
export function extractUrlsFromText(text: string, maxCount = 5): string[] {
  if (!text) return [];

  // Match URLs starting with http(s) or www., or standalone domains from known patterns
  const urlPattern = /(?:https?:\/\/[^\s<>"'`()[\]]+|www\.[^\s<>"'`()[\]]+|(?:wa\.me|t\.me|bit\.ly|tinyurl\.com|forms\.gle)\/[^\s<>"'`()[\]]+)/gi;
  const matches = text.match(urlPattern) || [];

  const unique = new Set<string>();
  const results: string[] = [];

  const STATIC_ASSET_REGEX = /\.(?:svg|png|jpe?g|gif|webp|ico|css|js|mjs|woff2?|ttf|eot|otf|mp4|webm|avi|mp3|wav|pdf|zip|tar|gz)(?:[?#].*)?$/i;

  for (const raw of matches) {
    // Strip trailing punctuation often caught by regex in natural language sentences
    const cleaned = raw.replace(/[.,;!?]+$/, "");
    if (STATIC_ASSET_REGEX.test(cleaned)) {
      continue;
    }
    const normalized = validateAndNormalizeUrl(cleaned);
    if (normalized.valid && normalized.normalizedUrl) {
      if (STATIC_ASSET_REGEX.test(normalized.normalizedUrl)) {
        continue;
      }
      if (!unique.has(normalized.normalizedUrl)) {
        unique.add(normalized.normalizedUrl);
        results.push(normalized.normalizedUrl);
        if (results.length >= maxCount) {
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Checks if a given URL or hostname is a known trusted job platform.
 */
export function isTrustedPlatformUrl(urlOrHostname: string): boolean {
  if (!urlOrHostname) return false;
  try {
    const parts = extractDomainParts(urlOrHostname);
    return TRUSTED_JOB_PLATFORMS.some(
      (platform) =>
        parts.sld === platform ||
        parts.hostname === `${platform}.com` ||
        parts.hostname.endsWith(`.${platform}.com`)
    );
  } catch {
    return false;
  }
}

