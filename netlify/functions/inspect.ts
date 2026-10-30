import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { getAllowedOrigins, isAllowedOrigin } from "./origin";
import { extractDomainParts, extractUrlsFromText, isTrustedPlatformUrl } from "../../src/utils/url";
import { ExtractedLinkResult } from "../../src/types/types";
import { inspectSingleUrl } from "./extractor";
import { queryGoogleAiSearch } from "./aiSearch";
import {
  validateBodySize,
  RateLimiter,
  SecureLogger,
} from "./securityUtils";
import { smartRateLimiter } from "./userValidation";
import {
  createBlockNotification,
  generateNotifications,
  logBlockNotification,
  getNotificationHeaders
} from "./notificationService";

// Secure logger with PII redaction
const logger = new SecureLogger("inspect");

// Rate limiter (in-memory per instance)
// For production at scale, consider Redis/Upstash for distributed rate limiting
const rateLimiter = new RateLimiter(
  60 * 1000, // 1 minute window
  30 // 30 requests per minute
);

// Request body size limit (50KB)
const MAX_BODY_SIZE = 50000;

export const handler: Handler = async (
  event: HandlerEvent,
): Promise<HandlerResponse> => {

  // 1. Enforce POST only
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST", "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed. Use POST." }),
    };
  }

  // 2. Origin validation - prevent unauthorized cross-origin requests
  const originHeader = event.headers["origin"] || event.headers["Origin"];
  if (!isAllowedOrigin(originHeader, getAllowedOrigins())) {
    logger.warn(`Rejected request from unauthorized origin: ${originHeader || "none"}`);
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Origin not allowed." }),
    };
  }

  // 3. Request body size validation - prevent DoS
  const bodySizeCheck = validateBodySize(event.body, MAX_BODY_SIZE);
  if (!bodySizeCheck.valid) {
    logger.warn(`Request body too large from origin: ${originHeader}`);
    return {
      statusCode: 413,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: bodySizeCheck.error }),
    };
  }

  // 4. Per-IP Rate Limiting
  const clientIp =
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "127.0.0.1";

  if (!rateLimiter.check(clientIp)) {
    const remaining = rateLimiter.remaining(clientIp);
    logger.warn(`Rate limit exceeded for IP: ${clientIp.slice(0, 10)}...`);
    return {
      statusCode: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60",
        "X-RateLimit-Remaining": String(remaining),
      },
      body: JSON.stringify({
        error: "Too many requests. Please wait a moment and try again.",
      }),
    };
  }

  // 5. Parse and validate input
  let targetUrl: string;
  let descriptionText: string = "";
  let isSecondAttempt: boolean = false;

  try {
    const body = JSON.parse(event.body || "{}") as {
      url?: string;
      description?: string;
      isSecondAttempt?: boolean;
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
    if (typeof body.description === "string") {
      descriptionText = body.description.trim();
    }
    if (typeof body.isSecondAttempt === "boolean") {
      isSecondAttempt = body.isSecondAttempt;
    }
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON in request body." }),
    };
  }

  // 5a. SMART USER VALIDATION - Distinguish legitimate users from bots
  // Valid users: Provide a URL (with or without description)
  // Invalid/Bots: No URL, malformed URL, or suspicious patterns
  const validation = smartRateLimiter.validateRequest(
    clientIp,
    targetUrl,
    descriptionText
  );

  if (!validation.isValid) {
    const statusCode = validation.severity === "blocked" ? 429 : 400;

    // Create notification for blocked/warned user
    const blockNotification = createBlockNotification(
      clientIp,
      validation.reason || "Unknown reason",
      validation.severity as "warning" | "blocked",
      validation.requestsRemaining !== undefined ? 0 : undefined,
      validation.severity === "blocked" ? 5 : undefined,
      validation.blockedUntil
    );

    // Generate notifications across channels
    const notifications = generateNotifications(blockNotification);

    // Log for audit trail
    logBlockNotification(blockNotification);

    // Log which channels notified the user
    notifications.forEach((notif) => {
      logger.info(
        `User blocked notification sent via ${notif.channel} to ${notif.recipientIdentifier}`
      );
    });

    logger.warn(
      `User validation failed for ${clientIp}: ${validation.reason} (severity: ${validation.severity})`
    );

    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        ...getNotificationHeaders(blockNotification),
        ...(validation.blockedUntil && {
          "Retry-After": String(Math.ceil((validation.blockedUntil - Date.now()) / 1000)),
        }),
      },
      body: JSON.stringify({
        error: blockNotification.reason,
        title: "🚫 Request Blocked",
        message: blockNotification.reason,
        details: blockNotification.suggestedAction,
        severity: blockNotification.severity,
        requestsRemaining: validation.requestsRemaining,
        blockedUntil: blockNotification.blockedUntil,
        timestamp: blockNotification.timestamp,
      }),
    };
  }

  // Valid user - log their usage
  logger.info(
    `Valid user from ${clientIp}. Requests remaining today: ${validation.requestsRemaining}`
  );

  // 5b. Two-stage logic: Extract via Jina on second attempt if no description
  if (descriptionText.length === 0 && isSecondAttempt) {
    try {
      const extractionResult = await inspectSingleUrl(targetUrl);
      if (extractionResult.fetched && extractionResult.data?.text) {
        descriptionText = extractionResult.data.text.slice(0, 5000); // Use extracted text, cap at 5000 chars
        logger.info(`Extracted ${descriptionText.length} chars via Jina for second-stage analysis`);
      }
    } catch (err: unknown) {
      logger.warn(`Extraction via Jina failed: ${err instanceof Error ? err.message : "unknown error"}`);
      // Graceful fallback: continue with empty description
    }
  }

  const targetDomainParts = extractDomainParts(targetUrl);
  const isTrustedPlatform = isTrustedPlatformUrl(targetUrl);


  // 4. Extract any external links contained in the description text
  // Filter out the target URL and any internal navigation links sharing the same rootDomain
  const linksInDescription = extractUrlsFromText(descriptionText, 5).filter(
    (link) => {
      if (link === targetUrl) return false;
      const linkParts = extractDomainParts(link);
      return Boolean(linkParts.rootDomain && linkParts.rootDomain !== targetDomainParts.rootDomain);
    }
  );

  // 5. Inspect main URL, external links in description, and Google AI search concurrently
  const mainInspectPromise = inspectSingleUrl(targetUrl);
  const aiSearchPromise = queryGoogleAiSearch(targetUrl, descriptionText, linksInDescription);


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

  // Fallback: If direct fetch failed (or returned bot-block / empty text) and Gemini AI Search Grounding extracted the job details
  if (
    (!mainResult.fetched || !mainResult.data?.text || mainResult.data.text.length < 50) &&
    aiIntelResult?.status === "completed" &&
    aiIntelResult.extractedJobDetails?.jobDescriptionText
  ) {
    const jobDetails = aiIntelResult.extractedJobDetails;
    const title = jobDetails.jobTitle
      ? `${jobDetails.jobTitle} - ${jobDetails.companyName || targetDomainParts.rootDomain}`
      : (mainResult.data?.title || targetUrl);

    mainResult.fetched = true;
    mainResult.data = {
      status: 200,
      finalUrl: targetUrl,
      redirectChain: mainResult.data?.redirectChain || [],
      title,
      text: jobDetails.jobDescriptionText || "",
      domainAgeDays: mainResult.data?.domainAgeDays ?? null,
      safeBrowsingFlagged: mainResult.data?.safeBrowsingFlagged ?? null,
      fetchSource: "ai-grounding",
    };
    mainResult.error = undefined;
    logger.info(`Synthesized job posting text via Gemini Search Grounding for: ${targetUrl}`);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fetched: mainResult.fetched,
      data: mainResult.data,
      error: mainResult.error,
      extractedLinks: extractedResults,
      isTrustedPlatform,
      aiIntel: aiIntelResult,
    }),
  };
};

