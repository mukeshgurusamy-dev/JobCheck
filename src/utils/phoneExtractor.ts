/**
 * Phone Number Extraction and Validation Utilities
 * Extracts phone numbers from job descriptions and validates them
 */

export interface ExtractedPhone {
  raw: string; // Original text
  normalized: string; // Formatted number
  countryCode: string;
  isValid: boolean;
}

/**
 * Extract phone numbers from text
 * Supports Indian phone number formats:
 * - +91 9876543210
 * - 91-9876543210
 * - 9876543210
 * - +91-98765-43210
 * - (91) 9876543210
 */
export function extractPhoneNumbers(text: string): ExtractedPhone[] {
  if (!text) return [];

  const phones: ExtractedPhone[] = [];
  const seen = new Set<string>();

  // Pattern 1: International format with + or without
  // +91 9876543210, +91-9876543210, +919876543210
  const intlPattern = /(?:\+|00)?91[-\s]?(\d{10})\b/g;
  let match;

  while ((match = intlPattern.exec(text)) !== null) {
    if (match[1]) {
      const normalized = `+91${match[1]}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        phones.push({
          raw: match[0],
          normalized,
          countryCode: "+91",
          isValid: validateIndianMobile(match[1])
        });
      }
    }
  }

  // Pattern 2: 10-digit Indian mobile without country code
  // Must start with 6, 7, 8, or 9 (valid Indian mobile prefixes)
  const mobilePattern = /(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/g;

  while ((match = mobilePattern.exec(text)) !== null) {
    if (match[1]) {
      const normalized = `+91${match[1]}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        phones.push({
          raw: match[1],
          normalized,
          countryCode: "+91",
          isValid: validateIndianMobile(match[1])
        });
      }
    }
  }

  // Pattern 3: Landline with STD codes (e.g., 080-12345678, 011-12345678)
  const landlinePattern = /0(\d{2,4})[-\s]?(\d{6,8})\b/g;

  while ((match = landlinePattern.exec(text)) !== null) {
    if (match[1] && match[2]) {
      const normalized = `+91${match[1]}${match[2]}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        phones.push({
          raw: match[0],
          normalized,
          countryCode: "+91",
          isValid: true // Landlines have variable length, assume valid if matched
        });
      }
    }
  }

  // Pattern 4: International numbers (non-India)
  // +1, +44, +971 (UAE), +65 (Singapore), etc.
  const otherIntlPattern = /\+(?!91)(\d{1,3})[-\s]?(\d{7,15})\b/g;

  while ((match = otherIntlPattern.exec(text)) !== null) {
    if (match[1] && match[2]) {
      const normalized = `+${match[1]}${match[2]}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        phones.push({
          raw: match[0],
          normalized,
          countryCode: `+${match[1]}`,
          isValid: match[2].length >= 7 && match[2].length <= 15
        });
      }
    }
  }

  return phones;
}

/**
 * Validate Indian mobile number format
 * Must be 10 digits starting with 6, 7, 8, or 9
 */
function validateIndianMobile(number: string): boolean {
  if (number.length !== 10) return false;
  const firstDigit = number.charAt(0);
  return ["6", "7", "8", "9"].includes(firstDigit);
}

/**
 * Check if phone number country code matches expected country
 */
export function phoneMatchesCountry(phone: ExtractedPhone, expectedCountry: string): boolean {
  const countryCodeMap: Record<string, string[]> = {
    "india": ["+91"],
    "usa": ["+1"],
    "uk": ["+44"],
    "uae": ["+971"],
    "singapore": ["+65"],
    "canada": ["+1"],
    "australia": ["+61"]
  };

  const expected = expectedCountry.toLowerCase();
  const expectedCodes = countryCodeMap[expected] || [];

  return expectedCodes.includes(phone.countryCode);
}

/**
 * Extract country/location from text to validate phone numbers
 * Returns lowercase country name or null
 */
export function extractLocationForPhoneValidation(text: string): string | null {
  const lowerText = text.toLowerCase();

  // Check for India
  if (lowerText.includes("india") || lowerText.includes("bharat") ||
      /mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|ahmedabad/i.test(text)) {
    return "india";
  }

  // Check for USA
  if (lowerText.includes("usa") || lowerText.includes("united states") ||
      /new york|california|texas|florida/i.test(text)) {
    return "usa";
  }

  // Check for UK
  if (lowerText.includes("uk") || lowerText.includes("united kingdom") ||
      /london|manchester|birmingham/i.test(text)) {
    return "uk";
  }

  // Check for UAE
  if (lowerText.includes("uae") || lowerText.includes("dubai") || lowerText.includes("abu dhabi")) {
    return "uae";
  }

  // Check for Singapore
  if (lowerText.includes("singapore")) {
    return "singapore";
  }

  return null;
}

/**
 * Format phone number for display
 */
export function formatPhoneDisplay(phone: string): string {
  // +919876543210 -> +91 98765 43210
  if (phone.startsWith("+91") && phone.length === 13) {
    return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
  }

  // Other formats
  if (phone.startsWith("+")) {
    const code = phone.match(/^\+\d{1,3}/)?.[0] || "";
    const rest = phone.slice(code.length);
    if (rest.length >= 8) {
      const groups = rest.match(/.{1,4}/g) || [rest];
      return `${code} ${groups.join(" ")}`;
    }
  }

  return phone;
}
