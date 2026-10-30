import { assertSafeUrl } from "./ssrf";
import { extractDomainParts, isTrustedPlatformUrl } from "../../src/utils/url";
import { PageData } from "../../src/types/types";

export interface ExtractionResult {
  fetched: boolean;
  data: PageData;
  error?: string;
}

const USER_AGENTS = [
  // Primary: standard desktop Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 JobCheck/1.0",
  // Secondary / fallback: social crawler UA (frequently allowed by login-walled & SPA pages for link previews)
  "Twitterbot/1.0 (JobCheck Preview Bot)",
  // Tertiary fallback: googlebot preview
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
];

/**
 * Extracts visible body text, meta tags, and page title from HTML string.
 * Tries multiple extraction points:
 * 1. <title>
 * 2. Meta description (name="description", property="og:description", twitter:description)
 * 3. JSON-LD structured job posting data (<script type="application/ld+json">)
 * 4. Main HTML text
 */
export function extractHtmlContent(html: string): { title: string; text: string } {
  if (!html) {
    return { title: "", text: "" };
  }

  // 1. Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch?.[1] ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

  // 2. Extract meta descriptions (og:title, og:description, meta description)
  const metaSnippets: string[] = [];

  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitleMatch?.[1] && !title) {
    title = ogTitleMatch[1].trim();
  }

  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (metaDescMatch?.[1]) {
    metaSnippets.push(metaDescMatch[1].trim());
  }

  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogDescMatch?.[1]) {
    metaSnippets.push(ogDescMatch[1].trim());
  }

  const twDescMatch = html.match(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+property=["']twitter:description["'][^>]+content=["']([^"']+)["']/i);
  if (twDescMatch?.[1]) {
    metaSnippets.push(twDescMatch[1].trim());
  }

  // 3. Extract JSON-LD job posting description if present
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      const jsonContent = match[1]?.trim();
      if (!jsonContent) continue;
      const parsed = JSON.parse(jsonContent) as Record<string, unknown>;
      if (parsed["description"] && typeof parsed["description"] === "string") {
        metaSnippets.push(parsed["description"].trim());
      }
      if (parsed["title"] && typeof parsed["title"] === "string" && !title) {
        title = parsed["title"].trim();
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  // 4. Strip scripts, styles, svg, noscript, comments
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // 5. Strip all HTML tags
  clean = clean.replace(/<[^>]+>/g, " ");

  // 6. Decode common HTML entities
  clean = clean
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 7. Normalize whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  // Combine meta snippets with body text if meta has extra information
  const metaCombined = metaSnippets.join(" ");
  let combinedText = clean;
  if (metaCombined && !clean.includes(metaCombined.slice(0, 30))) {
    combinedText = `${metaCombined} ${clean}`.trim();
  }

  // Cap at 25,000 characters
  const text = combinedText.slice(0, 25000);

  return { title, text };
}

/**
 * Best-effort RDAP lookup for domain registration date.
 */
/**
 * RDAP endpoints to try for a domain, most-likely-first.
 *
 * `rdap.org` is a redirector and is the only endpoint we used originally. When
 * it is slow or down we got `null`, which silently costs the +35/+25/+10 domain
 * age rule and the "-15 long-established domain" trust signal, and pushes the
 * confidence score down. The registry-specific endpoints below are tried only
 * for the TLD they actually serve, so this stays cheap in the common case.
 */
function rdapUrlsFor(rootDomain: string): string[] {
  const dot = rootDomain.lastIndexOf(".");
  const tld = dot === -1 ? "" : rootDomain.slice(dot + 1).toLowerCase();
  const encoded = encodeURIComponent(rootDomain);

  const urls = [`https://rdap.org/domain/${encoded}`];

  if (tld === "com" || tld === "net") {
    urls.push(`https://rdap.verisign.com/${tld}/v1/domain/${encoded}`);
  } else if (tld === "org") {
    urls.push(`https://rdap.publicinterestregistry.org/rdap/domain/${encoded}`);
  } else if (tld === "in") {
    urls.push(`https://rdap.registry.in/rdap/domain/${encoded}`);
  } else if (
    ["io", "xyz", "shop", "online", "site", "live", "click", "work", "icu"].includes(tld)
  ) {
    urls.push(`https://rdap.identitydigital.services/rdap/domain/${encoded}`);
  }

  return urls;
}

async function tryRdapEndpoint(
  endpoint: string,
  timeoutMs: number,
): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobCheck/1.0; +https://jobcheck.app)",
      },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
    };

    if (!data.events || !Array.isArray(data.events)) return null;

    const registrationEvent = data.events.find(
      (e) =>
        e.eventAction === "registration" ||
        e.eventAction === "registered" ||
        e.eventAction === "created",
    );

    if (!registrationEvent?.eventDate) return null;

    const regTime = new Date(registrationEvent.eventDate).getTime();
    if (isNaN(regTime)) return null;

    const diffDays = Math.floor((Date.now() - regTime) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  } catch {
    // Best effort - never fail the inspection
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDomainAgeDays(rootDomain: string): Promise<number | null> {
  if (!rootDomain || rootDomain.includes("localhost")) return null;

  // Total budget across all endpoints, so a slow registry cannot stall the scan.
  const deadline = Date.now() + 6000;

  for (const endpoint of rdapUrlsFor(rootDomain)) {
    const remaining = deadline - Date.now();
    if (remaining <= 300) break;

    const age = await tryRdapEndpoint(endpoint, Math.min(3000, remaining));
    if (age !== null) return age;
  }

  return null;
}

/**
 * Optional Google Safe Browsing API check.
 */
export async function checkSafeBrowsing(url: string): Promise<boolean | null> {
  const apiKey = process.env.SAFE_BROWSING_KEY;
  if (!apiKey) return null;

  try {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const payload = {
      client: { clientId: "jobcheck", clientVersion: "1.0.0" },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION",
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = (await res.json()) as { matches?: unknown[] };
    return Boolean(data.matches && data.matches.length > 0);
  } catch {
    return null;
  }
}

/**
 * Fetches page content following redirects (max 5 hops) with SSRF checks on every hop.
 * Tries fallback User-Agents if blocked by 403 or challenge.
 */
async function fetchWithRedirectsAndFallback(
  targetUrl: string,
  timeoutMs = 7000
): Promise<{ response: Response | null; finalUrl: string; redirectChain: string[] }> {
  const maxRedirects = 5;

  for (let attempt = 0; attempt < USER_AGENTS.length; attempt++) {
    const userAgent = USER_AGENTS[attempt]!;
    let currentUrl = targetUrl;
    const redirectChain: string[] = [];
    let finalResponse: Response | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      for (let hop = 0; hop <= maxRedirects; hop++) {
        await assertSafeUrl(currentUrl);

        const res = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": userAgent,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
          },
        });

        if ([301, 302, 303, 307, 308].includes(res.status)) {
          const location = res.headers.get("location");
          if (!location) {
            finalResponse = res;
            break;
          }
          const nextUrl = new URL(location, currentUrl).toString();
          redirectChain.push(nextUrl);
          currentUrl = nextUrl;

          if (hop === maxRedirects) {
            clearTimeout(timeout);
            return { response: null, finalUrl: currentUrl, redirectChain };
          }
          continue;
        }

        finalResponse = res;
        break;
      }

      clearTimeout(timeout);

      // If we got a successful 2xx response, return immediately
      if (finalResponse && finalResponse.status >= 200 && finalResponse.status < 400) {
        return { response: finalResponse, finalUrl: currentUrl, redirectChain };
      }

      // If response is 403 / 401 / 429 and we have fallback user agents, try next attempt
      if (attempt < USER_AGENTS.length - 1 && finalResponse && [401, 403, 429].includes(finalResponse.status)) {
        continue;
      }

      return { response: finalResponse, finalUrl: currentUrl, redirectChain };
    } catch {
      clearTimeout(timeout);
      if (attempt === USER_AGENTS.length - 1) {
        return { response: null, finalUrl: currentUrl, redirectChain };
      }
    }
  }

  return { response: null, finalUrl: targetUrl, redirectChain: [] };
}

/**
 * Determines whether text returned by a proxy/cache is actually a bot protection / CAPTCHA block page.
 */
function isBotOrCaptchaBlock(text: string): boolean {
  if (!text || text.trim().length < 30) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes("trouble accessing google search") ||
    lower.includes("unusual traffic from your computer network") ||
    lower.includes("our systems have detected unusual traffic") ||
    lower.includes("attention required! | cloudflare") ||
    lower.includes("checking your browser before accessing") ||
    lower.includes("please enable cookies") ||
    lower.includes("just a moment...") ||
    lower.includes("bot-detection-anonymous") ||
    lower.includes("abusealleviationerror") ||
    lower.includes("cf$cv$params") ||
    (lower.includes("access denied") && text.length < 350) ||
    (lower.includes("403 forbidden") && text.length < 350) ||
    lower.includes("target url returned error 404") ||
    lower.includes("target url returned error 403") ||
    lower.includes("cf-browser-verification")
  );
}

/**
 * Fetch a URL through the Jina Reader proxy (r.jina.ai).
 * Returns clean Markdown/plain text. Works for Cloudflare-blocked sites.
 * No API key required. Rate-limited but generous.
 */
async function fetchViaJina(targetUrl: string, timeoutMs = 6000): Promise<string | null> {
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        "X-No-Cache": "true",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    if (isBotOrCaptchaBlock(text)) return null;
    return text.slice(0, 25000) || null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Fetch a URL via Google's web cache.
 * Works when the live site is blocked but Google has a cached copy.
 */
async function fetchViaGoogleCache(targetUrl: string, timeoutMs = 4000): Promise<string | null> {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(targetUrl)}&hl=en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cacheUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Referer": "https://www.google.com/",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const { text } = extractHtmlContent(html);
    if (isBotOrCaptchaBlock(text)) return null;
    return text || null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Fetch search index snippets for the domain / job posting.
 * Uses DuckDuckGo HTML search for 'site:domain careers' or URL keywords.
 */
async function fetchViaSearchSnippet(targetUrl: string, rootDomain: string, timeoutMs = 6000): Promise<string | null> {
  let queryText = `site:${rootDomain} careers job vacancy`;
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("indeed.")) {
      const jk = parsed.searchParams.get("jk") || parsed.searchParams.get("vjk");
      if (jk) queryText = `site:indeed.com ${jk}`;
    } else if (host.includes("naukri.com")) {
      const m = parsed.pathname.match(/\/job-listings-([^?#]+)/i);
      if (m?.[1]) queryText = `site:naukri.com ${m[1].replace(/-/g, " ").slice(0, 80)}`;
    } else if (host.includes("linkedin.com")) {
      const m = parsed.pathname.match(/\/jobs\/view\/([0-9]+)/i);
      if (m?.[1]) queryText = `site:linkedin.com/jobs/view ${m[1]}`;
    }
  } catch {
    // Fallback to domain careers query
  }

  const query = encodeURIComponent(queryText);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${query}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const snippetMatches = html.matchAll(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi);
    const snippets: string[] = [];
    for (const m of snippetMatches) {
      if (m[1]) {
        snippets.push(m[1].replace(/<[^>]+>/g, " ").trim());
      }
    }
    const combined = snippets.join(" ").replace(/\s+/g, " ").trim();
    if (isBotOrCaptchaBlock(combined)) return null;
    return combined.length > 50 ? combined.slice(0, 10000) : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Fetch site summary from DuckDuckGo Instant Answer API.
 * Returns a brief abstract about the domain — useful for scoring even when page is blocked.
 */
async function fetchViaDuckDuckGo(domain: string, timeoutMs = 5000): Promise<string | null> {
  const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(domain)}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ddgUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobCheck/1.0)",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as {
      Abstract?: string;
      AbstractText?: string;
      Answer?: string;
      Definition?: string;
      RelatedTopics?: Array<{ Text?: string }>;
    };

    const parts: string[] = [];
    if (data.AbstractText) parts.push(data.AbstractText);
    if (data.Abstract && data.Abstract !== data.AbstractText) parts.push(data.Abstract);
    if (data.Answer) parts.push(data.Answer);
    if (data.Definition) parts.push(data.Definition);
    if (data.RelatedTopics) {
      const topics = data.RelatedTopics
        .slice(0, 5)
        .map((t) => t.Text ?? "")
        .filter(Boolean);
      parts.push(...topics);
    }

    const combined = parts.join(" ").trim();
    if (isBotOrCaptchaBlock(combined)) return null;
    return combined || null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Generic inspection function for any URL:
 * 1. Checks SSRF on initial URL
 * 2. Fetches domain age (RDAP) & Safe Browsing concurrently
 * 3. Fetches content with redirect following & fallback UAs (direct fetch)
 * 4. Falls back to: Jina Reader → Google Cache → Search Snippets → DuckDuckGo Instant Answer
 * 5. Extracts title, text, meta tags
 */
export async function inspectSingleUrl(targetUrl: string): Promise<ExtractionResult> {
  const domainParts = extractDomainParts(targetUrl);
  const rootDomain = domainParts.rootDomain;

  // Run RDAP and Safe Browsing lookups concurrently
  const [domainAgeDays, safeBrowsingFlagged] = await Promise.all([
    fetchDomainAgeDays(rootDomain),
    checkSafeBrowsing(targetUrl),
  ]);

  // SSRF check on initial URL
  try {
    await assertSafeUrl(targetUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Blocked by security policies.";
    return {
      fetched: false,
      error: message,
      data: {
        status: 400,
        finalUrl: targetUrl,
        redirectChain: [],
        title: "",
        text: "",
        domainAgeDays,
        safeBrowsingFlagged,
      },
    };
  }

  let directFetchStatus = 0;
  let finalUrl = targetUrl;
  let redirectChain: string[] = [];

  // ── Strategy 1–3: Direct fetch with multiple User-Agents ──────────────────
  try {
    const result = await fetchWithRedirectsAndFallback(targetUrl);
    finalUrl = result.finalUrl;
    redirectChain = result.redirectChain;

    if (result.response) {
      directFetchStatus = result.response.status;
      const isSuccess = result.response.status >= 200 && result.response.status < 400;

      if (isSuccess) {
        // Read max 500 KB from body
        const maxBytes = 500 * 1024;
        let htmlContent = "";

        if (result.response.body) {
          const reader = result.response.body.getReader();
          const decoder = new TextDecoder();
          let totalBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done || !value) break;

            totalBytes += value.byteLength;
            htmlContent += decoder.decode(value, { stream: true });

            if (totalBytes >= maxBytes) {
              await reader.cancel();
              break;
            }
          }
        } else {
          const text = await result.response.text();
          htmlContent = text.slice(0, maxBytes);
        }

        const { title, text: visibleText } = extractHtmlContent(htmlContent);

        if (!isBotOrCaptchaBlock(visibleText)) {
          return {
            fetched: true,
            data: {
              status: result.response.status,
              finalUrl,
              redirectChain,
              title,
              text: visibleText,
              domainAgeDays,
              safeBrowsingFlagged,
            },
          };
        }
      }
    }
  } catch {
    // Fall through to proxy strategies
  }

  // ── Strategy 4: Jina Reader proxy (renders SPAs & bypasses Cloudflare) ────
  const jinaText = await fetchViaJina(targetUrl);
  if (jinaText && jinaText.trim().length > 100) {
    return {
      fetched: true,
      data: {
        status: 200,
        finalUrl,
        redirectChain,
        title: "",
        text: jinaText,
        domainAgeDays,
        safeBrowsingFlagged,
        fetchSource: "jina",
      },
    };
  }

  // ── Strategy 5: Google Cache ───────────────────────────────────────────────
  const cacheText = await fetchViaGoogleCache(targetUrl);
  if (cacheText && cacheText.trim().length > 100) {
    return {
      fetched: true,
      data: {
        status: 200,
        finalUrl,
        redirectChain,
        title: "",
        text: cacheText,
        domainAgeDays,
        safeBrowsingFlagged,
        fetchSource: "google-cache",
      },
    };
  }

  const isPlatform = isTrustedPlatformUrl(targetUrl);

  // ── Strategy 6: Search Snippet Fallback (Google / DuckDuckGo search) ──────
  // For trusted job platforms (Indeed, Naukri, etc.), search snippets return generic platform
  // marketing text rather than the specific job listing. Only use for employer career sites.
  if (!isPlatform) {
    const snippetText = await fetchViaSearchSnippet(targetUrl, rootDomain);
    if (snippetText && snippetText.trim().length > 50) {
      return {
        fetched: true,
        data: {
          status: 200,
          finalUrl,
          redirectChain,
          title: "",
          text: snippetText,
          domainAgeDays,
          safeBrowsingFlagged,
          fetchSource: "search-index",
        },
      };
    }

    // ── Strategy 7: DuckDuckGo Instant Answer (domain summary) ────────────────
    const ddgText = await fetchViaDuckDuckGo(rootDomain);
    if (ddgText && ddgText.trim().length > 20) {
      return {
        fetched: true,
        data: {
          status: 200,
          finalUrl,
          redirectChain,
          title: "",
          text: ddgText,
          domainAgeDays,
          safeBrowsingFlagged,
          fetchSource: "duckduckgo",
        },
      };
    }
  }

  // ── All strategies failed ─────────────────────────────────────────────────
  const platformError =
    "Major job portals (Indeed, Naukri, LinkedIn) protect listings with Cloudflare/Akamai bot challenges and login requirements. Automated web crawlers cannot load this content directly.";
  const genericError =
    directFetchStatus >= 400
      ? `Server blocked access (HTTP ${directFetchStatus}). Tried reader proxy and cache — no content retrieved.`
      : "Unable to reach remote server. All extraction strategies failed.";

  return {
    fetched: false,
    error: isPlatform ? platformError : genericError,
    data: {
      status: directFetchStatus,
      finalUrl,
      redirectChain,
      title: "",
      text: "",
      domainAgeDays,
      safeBrowsingFlagged,
    },
  };
}
