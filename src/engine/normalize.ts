/**
 * Text normalization utilities for JobCheck.
 * Handles zero-width characters, spaced letters, homoglyphs, and script detection.
 */

// Zero-width characters regex
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD]/g;

// Map common number-for-letter and symbol substitutions
const HOMOGLYPH_MAP: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "$": "s",
  "!": "i"
};

/**
 * Normalizes text for security pattern matching:
 * 1. Converts to lowercase.
 * 2. Strips zero-width and invisible characters.
 * 3. Protects email addresses from symbol replacement.
 * 4. Maps common homoglyphs and number-for-letter swaps.
 * 5. Collapses spaced-out words (e.g. "w h a t s a p p" -> "whatsapp").
 * 6. Normalizes all whitespace to single spaces.
 */
export function normalizeText(rawText: string): string {
  if (!rawText) return "";

  // 1. Lowercase
  let text = rawText.toLowerCase();

  // 2. Strip zero-width characters
  text = text.replace(ZERO_WIDTH_REGEX, "");

  // 3. Protect email addresses so @ and dots are not mangled
  const protectedEmails: string[] = [];
  text = text.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g, (email) => {
    protectedEmails.push(email);
    return `__SAFE_EMAIL_${protectedEmails.length - 1}__`;
  });

  // 4. Collapse spaced-out single letters commonly used by scammers to evade keyword filters:
  // e.g., "w h a t s a p p", "t e l e g r a m", "p a y t m", "g p a y"
  text = text.replace(/\b([a-z0-9])\s+([a-z0-9])\s+([a-z0-9])(?:\s+([a-z0-9]))*(?:\s+([a-z0-9]))*(?:\s+([a-z0-9]))*(?:\s+([a-z0-9]))*(?:\s+([a-z0-9]))*\b/g, (match) => {
    const collapsed = match.replace(/\s+/g, "");
    return collapsed.length >= 3 ? collapsed : match;
  });

  // 5. Replace standalone @ with 'a' (e.g. "p@y", "ch@t")
  text = text.replace(/@/g, "a");

  // 6. Substitute common number-for-letter swaps in non-purely-numeric tokens
  text = text.replace(/\b[a-z0-9$!]{3,}\b/g, (token) => {
    if (/^\d+$/.test(token)) {
      return token;
    }
    let res = "";
    for (const char of token) {
      res += HOMOGLYPH_MAP[char] ?? char;
    }
    return res;
  });

  // 7. Restore protected email addresses
  text = text.replace(/__SAFE_EMAIL_(\d+)__/g, (_, idx) => {
    const email = protectedEmails[Number(idx)];
    return email !== undefined ? email : "";
  });

  // 8. Normalize whitespace (collapse tabs, newlines, multiple spaces)
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Checks if the text has significant Indic script content (Hindi, Tamil, Telugu, etc.)
 */
export function containsIndicScript(text: string): boolean {
  const indicRegex = /[\u0900-\u0D7F]/;
  return indicRegex.test(text);
}

/**
 * Common legal entity suffixes found in Indian and international company names.
 * Order matters — longer/more-specific patterns first to avoid partial matches.
 */
const LEGAL_SUFFIXES_REGEX = /\s*(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|Ltd\.?|LLP|Limited|Incorporated|Inc\.?|Corp\.?|Corporation|Pte\.?\s*Ltd\.?|Solutions|Technologies|Tech|Services|Consulting|Consultancy)\s*$/i;

/**
 * Canonical legal suffix expansions used for Indian companies.
 * These are the most common forms that help Google Search Grounding find the right entity.
 */
const INDIAN_LEGAL_VARIANTS = [
  "Private Limited",
  "Pvt Ltd",
  "LLP",
  "Limited",
];

/**
 * Strips common legal suffixes from a company name to get the core brand name.
 * e.g. "Tridin Software Private Limited" → "Tridin Software"
 *      "Infosys Ltd" → "Infosys"
 *      "Wipro Technologies" → "Wipro"
 */
export function stripCompanySuffix(name: string): string {
  if (!name) return "";
  let cleaned = name.trim();
  // Iteratively strip suffixes (handles "Foo Technologies Private Limited")
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(LEGAL_SUFFIXES_REGEX, "").trim();
  }
  return cleaned;
}

/**
 * Checks whether the company name already contains a legal suffix.
 */
export function hasLegalSuffix(name: string): boolean {
  return LEGAL_SUFFIXES_REGEX.test(name.trim());
}

/**
 * Generates search-friendly company name variants for better grounding results.
 * If user typed "Tridin Software", returns:
 *   ["Tridin Software", "Tridin Software Private Limited", "Tridin Software Pvt Ltd", "Tridin Software LLP", "Tridin Software Limited"]
 * If user typed "Tridin Software Private Limited", returns:
 *   ["Tridin Software Private Limited", "Tridin Software", "Tridin Software Pvt Ltd", "Tridin Software LLP", "Tridin Software Limited"]
 * This ensures Gemini searches for ALL plausible legal entity forms.
 */
export function expandCompanyNameVariants(name: string): string[] {
  if (!name || name.trim().length < 2) return [];
  const trimmed = name.trim();
  const coreName = stripCompanySuffix(trimmed);

  if (!coreName || coreName.length < 2) return [trimmed];

  const variants = new Set<string>();

  // Always include the original name first
  variants.add(trimmed);

  // Add the bare core name
  variants.add(coreName);

  // Add all legal suffix expansions
  for (const suffix of INDIAN_LEGAL_VARIANTS) {
    variants.add(`${coreName} ${suffix}`);
  }

  return Array.from(variants);
}

/**
 * Ensures a company name has an official legal corporate suffix.
 * If the name already has a suffix like "Private Limited", "Pvt Ltd", "LLP", "Limited", "Inc", etc.,
 * it keeps it clean and returns it.
 * If it lacks a corporate suffix (e.g. "Tridin Software" or "SWITS DIGITAL"),
 * it formats it as a registered corporate entity: "<Name> Private Limited".
 */
export function ensureLegalEntitySuffix(name: string): string {
  if (!name || name.trim().length === 0) return "Employer Organization Private Limited";
  const trimmed = name.trim();
  if (hasLegalSuffix(trimmed)) {
    return trimmed;
  }
  return `${trimmed} Private Limited`;
}

