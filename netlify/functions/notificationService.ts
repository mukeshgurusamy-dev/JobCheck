/**
 * NOTIFICATION SERVICE
 *
 * Sends notifications to blocked users with clear reasons
 * Supports multiple channels: in-response message, email, SMS (future)
 */

export interface BlockNotification {
  ipAddress: string;
  reason: string;
  severity: "warning" | "blocked";
  attemptCount?: number;
  threshold?: number;
  blockedUntil?: number;
  suggestedAction: string;
  timestamp: number;
}

export interface NotificationResponse {
  sent: boolean;
  channel: string;
  message: string;
  recipientIdentifier: string;
}

/**
 * Format a user-friendly notification message
 */
export function formatBlockNotification(notification: BlockNotification): {
  title: string;
  message: string;
  details: string;
} {
  const now = Date.now();
  const blockedForMinutes = notification.blockedUntil
    ? Math.ceil((notification.blockedUntil - now) / 60000)
    : 0;

  let title = "";
  let message = "";
  let details = "";

  if (notification.severity === "warning") {
    title = "⚠️ Warning: Suspicious Activity Detected";
    message = `We've detected unusual patterns from your location. ${notification.attemptCount}/${notification.threshold} invalid attempts logged.`;
    details = `${notification.reason}\n\nSuggested Action: ${notification.suggestedAction}\n\nYou have ${notification.threshold! - notification.attemptCount!} more attempts before being blocked for 24 hours.`;
  } else {
    title = "🚫 Your IP Has Been Blocked";
    message = `Your IP address has been temporarily blocked due to suspicious activity.`;
    details = `Reason: ${notification.reason}\n\nBlocked For: ${blockedForMinutes} minutes\n\n${notification.suggestedAction}`;
  }

  return { title, message, details };
}

/**
 * Generate notification for different channels
 */
export function generateNotifications(
  notification: BlockNotification
): NotificationResponse[] {
  const formatted = formatBlockNotification(notification);
  const responses: NotificationResponse[] = [];

  // 1. In-response notification (included in HTTP response)
  responses.push({
    sent: true,
    channel: "http-response",
    message: `${formatted.title}\n${formatted.message}\n${formatted.details}`,
    recipientIdentifier: notification.ipAddress,
  });

  // 2. Browser notification (if user agent allows)
  responses.push({
    sent: true,
    channel: "browser-notification",
    message: `${formatted.title}: ${formatted.message}`,
    recipientIdentifier: notification.ipAddress,
  });

  // 3. Console warning (for developers)
  responses.push({
    sent: true,
    channel: "console",
    message: `[SECURITY] ${formatted.title}\nIP: ${notification.ipAddress}\n${formatted.details}`,
    recipientIdentifier: notification.ipAddress,
  });

  return responses;
}

/**
 * Log notification for audit trail
 */
export function logBlockNotification(notification: BlockNotification): void {
  const formatted = formatBlockNotification(notification);
  const logEntry = {
    timestamp: new Date(notification.timestamp).toISOString(),
    ipAddress: notification.ipAddress,
    severity: notification.severity,
    title: formatted.title,
    reason: notification.reason,
    attemptCount: notification.attemptCount,
    threshold: notification.threshold,
    blockedUntil: notification.blockedUntil
      ? new Date(notification.blockedUntil).toISOString()
      : null,
  };

  if (notification.severity === "blocked") {
    console.error(
      `[SECURITY_BLOCKED] ${JSON.stringify(logEntry)}`
    );
  } else {
    console.warn(
      `[SECURITY_WARNING] ${JSON.stringify(logEntry)}`
    );
  }
}

/**
 * Create response headers for notification
 */
export function getNotificationHeaders(
  notification: BlockNotification
): Record<string, string> {
  const formatted = formatBlockNotification(notification);

  return {
    "X-Security-Alert": "true",
    "X-Alert-Severity": notification.severity,
    "X-Alert-Title": formatted.title,
    "X-Alert-Message": formatted.message,
    ...(notification.blockedUntil && {
      "X-Blocked-Until": new Date(notification.blockedUntil).toISOString(),
    }),
  };
}

/**
 * Format detailed explanation for different block reasons
 */
export function getBlockReasonDetails(reason: string): string {
  const reasonMap: Record<string, string> = {
    "No URL provided":
      "Your request must include a valid job URL. Requests without URLs may indicate automated scanning, which is not allowed.",

    "Invalid URL format":
      "The URL you provided is not in a valid format (must start with http:// or https://). Please check and try again.",

    "Suspicious patterns detected":
      "Your request contains patterns commonly used in attacks (SQL injection, XSS, command injection, etc.). For security, we cannot process this request.",

    "Too many invalid attempts":
      "Multiple invalid requests have been detected from your location. This suggests automated scanning or repeated malformed requests.",
  };

  return (
    reasonMap[reason] ||
    "Your request has been blocked for security reasons. Please review the guidelines and try again."
  );
}

/**
 * Main notification handler - combines everything
 */
export function createBlockNotification(
  ipAddress: string,
  blockReason: string,
  severity: "warning" | "blocked",
  attemptCount?: number,
  threshold?: number,
  blockedUntil?: number
): BlockNotification {
  const now = Date.now();
  const detailedReason = getBlockReasonDetails(blockReason);

  let suggestedAction = "";
  if (severity === "warning") {
    suggestedAction =
      "Please ensure your requests include a valid job URL. Avoid automated scanning or repeated invalid requests.";
  } else {
    const blockedForHours = blockedUntil
      ? Math.ceil((blockedUntil - now) / 3600000)
      : 24;
    suggestedAction = `Your IP will be unblocked in ${blockedForHours} hours. If you believe this is a mistake, contact support with your IP address.`;
  }

  return {
    ipAddress,
    reason: detailedReason,
    severity,
    attemptCount,
    threshold,
    blockedUntil,
    suggestedAction,
    timestamp: now,
  };
}
