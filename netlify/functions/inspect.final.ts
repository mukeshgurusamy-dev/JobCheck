/**
 * ENHANCED API ENDPOINT WITH REQUEST/RESPONSE SECURITY
 *
 * This version adds:
 * - Request signing verification (HMAC)
 * - Replay attack prevention (nonce + timestamp)
 * - Response signing
 * - Request encryption support (optional)
 * - Response integrity verification
 * - API monitoring metrics
 */

import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { getAllowedOrigins, isAllowedOrigin } from "./origin";
import { extractDomainParts, extractUrlsFromText, isTrustedPlatformUrl } from "../../src/utils/url";
import { ExtractedLinkResult } from "../../src/types/types";
import { inspectSingleUrl } from "./extractor";
import { queryGoogleAiSearch } from "./aiSearch";
import {
  validateJobUrl,
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
import {
  verifyRequest,
  NonceCache,
  signResponse,
  validateApiRequest,
  validateApiResponse,
  computeResponseChecksum,
  ApiMonitor,
  SignedRequest,
} from "./apiSecurity";

// Initialize security components
const logger = new SecureLogger("inspect-secure");
const securityMonitor = new SecurityMonitor();
const apiMonitor = new ApiMonitor();

// Nonce cache for replay attack prevention (5 minute window)
const nonceCache = new NonceCache(300);

// Advanced rate limiter
const rateLimiter = new AdvancedRateLimiter([
  { windowMs: 1000, maxRequests: 5, blockDurationMs: 60000 },
  { windowMs: 60000, maxRequests: 30, blockDurationMs: 300000 },
  { windowMs: 3600000, maxRequests: 500, blockDurationMs: 3600000 },
]);

// Cleanup tasks
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

// Constants
const MAX_BODY_SIZE = 50000;
const MAX_URL_LENGTH = 2048;
const MAX_DESCRIPTION_LENGTH = 10000;

// HMAC secret for request signing (in production, use environment variable)
const HMAC_SECRET = process.env.API_HMAC_SECRET || "default-dev-secret-change-in-production";

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
  const isSignedRequest = event.headers["x-request-signed"] === "true";

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

      if (botDetection.botType === "Automated Script" || botDetection.botType === "Headless Browser") {
        apiMonitor.recordRequest(false, Date.now() - requestStartTime);
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Automated access not allowed" }),
        };
      }
    }

    // ========================================================================
    // LAYER 3: ORIGIN VALIDATION
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

      logger.warn(`Rejected request from unauthorized origin`);
      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
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

      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
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

      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
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
    // LAYER 6: REQUEST PARSING & SIGNATURE VERIFICATION
    // ========================================================================
    let requestData: Record<string, unknown>;

    try {
      const bodyParsed = JSON.parse(event.body || "{}");

      // If request is signed, verify signature
      if (isSignedRequest) {
        const signedRequest = bodyParsed as SignedRequest;

        const seenNonces = new Set<string>();
        // Check nonce cache
        if (nonceCache.has(signedRequest.nonce)) {
          seenNonces.add(signedRequest.nonce);
        }

        const verification = verifyRequest(
          signedRequest,
          {
            secretKey: HMAC_SECRET,
            algorithm: "sha256",
            maxAgeSeconds: 300, // 5 minutes
          },
          seenNonces
        );

        if (!verification.valid) {
          securityMonitor.logEvent({
            eventType: "ATTACK_DETECTED",
            severity: "HIGH",
            ipAddress: clientIp,
            userAgent,
            endpoint: "/.netlify/functions/inspect",
            details: {
              reason: "Request signature verification failed",
              error: verification.reason,
            },
          });

          logger.warn(`Signature verification failed: ${verification.reason}`);
          apiMonitor.recordRequest(false, Date.now() - requestStartTime);

          return {
            statusCode: 401,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: isDev
                ? `Signature verification failed: ${verification.reason}`
                : "Invalid request signature",
            }),
          };
        }

        // Add nonce to cache
        nonceCache.add(signedRequest.nonce);
        requestData = verification.data!;
      } else {
        // Unsigned request (standard flow for now)
        requestData = bodyParsed as Record<string, unknown>;
      }

    } catch (parseErr: unknown) {
      securityMonitor.logEvent({
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "LOW",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: {
          reason: "Invalid JSON",
          error: parseErr instanceof Error ? parseErr.message : "Unknown",
        },
      });

      logger.error("JSON parse error", parseErr);
      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: sanitizeErrorMessage(parseErr, isDev),
        }),
      };
    }

    // ========================================================================
    // LAYER 7: REQUEST STRUCTURE VALIDATION
    // ========================================================================
    const requestValidation = validateApiRequest(requestData);
    if (!requestValidation.valid) {
      securityMonitor.logEvent({
        eventType: "SUSPICIOUS_ACTIVITY",
        severity: "LOW",
        ipAddress: clientIp,
        userAgent,
        endpoint: "/.netlify/functions/inspect",
        details: {
          reason: "Invalid request structure",
          errors: requestValidation.errors,
        },
      });

      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Invalid request structure",
          details: isDev ? requestValidation.errors : undefined,
        }),
      };
    }

    // Extract validated fields
    const targetUrl = (requestData.url as string).trim();
    const descriptionText = requestData.description
      ? (requestData.description as string).trim()
      : "";

    // ========================================================================
    // LAYERS 8-13: SECURITY VALIDATION (same as before)
    // ========================================================================
    // URL length check
    if (targetUrl.length > MAX_URL_LENGTH) {
      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`,
        }),
      };
    }

    // Comprehensive security scan - URL
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

      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
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

    // URL protocol validation
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

      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: isDev ? urlValidation.error : "Invalid URL provided",
        }),
      };
    }

    // Description validation
    let validatedDescription = descriptionText;
    if (validatedDescription.length > MAX_DESCRIPTION_LENGTH) {
      validatedDescription = validatedDescription.slice(0, MAX_DESCRIPTION_LENGTH);
    }

    const descScan = comprehensiveSanitize(validatedDescription);
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

      apiMonitor.recordRequest(false, Date.now() - requestStartTime);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: isDev
            ? `Security threat in description: ${descScan.blockReason}`
            : "Invalid description provided",
        }),
      };
    }

    // Use sanitized inputs
    const sanitizedUrl = urlScan.sanitizedInput;
    const sanitizedDescription = descScan.sanitizedInput;

    // ========================================================================
    // LAYER 14: PROCESS REQUEST
    // ========================================================================
    const targetDomainParts = extractDomainParts(sanitizedUrl);
    const isTrustedPlatform = isTrustedPlatformUrl(sanitizedUrl);

    const linksInDescription = extractUrlsFromText(sanitizedDescription, 5).filter(
      (link) => {
        if (link === sanitizedUrl) return false;
        const linkParts = extractDomainParts(link);
        return Boolean(
          linkParts.rootDomain && linkParts.rootDomain !== targetDomainParts.rootDomain
        );
      }
    );

    const mainInspectPromise = inspectSingleUrl(sanitizedUrl);
    const aiSearchPromise = queryGoogleAiSearch(
      sanitizedUrl,
      sanitizedDescription,
      linksInDescription
    );

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
    // LAYER 15: BUILD & SIGN RESPONSE
    // ========================================================================
    const processingTime = Date.now() - requestStartTime;

    const responseData = {
      fetched: mainResult.fetched,
      data: mainResult.data,
      error: mainResult.error,
      extractedLinks: extractedResults,
      isTrustedPlatform,
      aiIntel: aiIntelResult,
    };

    // Validate response structure
    const responseValidation = validateApiResponse(responseData);
    if (!responseValidation.valid) {
      logger.error("Invalid response structure", responseValidation.errors);
    }

    // Compute response checksum for integrity
    const responseChecksum = computeResponseChecksum(responseData);

    // Sign response if requested
    let finalResponseBody: string;
    let additionalHeaders: Record<string, string> = {};

    if (isSignedRequest) {
      const signedResponse = signResponse(responseData, HMAC_SECRET, "sha256");
      finalResponseBody = JSON.stringify(signedResponse);
      additionalHeaders["X-Response-Signed"] = "true";
    } else {
      finalResponseBody = JSON.stringify(responseData);
    }

    // Add response integrity header
    additionalHeaders["X-Response-Checksum"] = responseChecksum;
    additionalHeaders["X-Processing-Time"] = String(processingTime);
    additionalHeaders["X-RateLimit-Remaining"] = String(
      rateLimitCheck.remainingRequests || 0
    );

    // Record successful request
    apiMonitor.recordRequest(true, processingTime);

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
        signedRequest: isSignedRequest,
      },
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        ...additionalHeaders,
      },
      body: finalResponseBody,
    };

  } catch (err: unknown) {
    // ========================================================================
    // LAYER 16: GLOBAL ERROR HANDLER
    // ========================================================================
    const processingTime = Date.now() - requestStartTime;

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
    apiMonitor.recordRequest(false, processingTime);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: sanitizeErrorMessage(err, isDev),
      }),
    };
  }
};

/**
 * Health check endpoint to monitor API metrics
 */
export const healthHandler: Handler = async (): Promise<HandlerResponse> => {
  const metrics = apiMonitor.getMetrics();
  const successRate = apiMonitor.getSuccessRate();

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "healthy",
      metrics: {
        ...metrics,
        successRate: `${successRate.toFixed(2)}%`,
      },
      nonceCacheSize: nonceCache.size(),
      timestamp: new Date().toISOString(),
    }),
  };
};
