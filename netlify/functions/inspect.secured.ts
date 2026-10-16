/**
 * ENHANCED INSPECT ENDPOINT - MILITARY-GRADE SECURITY
 *
 * This is the hardened version of the inspect endpoint with defense-in-depth security.
 * Every request goes through multiple layers of validation and sanitization.
 */

import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { getAllowedOrigins, isAllowedOrigin } from "./origin";
import { extractDomainParts, extractUrlsFromText, isTrustedPlatformUrl } from "../../src/utils/url";
import { ExtractedLinkResult } from "../../src/types/types";
import { inspectSingleUrl } from "./extractor";
import { queryGoogleAiSearch } from "./aiSearch";
import {
  validateJobUrl,
  detectSuspiciousPatterns,
  sanitizeErrorMessage,
  validateBodySize,
  SecureLogger,
} from "./securityUtils";
import {
  comprehensiveSanitize,
  AdvancedRateLimiter,
  SecurityMonitor,
  detectBot,
} from "./advancedSecurity";

// Initialize security components
const logger = new SecureLogger("inspect");
const securityMonitor = new SecurityMonitor();

// Advanced rate limiter with multiple time windows
const rateLimiter = new AdvancedRateLimiter([
  { windowMs: 1000, maxRequests: 5, blockDurationMs: 60000 }, // 5 per second
  { windowMs: 60000, maxRequests: 30, blockDurationMs: 300000 }, // 30 per minute
  { windowMs: 3600000, maxRequests: 500, blockDurationMs: 3600000 }, // 500 per hour
]);

// Cleanup rate limiter every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

// Request body size limit (50KB)
const MAX_BODY_SIZE = 50000;

// Maximum URL length
const MAX_URL_LENGTH = 2048;

// Maximum description length
const MAX_DESCRIPTION_LENGTH = 10000;

export const handler: Handler = async (
  event: HandlerEvent,
): Promise<HandlerResponse> => {
  const requestStartTime = Date.now();
  const isDev = process.env.NODE_ENV === "development";

  // Extract client info
  const clientIp =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "127.0.0.1";

  const userAgent = event.headers["user-agent"] || event.headers["User-Agent"] || "unknown";
  const originHeader = event.headers["origin"] || event.headers["Origin"];

  try {
    // ========================================================================
    // LAYER 1: METHOD VALIDATION
    // ========================================================================
    if (event.httpMethod !== "POST") {
      securityMonitor.logEvent({
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "LOW",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "Invalid HTTP method", method: event.httpMethod },
      });

      return {
        statusCode: 405,
        headers: { Allow: "POST", "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
      };
    }

    // ========================================================================
    // LAYER 2: BOT DETECTION
    // ========================================================================
    const botDetection = detectBot(userAgent);
    if (botDetection.isBot && botDetection.confidence > 0.9) {
      securityMonitor.logEvent({
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "MEDIUM",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "Bot detected", botType: botDetection.botType },
      });

      // Allow search engine bots, block automated scripts
      if (botDetection.botType === "Automated Script" || botDetection.botType === "Headless Browser") {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Automated access not allowed" }),
        };
      }
    }

    // ========================================================================
    // LAYER 3: ORIGIN VALIDATION (CORS)
    // ========================================================================
    if (!isAllowedOrigin(originHeader, getAllowedOrigins())) {
      securityMonitor.logEvent({
        eventType: "ATTACK_DETECTED",
        severity: "MEDIUM",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "Unauthorized origin", origin: originHeader },
      });

      logger.warn(`Rejected request from unauthorized origin: ${originHeader || "none"}`);
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Origin not allowed." }),
      };
    }

    // ========================================================================
    // LAYER 4: REQUEST BODY SIZE VALIDATION
    // ========================================================================
    const bodySizeCheck = validateBodySize(event.body, MAX_BODY_SIZE);
    if (!bodySizeCheck.valid) {
      securityMonitor.logEvent({
        eventType: "ATTACK_DETECTED",
        severity: "MEDIUM",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "Request body too large", size: event.body?.length },
      });

      logger.warn(`Request body too large from IP: ${clientIp}`);
      return {
        statusCode: 413,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: bodySizeCheck.error }),
      };
    }

    // ========================================================================
    // LAYER 5: ADVANCED RATE LIMITING
    // ========================================================================
    const rateLimitCheck = rateLimiter.check(clientIp);
    if (!rateLimitCheck.allowed) {
      securityMonitor.logEvent({
        eventType: "RATE_LIMIT",
        severity: rateLimiter.isSuspicious(clientIp) ? "HIGH" : "MEDIUM",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: {
          reason: rateLimitCheck.reason,
          reputationScore: rateLimiter.getReputationScore(clientIp),
        },
      });

      logger.warn(`Rate limit exceeded for IP: ${clientIp.slice(0, 10)}...`);
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitCheck.retryAfter || 60),
          "X-RateLimit-Remaining": "0",
        },
        body: JSON.stringify({
          error: "Too many requests. Please wait before trying again.",
          retryAfter: rateLimitCheck.retryAfter,
        }),
      };
    }

    // ========================================================================
    // LAYER 6: JSON PARSING WITH ERROR HANDLING
    // ========================================================================
    let targetUrl: string;
    let descriptionText: string = "";

    try {
      const body = JSON.parse(event.body || "{}") as {
        url?: string;
        description?: string;
      };

      if (!body.url || typeof body.url !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Missing or invalid 'url' parameter in request body.",
          }),
        };
      }

      targetUrl = body.url.trim();
      descriptionText = typeof body.description === "string" ? body.description.trim() : "";

    } catch (parseErr: unknown) {
      securityMonitor.logEvent({
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "LOW",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "Invalid JSON", error: parseErr instanceof Error ? parseErr.message : "Unknown" },
      });

      logger.error("JSON parse error", parseErr);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: sanitizeErrorMessage(parseErr, isDev),
        }),
      };
    }

    // ========================================================================
    // LAYER 7: URL LENGTH VALIDATION
    // ========================================================================
    if (targetUrl.length > MAX_URL_LENGTH) {
      securityMonitor.logEvent({
        eventType: "ATTACK_DETECTED",
        severity: "MEDIUM",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "URL too long", length: targetUrl.length },
      });

      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`,
        }),
      };
    }

    // ========================================================================
    // LAYER 8: COMPREHENSIVE SECURITY SCAN - URL
    // ========================================================================
    const urlScan = comprehensiveSanitize(targetUrl);
    if (urlScan.shouldBlock) {
      securityMonitor.logEvent({
        eventType: "ATTACK_DETECTED",
        severity: urlScan.threatLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: {
          reason: "Malicious URL detected",
          threatLevel: urlScan.threatLevel,
          threats: urlScan.threatsDetected,
        },
      });

      logger.warn(`Malicious URL blocked: ${urlScan.blockReason}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: isDev
            ? `Security threat detected: ${urlScan.blockReason}`
            : "Invalid URL provided",
        }),
      };
    }

    // ========================================================================
    // LAYER 9: URL PROTOCOL AND FORMAT VALIDATION
    // ========================================================================
    const urlValidation = validateJobUrl(targetUrl);
    if (!urlValidation.valid) {
      securityMonitor.logEvent({
        eventType: "ATTACK_DETECTED",
        severity: "MEDIUM",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: { reason: "Invalid URL format", error: urlValidation.error },
      });

      logger.warn(`Invalid URL rejected: ${urlValidation.error}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: isDev ? urlValidation.error : "Invalid URL provided",
        }),
      };
    }

    // ========================================================================
    // LAYER 10: DESCRIPTION LENGTH VALIDATION
    // ========================================================================
    if (descriptionText.length > MAX_DESCRIPTION_LENGTH) {
      descriptionText = descriptionText.slice(0, MAX_DESCRIPTION_LENGTH);
      logger.warn(`Description truncated to ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    // ========================================================================
    // LAYER 11: COMPREHENSIVE SECURITY SCAN - DESCRIPTION
    // ========================================================================
    const descScan = comprehensiveSanitize(descriptionText);
    if (descScan.shouldBlock) {
      securityMonitor.logEvent({
        eventType: "ATTACK_DETECTED",
        severity: descScan.threatLevel === "CRITICAL" ? "CRITICAL" : "HIGH",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: {
          reason: "Malicious description detected",
          threatLevel: descScan.threatLevel,
          threats: descScan.threatsDetected,
        },
      });

      logger.warn(`Malicious description blocked: ${descScan.blockReason}`);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: isDev
            ? `Security threat detected in description: ${descScan.blockReason}`
            : "Invalid description provided",
        }),
      };
    }

    // Use sanitized inputs from comprehensive scan
    const sanitizedUrl = urlScan.sanitizedInput;
    const sanitizedDescription = descScan.sanitizedInput;

    // Log suspicious but allowed patterns
    if (!descScan.isClean && descScan.threatLevel !== "NONE") {
      securityMonitor.logEvent({
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "LOW",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: {
          reason: "Suspicious patterns detected but sanitized",
          threatLevel: descScan.threatLevel,
          threats: descScan.threatsDetected,
        },
      });
    }

    // ========================================================================
    // LAYER 12: ADDITIONAL PATTERN DETECTION
    // ========================================================================
    const basicUrlSuspicion = detectSuspiciousPatterns(sanitizedUrl);
    const basicDescSuspicion = detectSuspiciousPatterns(sanitizedDescription);

    if (basicUrlSuspicion.suspicious || basicDescSuspicion.suspicious) {
      logger.warn(
        `Additional suspicious pattern: ${basicUrlSuspicion.reason || basicDescSuspicion.reason}`
      );
    }

    // ========================================================================
    // LAYER 13: PROCESS REQUEST (After all validation passed)
    // ========================================================================
    const targetDomainParts = extractDomainParts(sanitizedUrl);
    const isTrustedPlatform = isTrustedPlatformUrl(sanitizedUrl);

    // Extract external links from description
    const linksInDescription = extractUrlsFromText(sanitizedDescription, 5).filter(
      (link) => {
        if (link === sanitizedUrl) return false;
        const linkParts = extractDomainParts(link);
        return Boolean(linkParts.rootDomain && linkParts.rootDomain !== targetDomainParts.rootDomain);
      }
    );

    // Process main URL, external links, and AI search concurrently
    const mainInspectPromise = inspectSingleUrl(sanitizedUrl);
    const aiSearchPromise = queryGoogleAiSearch(sanitizedUrl, sanitizedDescription, linksInDescription);

    const descriptionLinksPromises = linksInDescription.map(async (linkUrl) => {
      try {
        const res = await inspectSingleUrl(linkUrl);
        return {
          url: linkUrl,
          fetched: res.fetched,
          data: res.data,
          error: res.error,
        } as ExtractedLinkResult;
      } catch (err: unknown) {
        return {
          url: linkUrl,
          fetched: false,
          error: err instanceof Error ? err.message : "Failed to inspect link",
        } as ExtractedLinkResult;
      }
    });

    const [mainResult, aiIntelResult, ...extractedResults] = await Promise.all([
      mainInspectPromise,
      aiSearchPromise,
      ...descriptionLinksPromises,
    ]);

    // ========================================================================
    // LAYER 14: SUCCESS RESPONSE WITH SECURITY HEADERS
    // ========================================================================
    const processingTime = Date.now() - requestStartTime;

    // Log successful request
    securityMonitor.logEvent({
      eventType: "INFO",
      severity: "LOW",
      ipAddress: clientIp,
      userAgent,
      endpoint: "/.netlify/functions/inspect",
      details: {
        processingTimeMs: processingTime,
        isTrustedPlatform,
        externalLinksCount: extractedResults.length,
      },
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-Processing-Time": String(processingTime),
        "X-RateLimit-Remaining": String(rateLimitCheck.remainingRequests || 0),
      },
      body: JSON.stringify({
        fetched: mainResult.fetched,
        data: mainResult.data,
        error: mainResult.error,
        extractedLinks: extractedResults,
        isTrustedPlatform,
        aiIntel: aiIntelResult,
      }),
    };

  } catch (err: unknown) {
    // ========================================================================
    // LAYER 15: GLOBAL ERROR HANDLER
    // ========================================================================
    securityMonitor.logEvent({
      eventType: "SUSPICIOUS_ACTIVITY",
      severity: "MEDIUM",
      ipAddress: clientIp,
      userAgent,
      endpoint: "/.netlify/functions/inspect",
      details: {
        reason: "Unhandled error",
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });

    logger.error("Unexpected error in handler", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: sanitizeErrorMessage(err, isDev),
      }),
    };
  }
};
