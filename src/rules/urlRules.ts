import { Finding, UrlRuleContext } from "../types/types";
import {
  DOMAIN_KEYWORDS,
  FREE_HOST_OR_FORMS_SET,
  IMPERSONATION_TARGETS_SET,
  SHORTENERS_SET,
  SUSPICIOUS_TLDS_SET,
  TRUSTED_ATS,
  TRUSTED_JOB_PLATFORMS
} from "./lists";
import { extractDomainParts, isIpAddress } from "../utils/url";
import { getLevenshteinDistance } from "../utils/editDistance";

export type UrlRule = (context: UrlRuleContext) => Finding | null;

/**
 * 1. not-https: URL does not use HTTPS (+10)
 */
export const notHttpsRule: UrlRule = (ctx) => {
  if (ctx.parsedUrl.protocol !== "https:") {
    return {
      id: "not-https",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: "Website does not use secure HTTPS encryption.",
      evidence: ctx.parsedUrl.protocol
    };
  }
  return null;
};

/**
 * 2. ip-host: hostname is a raw IP address (+30)
 */
export const ipHostRule: UrlRule = (ctx) => {
  if (isIpAddress(ctx.hostname)) {
    return {
      id: "ip-host",
      kind: "risk",
      severity: "medium",
      points: 30,
      reason: "Job posting uses a raw IP address instead of a legitimate company domain name.",
      evidence: ctx.hostname
    };
  }
  return null;
};

/**
 * 3. shortener: domain in URL shortener list (+20)
 */
export const shortenerRule: UrlRule = (ctx) => {
  const isShortener = SHORTENERS_SET.has(ctx.rootDomain) ||
                      SHORTENERS_SET.has(ctx.hostname) ||
                      Array.from(SHORTENERS_SET).some(s => ctx.hostname.endsWith(`.${s}`));
  if (isShortener) {
    return {
      id: "shortener",
      kind: "risk",
      severity: "high",
      points: 20,
      reason: "Job link uses a URL shortener, hiding the real destination address.",
      evidence: ctx.hostname
    };
  }
  return null;
};

/**
 * 4. free-host-or-form: hosted on Google Forms, Wix, Blogspot, wa.me, t.me, etc. (+20)
 */
export const freeHostOrFormRule: UrlRule = (ctx) => {
  const fullHref = ctx.parsedUrl.href.toLowerCase();
  let matched: string | undefined;

  for (const hostPattern of FREE_HOST_OR_FORMS_SET) {
    if (ctx.hostname === hostPattern || ctx.hostname.endsWith(`.${hostPattern}`) || fullHref.includes(hostPattern)) {
      matched = hostPattern;
      break;
    }
  }

  if (matched) {
    return {
      id: "free-host-or-form",
      kind: "risk",
      severity: "medium",
      points: 20,
      reason: "Application is hosted on a free website builder, form service, or messaging app rather than a company portal.",
      evidence: matched
    };
  }
  return null;
};

/**
 * 5. suspicious-tld: .xyz, .top, .click, etc. (+15)
 */
export const suspiciousTldRule: UrlRule = (ctx) => {
  let hasSuspiciousTld = false;
  for (const tld of SUSPICIOUS_TLDS_SET) {
    if (ctx.hostname.endsWith(tld)) {
      hasSuspiciousTld = true;
      break;
    }
  }
  if (hasSuspiciousTld) {
    const parts = extractDomainParts(ctx.hostname);
    return {
      id: "suspicious-tld",
      kind: "risk",
      severity: "medium",
      points: 15,
      reason: `Domain uses a suspicious TLD (${parts.tld}) commonly used by disposable scam sites.`,
      evidence: parts.tld
    };
  }
  return null;
};

/**
 * 6. punycode: hostname contains xn-- (+30)
 */
export const punycodeRule: UrlRule = (ctx) => {
  if (ctx.hostname.includes("xn--")) {
    return {
      id: "punycode",
      kind: "risk",
      severity: "high",
      points: 30,
      reason: "Domain contains punycode ('xn--'), an internationalized character format often used in homograph phishing.",
      evidence: ctx.hostname
    };
  }
  return null;
};

/**
 * Normalizes number/character substitutions (e.g. g00gle -> google)
 */
function normalizeSubstitutions(str: string): string {
  return str
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/3/g, "e")
    .replace(/5/g, "s")
    .replace(/@/g, "a");
}

/**
 * 7. lookalike-brand: root domain is within edit distance 1-2 of a known brand (+35)
 */
export const lookalikeBrandRule: UrlRule = (ctx) => {
  const parts = extractDomainParts(ctx.hostname);
  const sldNormalized = normalizeSubstitutions(parts.sld);

  // If the SLD is an exact match for any genuine target brand, it is authentic (not a lookalike)
  if (IMPERSONATION_TARGETS_SET.has(parts.sld)) {
    return null;
  }

  for (const brand of IMPERSONATION_TARGETS_SET) {
    // Homoglyph / number substitution match (e.g., g00gle for google)
    if (parts.sld !== brand && sldNormalized === brand) {
      return {
        id: "lookalike-brand",
        kind: "risk",
        severity: "high",
        points: 35,
        reason: `Domain '${parts.rootDomain}' uses character substitutions to mimic '${brand}'.`,
        evidence: `${parts.sld} vs ${brand}`
      };
    }

    const distOriginal = getLevenshteinDistance(parts.sld, brand);
    const distSubstituted = getLevenshteinDistance(sldNormalized, brand);
    const minDistance = Math.min(distOriginal, distSubstituted);

    // For 3-letter brands (tcs, ibm, hcl), only allow distance 1 (e.g. tcss vs tcs)
    const maxAllowedDist = brand.length <= 3 ? 1 : 2;

    if (minDistance >= 1 && minDistance <= maxAllowedDist && Math.abs(parts.sld.length - brand.length) <= 2) {
      return {
        id: "lookalike-brand",
        kind: "risk",
        severity: "high",
        points: 35,
        reason: `Domain '${parts.rootDomain}' closely mimics known brand '${brand}' (edit distance ${minDistance}).`,
        evidence: `${parts.sld} vs ${brand}`
      };
    }
  }

  return null;
};

/**
 * Compound rule: lookalike-suspicious-tld (+15)
 * If a domain mimics a known brand AND is hosted on a suspicious disposable TLD (like .xyz, .top)
 */
export const lookalikeSuspiciousTldRule: UrlRule = (ctx) => {
  const lookalike = lookalikeBrandRule(ctx);
  const suspTld = suspiciousTldRule(ctx);

  if (lookalike && suspTld) {
    return {
      id: "lookalike-suspicious-tld",
      kind: "risk",
      severity: "high",
      points: 15,
      reason: "Lookalike company brand domain hosted on a suspicious TLD indicates active phishing impersonation.",
      evidence: ctx.hostname
    };
  }
  return null;
};

/**
 * 8. brand-in-wrong-place: brand name in subdomain/path but root domain is not the brand (+30)
 * e.g., tcs.com.apply-now.xyz or infosys.careers-portal.com
 */
export const brandInWrongPlaceRule: UrlRule = (ctx) => {
  const parts = extractDomainParts(ctx.hostname);
  const sub = parts.subdomain.toLowerCase();

  if (!sub) return null;

  for (const brand of IMPERSONATION_TARGETS_SET) {
    // Check if the brand name exists as a token or sub-label in the subdomain
    const subLabels = sub.split(/[\.-]/);
    const brandInSub = subLabels.some((label) => label === brand || label.startsWith(brand));

    if (brandInSub) {
      // If the root domain sld is NOT this brand, flag it!
      if (parts.sld !== brand) {
        return {
          id: "brand-in-wrong-place",
          kind: "risk",
          severity: "high",
          points: 30,
          reason: `Brand '${brand}' appears in the subdomain prefix, but the actual domain is '${parts.rootDomain}'.`,
          evidence: `${sub}.${parts.rootDomain}`
        };
      }
    }
  }

  return null;
};

/**
 * 9. keyword-stuffed-domain: domain contains 2+ job keywords plus a brand (+10)
 */
export const keywordStuffedDomainRule: UrlRule = (ctx) => {
  const parts = extractDomainParts(ctx.hostname);
  const sld = parts.sld.toLowerCase();

  // Check if sld or hostname contains a known brand
  let matchedBrand: string | undefined;
  for (const brand of IMPERSONATION_TARGETS_SET) {
    if (sld.includes(brand)) {
      matchedBrand = brand;
      break;
    }
  }
  if (!matchedBrand) return null;

  // Count keyword matches in sld
  let keywordCount = 0;
  for (const kw of DOMAIN_KEYWORDS) {
    if (sld.includes(kw)) {
      keywordCount++;
    }
  }

  if (keywordCount >= 2) {
    return {
      id: "keyword-stuffed-domain",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: `Domain combines brand '${matchedBrand}' with multiple generic job keywords (${keywordCount} matched).`,
      evidence: sld
    };
  }

  return null;
};

/**
 * 10. hyphen-digit-heavy: 3+ hyphens or 4+ digits in root domain (+10)
 */
export const hyphenDigitHeavyRule: UrlRule = (ctx) => {
  const parts = extractDomainParts(ctx.hostname);
  const hyphenCount = (parts.sld.match(/-/g) || []).length;
  const digitCount = (parts.sld.match(/\d/g) || []).length;

  if (hyphenCount >= 3 || digitCount >= 4) {
    return {
      id: "hyphen-digit-heavy",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: `Domain name has an unusually high count of hyphens (${hyphenCount}) or digits (${digitCount}).`,
      evidence: parts.sld
    };
  }

  return null;
};

/**
 * 11. too-many-subdomains: more than 3 subdomain levels (+10)
 */
export const tooManySubdomainsRule: UrlRule = (ctx) => {
  const parts = extractDomainParts(ctx.hostname);
  if (parts.subdomainPartsCount > 3) {
    return {
      id: "too-many-subdomains",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: `Host uses ${parts.subdomainPartsCount} subdomain levels (more than 3 allowed standard).`,
      evidence: parts.subdomain
    };
  }
  return null;
};

/**
 * 12. very-long-host: hostname longer than 40 characters (+5)
 */
export const veryLongHostRule: UrlRule = (ctx) => {
  if (ctx.hostname.length > 40) {
    return {
      id: "very-long-host",
      kind: "risk",
      severity: "low",
      points: 5,
      reason: `Hostname length (${ctx.hostname.length} chars) exceeds normal threshold of 40 characters.`,
      evidence: ctx.hostname
    };
  }
  return null;
};

/**
 * 13. new-domain: age < 30 days (+35), < 90 days (+25), < 365 days (+10), unknown (+0)
 */
export const newDomainRule: UrlRule = (ctx) => {
  if (ctx.domainAgeDays === null || ctx.domainAgeDays === undefined) {
    return null;
  }

  if (ctx.domainAgeDays < 30) {
    return {
      id: "new-domain",
      kind: "risk",
      severity: "high",
      points: 35,
      reason: `Domain was created very recently (${ctx.domainAgeDays} days ago; under 30 days).`,
      evidence: `${ctx.domainAgeDays} days old`
    };
  }

  if (ctx.domainAgeDays < 90) {
    return {
      id: "new-domain",
      kind: "risk",
      severity: "medium",
      points: 25,
      reason: `Domain was created recently (${ctx.domainAgeDays} days ago; under 90 days).`,
      evidence: `${ctx.domainAgeDays} days old`
    };
  }

  if (ctx.domainAgeDays < 365) {
    return {
      id: "new-domain",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: `Domain is less than 1 year old (${ctx.domainAgeDays} days).`,
      evidence: `${ctx.domainAgeDays} days old`
    };
  }

  return null;
};

/**
 * 14. redirect-chain: more than 3 hops (+15)
 */
export const redirectChainRule: UrlRule = (ctx) => {
  if (ctx.redirectChain && ctx.redirectChain.length > 3) {
    return {
      id: "redirect-chain",
      kind: "risk",
      severity: "medium",
      points: 15,
      reason: `Link triggered an excessive redirect chain (${ctx.redirectChain.length} hops).`,
      evidence: `${ctx.redirectChain.length} hops`
    };
  }
  return null;
};

/**
 * 15. cross-domain-redirect: final root domain differs from submitted one (excluding known shorteners) (+10)
 */
export const crossDomainRedirectRule: UrlRule = (ctx) => {
  if (!ctx.finalUrl) return null;

  const isShortener = SHORTENERS_SET.has(ctx.rootDomain) ||
                      Array.from(SHORTENERS_SET).some(s => ctx.hostname.endsWith(`.${s}`));
  if (isShortener) return null; // Expected for shorteners

  const finalParts = extractDomainParts(ctx.finalUrl);
  if (finalParts.rootDomain && ctx.rootDomain && finalParts.rootDomain !== ctx.rootDomain) {
    return {
      id: "cross-domain-redirect",
      kind: "risk",
      severity: "low",
      points: 10,
      reason: `Link redirected across domains from '${ctx.rootDomain}' to '${finalParts.rootDomain}'.`,
      evidence: `${ctx.rootDomain} -> ${finalParts.rootDomain}`
    };
  }

  return null;
};

/**
 * 16. safe-browsing: flagged by Google Safe Browsing (+60)
 */
export const safeBrowsingRule: UrlRule = (ctx) => {
  if (ctx.safeBrowsingFlagged === true) {
    return {
      id: "safe-browsing",
      kind: "risk",
      severity: "high",
      points: 60,
      reason: "Domain is flagged by Google Safe Browsing as deceptive or malicious.",
      evidence: "Safe Browsing match"
    };
  }
  return null;
};

/* ==========================================================================
   URL Trust Signals (Section 11)
   ========================================================================== */

/**
 * Trust: Trusted job platform (-10)
 */
export const trustedPlatformSignal: UrlRule = (ctx) => {
  const parts = extractDomainParts(ctx.hostname);
  const isTrustedPlatform = TRUSTED_JOB_PLATFORMS.some(
    (platform) => parts.sld === platform || ctx.hostname === `${platform}.com` || ctx.hostname.endsWith(`.${platform}.com`)
  );

  if (isTrustedPlatform) {
    return {
      id: "trusted-platform",
      kind: "trust",
      severity: "low",
      points: -10,
      reason: "Hosted on a recognized job platform. Note: individual postings can still be fake; verify the employer independently.",
      evidence: ctx.rootDomain
    };
  }

  return null;
};

/**
 * Trust: Hosted on a known ATS (-15)
 */
export const trustedAtsSignal: UrlRule = (ctx) => {
  const isAts = TRUSTED_ATS.some(
    (ats) => ctx.hostname === ats || ctx.hostname.endsWith(`.${ats}`) || ctx.rootDomain === ats
  );

  if (isAts) {
    return {
      id: "trusted-ats",
      kind: "trust",
      severity: "medium",
      points: -15,
      reason: "Hosted on a recognized corporate Applicant Tracking System (ATS).",
      evidence: ctx.hostname
    };
  }

  return null;
};

/**
 * Trust: Domain age >= 5 years (-15), >= 2 years (-10)
 */
export const domainAgeTrustSignal: UrlRule = (ctx) => {
  if (ctx.domainAgeDays === null || ctx.domainAgeDays === undefined) {
    return null;
  }

  if (ctx.domainAgeDays >= 5 * 365) {
    return {
      id: "established-domain-5yr",
      kind: "trust",
      severity: "medium",
      points: -15,
      reason: `Domain is well-established (${Math.floor(ctx.domainAgeDays / 365)} years active).`,
      evidence: `${ctx.domainAgeDays} days`
    };
  }

  if (ctx.domainAgeDays >= 2 * 365) {
    return {
      id: "established-domain-2yr",
      kind: "trust",
      severity: "low",
      points: -10,
      reason: `Domain is established (${Math.floor(ctx.domainAgeDays / 365)} years active).`,
      evidence: `${ctx.domainAgeDays} days`
    };
  }

  return null;
};

export const ALL_URL_RULES: UrlRule[] = [
  notHttpsRule,
  ipHostRule,
  shortenerRule,
  freeHostOrFormRule,
  suspiciousTldRule,
  punycodeRule,
  lookalikeBrandRule,
  lookalikeSuspiciousTldRule,
  brandInWrongPlaceRule,
  keywordStuffedDomainRule,
  hyphenDigitHeavyRule,
  tooManySubdomainsRule,
  veryLongHostRule,
  newDomainRule,
  redirectChainRule,
  crossDomainRedirectRule,
  safeBrowsingRule,
  trustedPlatformSignal,
  trustedAtsSignal,
  domainAgeTrustSignal
];
