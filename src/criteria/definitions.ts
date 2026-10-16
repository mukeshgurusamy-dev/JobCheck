/**
 * The 100 employment-integrity criteria.
 *
 * Every criterion asks one question that a jobseeker could in principle answer
 * themselves, and is grouped into one of seven pillars. Roughly three quarters
 * are answerable from what the rules engine already established (URL shape,
 * domain records, listing text). The rest need the web-search investigation —
 * those return `na`, never a fabricated pass, when the investigation did not
 * run.
 *
 * `verifyAgainst` records where the criterion's premise came from, so each one
 * can be re-checked against a live source rather than trusted indefinitely.
 */

import {
  FREE_HOST_OR_FORMS,
  TRUSTED_ATS,
  TRUSTED_JOB_PLATFORMS,
} from "../rules/lists";
import { CriteriaContext, CriteriaPillar, Criterion, CriterionStatus } from "./types";

type Outcome = { status: CriterionStatus; detail: string };

const pass = (detail: string): Outcome => ({ status: "pass", detail });
const fail = (detail: string): Outcome => ({ status: "fail", detail });
const warn = (detail: string): Outcome => ({ status: "warn", detail });
const na = (detail: string): Outcome => ({ status: "na", detail });

const hasText = (ctx: CriteriaContext): boolean => ctx.rawText.trim().length > 0;

/** Passes unless a specific risk finding fired. */
function findingAbsent(
  id: string,
  pillar: CriteriaPillar,
  title: string,
  findingId: string,
  passDetail: string,
  verifyAgainst: string,
): Criterion {
  return {
    id,
    pillar,
    title,
    description: passDetail,
    verifyAgainst,
    evaluate: (ctx) => {
      const hit = ctx.findings.find((f) => f.id === findingId);
      return hit
        ? fail(hit.reason)
        : pass(passDetail);
    },
  };
}

/**
 * Passes unless the listing text matches. Returns `na` when there is no text to
 * inspect, so a bare-URL scan is never credited with a pass it did not earn.
 */
function phraseAbsent(
  id: string,
  pillar: CriteriaPillar,
  title: string,
  pattern: RegExp,
  passDetail: string,
  failDetail: string,
  verifyAgainst: string,
): Criterion {
  return {
    id,
    pillar,
    title,
    description: passDetail,
    verifyAgainst,
    evaluate: (ctx) => {
      if (!hasText(ctx)) {
        return na("No job description or page text was available to check.");
      }
      return pattern.test(ctx.rawText) ? fail(failDetail) : pass(passDetail);
    },
  };
}

/** Derives a status from page/URL facts. Returning `null` means `na`. */
function probe(
  id: string,
  pillar: CriteriaPillar,
  title: string,
  verifyAgainst: string,
  fn: (ctx: CriteriaContext) => Outcome | null,
): Criterion {
  return {
    id,
    pillar,
    title,
    description: title,
    verifyAgainst,
    evaluate: (ctx) =>
      fn(ctx) ?? na("The evidence this criterion needs was not available."),
  };
}

/**
 * Derives a status from the web-search investigation. Always `na` when the
 * investigation did not complete — this is what stops the checklist claiming a
 * pass for something nothing actually checked.
 */
function aiProbe(
  id: string,
  pillar: CriteriaPillar,
  title: string,
  verifyAgainst: string,
  fn: (ai: NonNullable<CriteriaContext["ai"]>) => Outcome | null,
): Criterion {
  return {
    id,
    pillar,
    title,
    description: title,
    verifyAgainst,
    evaluate: (ctx) => {
      if (!ctx.ai || ctx.ai.status !== "completed") {
        return na(
          "Needs the AI web investigation, which did not complete for this scan.",
        );
      }
      return (
        fn(ctx.ai) ??
        na("The investigation returned no evidence for this criterion.")
      );
    },
  };
}

const containsAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

export const CRITERIA: Criterion[] = [
  // ── Pillar 1 · Digital footprint & domain (25) ───────────────────────────
  findingAbsent(
    "domain-served-over-https",
    "digital-footprint",
    "Delivered over HTTPS",
    "not-https",
    "The listing is served over an encrypted HTTPS connection.",
    "Public reporting on HTTPS adoption and job-scam infrastructure (APWG eCrime Exchange).",
  ),
  findingAbsent(
    "domain-not-a-raw-ip",
    "digital-footprint",
    "Hosted on a domain name, not a bare IP",
    "ip-host",
    "The link uses a proper domain name rather than a raw IP address.",
    "APWG eCrime Exchange — phishing infrastructure frequently uses bare IPs.",
  ),
  findingAbsent(
    "domain-not-a-shortener",
    "digital-footprint",
    "Not hidden behind a URL shortener",
    "shortener",
    "The link resolves to a real domain rather than a URL-shortening service.",
    "APWG eCrime Exchange — shorteners are used to disguise destination hosts.",
  ),
  findingAbsent(
    "domain-not-a-free-form-host",
    "digital-footprint",
    "Not hosted on a free form/blog host",
    "free-host-or-form",
    "The employer is not collecting applications through a free form, blog or messenger host.",
    "Google Forms / wa.me / t.me abuse patterns documented by CERT-In advisories.",
  ),
  findingAbsent(
    "domain-tld-not-high-risk",
    "digital-footprint",
    "Domain is not on a high-abuse TLD",
    "suspicious-tld",
    "The domain does not use a TLD disproportionately associated with abuse.",
    "Spamhaus / Interisle TLD abuse statistics.",
  ),
  findingAbsent(
    "domain-no-punycode-homograph",
    "digital-footprint",
    "No punycode homograph in the domain",
    "punycode",
    "The hostname contains no punycode encoding, ruling out a homograph impersonation.",
    "Unicode Technical Standard #39, IDN homograph attacks.",
  ),
  findingAbsent(
    "domain-not-a-brand-lookalike",
    "digital-footprint",
    "Domain is not impersonating a known brand",
    "lookalike-brand",
    "The domain does not imitate a well-known employer's name.",
    "Reported impersonation targets: MCA-listed IT services firms.",
  ),
  findingAbsent(
    "domain-not-lookalike-on-cheap-tld",
    "digital-footprint",
    "No brand lookalike on a cheap TLD",
    "lookalike-suspicious-tld",
    "The domain does not combine a brand name with a high-abuse TLD.",
    "CERT-In advisories on fake recruitment domains for Indian IT majors.",
  ),
  findingAbsent(
    "domain-brand-not-misplaced",
    "digital-footprint",
    "Brand name not misplaced in the domain",
    "brand-in-wrong-place",
    "A known brand name does not appear in an unexpected position in the hostname.",
    "CERT-In advisories on fake recruitment domains.",
  ),
  findingAbsent(
    "domain-not-keyword-stuffed",
    "digital-footprint",
    "Domain is not keyword-stuffed",
    "keyword-stuffed-domain",
    "The hostname is not padded with words like 'job', 'apply' and 'hiring' to game search.",
    "Observed patterns in reported fake-job domains (cybercrime.gov.in reports).",
  ),
  findingAbsent(
    "domain-not-hyphen-digit-heavy",
    "digital-footprint",
    "Domain is not hyphen- or digit-heavy",
    "hyphen-digit-heavy",
    "The hostname is not padded with hyphens or digits, a common throwaway-domain shape.",
    "Interisle domain abuse statistics.",
  ),
  findingAbsent(
    "domain-subdomain-depth-reasonable",
    "digital-footprint",
    "Subdomain depth is reasonable",
    "too-many-subdomains",
    "The host does not nest an unusual number of subdomains.",
    "Phishing-kit hosting patterns (APWG).",
  ),
  findingAbsent(
    "domain-host-length-reasonable",
    "digital-footprint",
    "Hostname length is reasonable",
    "very-long-host",
    "The hostname is not abnormally long.",
    "Phishing-kit hosting patterns (APWG).",
  ),
  findingAbsent(
    "domain-not-newly-registered",
    "digital-footprint",
    "Domain is not newly registered",
    "new-domain",
    "The domain is not within the window in which most fraudulent recruitment domains operate.",
    "Interisle / APWG — the majority of abuse domains are under a year old.",
  ),
  probe(
    "domain-age-over-one-year",
    "digital-footprint",
    "Registered more than a year ago",
    "RDAP registration date for the root domain.",
    (ctx) => {
      if (ctx.pageData?.domainAgeDays == null) return null;
      const years = ctx.pageData.domainAgeDays / 365;
      return ctx.pageData.domainAgeDays > 365
        ? pass(`Domain is approximately ${years.toFixed(1)} years old.`)
        : fail(`Domain is only ${Math.round(ctx.pageData.domainAgeDays)} days old.`);
    },
  ),
  probe(
    "domain-age-determined",
    "digital-footprint",
    "Domain age could be determined",
    "RDAP lookup via rdap.org and the TLD registry.",
    (ctx) =>
      ctx.hasDomainAge
        ? pass("Domain registration date was retrieved from the registry.")
        : warn(
            "The registry did not return a registration date, so domain age is unknown.",
          ),
  ),
  probe(
    "page-title-present",
    "digital-footprint",
    "Page returned a title",
    "The fetched page's <title> element.",
    (ctx) => {
      if (!ctx.pageFetched || !ctx.pageData) return null;
      return ctx.pageData.title && ctx.pageData.title.trim().length > 0
        ? pass(`Page title: "${ctx.pageData.title.slice(0, 80)}"`)
        : warn("The page returned no title element.");
    },
  ),
  findingAbsent(
    "no-excessive-redirect-chain",
    "digital-footprint",
    "No excessive redirect chain",
    "redirect-chain",
    "The link does not bounce through a long chain of redirects.",
    "APWG — redirect chains are used to evade blocklists.",
  ),
  findingAbsent(
    "no-cross-domain-redirect",
    "digital-footprint",
    "No redirect to an unrelated domain",
    "cross-domain-redirect",
    "The link does not hand off to a different root domain.",
    "APWG — cross-domain handoff is a common eviction technique.",
  ),
  findingAbsent(
    "domain-not-on-safe-browsing-list",
    "digital-footprint",
    "Not flagged by Google Safe Browsing",
    "safe-browsing",
    "Google Safe Browsing holds no live warning for this host.",
    "Google Safe Browsing Transparency Report.",
  ),
  probe(
    "page-content-was-retrievable",
    "digital-footprint",
    "Page content was retrievable",
    "Direct fetch, then the reader-proxy / cache / search-index ladder in extractor.ts.",
    (ctx) => {
      if (ctx.pageFetched) {
        return pass("The listing page was successfully retrieved and analysed.");
      }
      return ctx.pageData?.fetchSource
        ? pass(`Content retrieved via ${ctx.pageData.fetchSource}.`)
        : warn(
            "The page could not be retrieved, so only URL and domain evidence was available.",
          );
    },
  ),
  probe(
    "official-domain-matches-host",
    "digital-footprint",
    "Host matches the employer's official domain",
    "Web search for the employer's official corporate domain.",
    (ctx) => {
      const official = ctx.ai?.officialDomain?.toLowerCase().replace(/^www\./, "");
      if (!official) return null;
      const matches =
        ctx.hostname === official || ctx.hostname.endsWith(`.${official}`);
      return matches
        ? pass(`Host matches the official domain (${official}).`)
        : fail(
            `Listing is hosted on ${ctx.hostname}, but the employer's official domain appears to be ${official}.`,
          );
    },
  ),
  aiProbe(
    "digital-footprint-verified",
    "digital-footprint",
    "Employer has a verified web presence",
    "Web search for the employer's corporate site, press coverage and profiles.",
    (ai) => {
      const fp = ai.digitalFootprint;
      if (!fp) return null;
      if (fp === "verified") return pass("Search confirms a substantive, legitimate web presence.");
      if (fp === "moderate") return warn("Search found a limited but plausible web presence.");
      return fail(`Search found a ${fp} web presence for this employer.`);
    },
  ),
  findingAbsent(
    "no-sender-domain-mismatch",
    "digital-footprint",
    "No sender-domain mismatch in the listing",
    "sender-domain-mismatch",
    "The address in the listing text does not contradict the claimed employer.",
    "Email-authentication guidance (SPF/DKIM) and reported spoofing patterns.",
  ),
  probe(
    "no-detached-application-host",
    "digital-footprint",
    "Application is not collected on a detached host",
    "Comparison of the listing host against known free-host and messenger domains.",
    (ctx) => {
      const hit = FREE_HOST_OR_FORMS.find((h) =>
        `${ctx.hostname}${ctx.rootDomain}`.includes(h.split("/")[0] ?? h),
      );
      return hit
        ? fail(`Applications are collected through ${hit}, a free host with no employer identity.`)
        : pass("Applications are not collected through a free form, blog or messenger host.");
    },
  ),

  // ── Pillar 2 · Payment & document demands (18) ───────────────────────────
  findingAbsent(
    "no-registration-fee",
    "payment-demands",
    "No registration or joining fee",
    "upfront-payment",
    "The listing demands no registration, joining or verification fee.",
    "cybercrime.gov.in — upfront fees are the defining feature of recruitment fraud.",
  ),
  phraseAbsent(
    "no-training-fee",
    "payment-demands",
    "No training or certification fee",
    /(?<!no\s)(?<!without\s)(?:training|certification|onboarding|course|evaluation|internship)\s*(?:[\w\s]{0,20})?\s*(?:fee|fees|charge|charges|cost)/i,
    "No training, certification or onboarding fee is demanded.",
    "A training or certification fee is demanded before employment.",
    "cybercrime.gov.in and CERT-In advisories on fresher recruitment fraud.",
  ),
  phraseAbsent(
    "no-security-deposit",
    "payment-demands",
    "No security or refundable deposit",
    /(?<!no\s)(?<!without\s)(?:refundable|security|caution)\s*(?:deposit|amount|money|balance|fund)/i,
    "No security, caution or refundable deposit is requested.",
    "A security or refundable deposit is requested — these are never refunded.",
    "cybercrime.gov.in — 'refundable deposit' is a recurring recruitment-fraud phrasing.",
  ),
  phraseAbsent(
    "no-kit-or-equipment-charge",
    "payment-demands",
    "No kit, laptop or equipment charge",
    /(?<!no\s)(?<!without\s)(?<!free\s)(?:id\s*card|uniform|laptop|courier|insurance|stamp\s*paper|agreement|bond|hardware)\s*(?:[\w\s]{0,20})?\s*(?:charges?|fee|fees|deposit|cost|amount)/i,
    "No charge for a kit, laptop, uniform, courier or bond is requested.",
    "A charge for equipment or paperwork is requested.",
    "cybercrime.gov.in — 'laptop delivery charge' and 'courier charge' fraud reports.",
  ),
  phraseAbsent(
    "no-interview-gate-pass-fee",
    "payment-demands",
    "No interview gate-pass fee",
    /(?:gate\s*pass|interview\s*pass|entry\s*pass)[^.]{0,60}?(?:fee|fees|charge|charges|pay|deposit|₹|rs\.?|inr)/i,
    "No fee is charged to attend an interview.",
    "A fee is charged for an interview gate pass or entry pass.",
    "cybercrime.gov.in — 'interview gate pass fee' is a documented fresher-scam ask.",
  ),
  findingAbsent(
    "no-medical-or-clinic-fee",
    "payment-demands",
    "No paid medical or clinic requirement",
    "paid-medical-exam",
    "No paid medical examination or clinic visit is required.",
    "cybercrime.gov.in — paid pre-employment medicals are used as a fee-collection pretext.",
  ),
  phraseAbsent(
    "no-upi-or-qr-payment",
    "payment-demands",
    "No UPI, wallet or QR payment requested",
    /(?:pay|transfer|deposit|send|scan)[^.]{0,60}?(?:upi|gpay|google\s*pay|phonepe|paytm|qr\s*code|wallet)/i,
    "No payment is requested via UPI, wallet or QR code.",
    "Payment is requested via UPI, a wallet or a QR code.",
    "RBI and cybercrime.gov.in guidance on UPI-based recruitment fraud.",
  ),
  findingAbsent(
    "no-cryptocurrency-payment",
    "payment-demands",
    "No cryptocurrency payment requested",
    "cryptocurrency-payment",
    "No cryptocurrency payment is requested.",
    "RBI caution on crypto settlement and its use in unrecoverable fraud.",
  ),
  findingAbsent(
    "no-investment-scheme",
    "payment-demands",
    "No investment or ROI scheme attached",
    "investment-scheme",
    "The offer does not bundle an investment or return-on-investment scheme.",
    "SEBI and RBI investor warnings on unregistered deposit schemes.",
  ),
  findingAbsent(
    "no-advance-salary-loan",
    "payment-demands",
    "No advance-salary or loan product attached",
    "advance-salary-loan",
    "The offer does not include an advance-salary or loan product.",
    "RBI warnings on unregistered lending apps bundled with job offers.",
  ),
  phraseAbsent(
    "no-aadhaar-submission-early",
    "payment-demands",
    "No Aadhaar submission requested early",
    /(?<!no\s)(?<!never\s)(?:send|share|upload|submit|provide)[^.]{0,40}?(?:aadhaar|aadhar|adhar|uidai)/i,
    "No Aadhaar document is requested before an offer.",
    "Aadhaar details are requested before any verified offer letter.",
    "UIDAI advisory on sharing Aadhaar with unverified employers.",
  ),
  phraseAbsent(
    "no-pan-or-bank-details-early",
    "payment-demands",
    "No PAN or bank details requested early",
    // An asking verb is required so "we never ask for your PAN" does not trip this.
    /(?:share|send|provide|submit|upload|give)[^.]{0,40}?(?:pan\s*card|pan\s*number|cancelled\s*cheque|bank\s*account|ifsc|passbook)/i,
    "No PAN, bank account or cheque details are requested before an offer.",
    "PAN or bank account details are requested before an offer.",
    "CERT-In and cybercrime.gov.in guidance on identity-document harvesting.",
  ),
  phraseAbsent(
    "no-otp-or-cvv-request",
    "payment-demands",
    "No OTP, CVV or PIN requested",
    // An asking verb is required so "we will never ask for an OTP" does not trip this.
    /(?:share|send|provide|give|tell|enter|confirm|reply)[^.]{0,30}?(?:otp|one\s*time\s*password|cvv|atm\s*pin|card\s*pin)/i,
    "No OTP, CVV or card PIN is requested.",
    "The listing asks for an OTP, CVV or card PIN — no legitimate employer ever does.",
    "RBI and NPCI guidance — no employer or recruiter ever needs an OTP.",
  ),
  findingAbsent(
    "no-personal-data-harvesting",
    "payment-demands",
    "No unrelated personal-data harvesting",
    "data-harvesting",
    "The listing does not collect personal data beyond what hiring requires.",
    "CERT-In advisories on data-harvesting forms bundled with job ads.",
  ),
  findingAbsent(
    "no-exam-or-study-material-fee",
    "payment-demands",
    "No exam or study-material fee",
    "exam-study-material-fee",
    "No fee is charged for exam papers, study material or question banks.",
    "cybercrime.gov.in — 'study material fee' is a documented government-job scam ask.",
  ),
  phraseAbsent(
    "no-courier-or-stamp-paper-charge",
    "payment-demands",
    "No courier or stamp-paper charge",
    /(?:courier|stamp\s*paper|notary|affidavit)[^.]{0,60}?(?:fee|fees|charge|charges|pay|₹|rs\.?|inr|deposit)/i,
    "No courier, stamp-paper or notarisation charge is requested.",
    "A courier, stamp-paper or notarisation charge is requested.",
    "cybercrime.gov.in — document-handling charges as a fee pretext.",
  ),
  phraseAbsent(
    "no-mandatory-charges-language",
    "payment-demands",
    "No 'mandatory charges' framing",
    /(?:mandatory|compulsory|non-?negotiable)\s*(?:[\w\s]{0,25})?(?:charges?|fee|fees|cost|deposit|payment)/i,
    "The listing does not frame any payment as mandatory or compulsory.",
    "A payment is framed as mandatory or compulsory.",
    "cybercrime.gov.in — 'mandatory charges' phrasing in reported scams.",
  ),
  phraseAbsent(
    "no-payment-before-interview",
    "payment-demands",
    "No payment demanded before the interview",
    /(?:pay|deposit|transfer)[^.]{0,60}?before\s*(?:the\s*)?(?:interview|joining|test|assessment)/i,
    "Nothing is payable before the interview or joining date.",
    "A payment is demanded before the interview or joining date.",
    "cybercrime.gov.in — pre-interview payment demands.",
  ),

  // ── Pillar 3 · Compensation & offer realism (15) ─────────────────────────
  findingAbsent(
    "no-unrealistic-pay",
    "offer-realism",
    "Pay is not implausible for the role",
    "unrealistic-pay",
    "The stated pay is plausible for the advertised role and experience level.",
    "Market salary benchmarks (Naukri JobSpeak, AmbitionBox salary data).",
  ),
  probe(
    "salary-stated-as-a-range",
    "offer-realism",
    "Salary stated as a realistic range",
    "Comparison of stated pay against role-level benchmarks.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      const trust = ctx.findings.find((f) => f.id === "realistic-ranged-salary");
      return trust
        ? pass("A realistic salary range is stated.")
        : warn("No realistic salary range could be identified in the listing.");
    },
  ),
  phraseAbsent(
    "no-placement-guarantee",
    "offer-realism",
    "No placement or job guarantee",
    /(?:job|placement|selection)\s*(?:guarantee|guaranteed|assurance|assured|100\s*%)/i,
    "No placement or job guarantee is offered.",
    "The listing guarantees a job or placement — legitimate employers never do.",
    "cybercrime.gov.in — '100% job guarantee' is a standard recruitment-scam hook.",
  ),
  findingAbsent(
    "no-instant-offer",
    "offer-realism",
    "No instant or spot offer",
    "instant-offer",
    "The offer does not promise an instant or spot appointment.",
    "cybercrime.gov.in — spot offer letters without interview are a core scam pattern.",
  ),
  phraseAbsent(
    "no-interview-free-hiring",
    "offer-realism",
    "Selection does not skip the interview",
    /(?:without|no)\s+(?:any\s+)?(?:interview|technical\s+round|hr\s+round)/i,
    "The selection process involves a genuine interview stage.",
    "The listing advertises selection without any interview.",
    "cybercrime.gov.in — 'no interview required' hiring claims.",
  ),
  findingAbsent(
    "no-pay-without-skills",
    "offer-realism",
    "Pay not offered without skills or experience",
    "no-skill-easy-money",
    "The role does not promise high pay for no skills or experience.",
    "cybercrime.gov.in — 'no experience, high salary' bait patterns.",
  ),
  findingAbsent(
    "no-task-commission-scheme",
    "offer-realism",
    "No task or review-commission scheme",
    "task-scam",
    "The role is not a task, rating or commission scheme.",
    "cybercrime.gov.in and RBI warnings on task-based investment fraud.",
  ),
  findingAbsent(
    "no-mlm-referral-scheme",
    "offer-realism",
    "No MLM or referral chain",
    "mlm-referral",
    "The role does not pay primarily for recruiting others.",
    "Consumer Protection (Direct Selling) Rules, 2021.",
  ),
  phraseAbsent(
    "no-guaranteed-daily-earnings",
    "offer-realism",
    "No guaranteed daily or weekly earnings",
    /(?:guaranteed|assured)\s*(?:daily|monthly|weekly|per\s*day)?\s*(?:return|income|earning|earnings|profit|payout)/i,
    "No guaranteed recurring earnings are promised.",
    "Guaranteed daily or monthly earnings are promised.",
    "SEBI / RBI warnings on assured-return promises.",
  ),
  findingAbsent(
    "no-training-then-job-funnel",
    "offer-realism",
    "No pay-for-training funnel",
    "training-then-job",
    "The offer is not a pay-for-training-then-placement funnel.",
    "cybercrime.gov.in — training-fee-then-placement funnels.",
  ),
  findingAbsent(
    "fresher-demands-are-realistic",
    "offer-realism",
    "Fresher requirements are realistic",
    "fake-fresher-demands",
    "The stated requirements match a realistic fresher profile.",
    "cybercrime.gov.in — implausible fresher eligibility as a scam hook.",
  ),
  findingAbsent(
    "no-urgency-pressure",
    "offer-realism",
    "No artificial urgency or scarcity",
    "urgency-pressure",
    "The listing does not use countdown pressure or 'seats filling fast' tactics.",
    "FTC/CERT-In guidance on urgency as a manipulation tactic.",
  ),
  findingAbsent(
    "no-overseas-placement-fee",
    "offer-realism",
    "No overseas placement or visa fee",
    "overseas-offer",
    "No overseas placement or visa-processing fee is involved.",
    "MEA advisories on overseas job-fraud agents and visa-fee scams.",
  ),
  phraseAbsent(
    "no-work-from-home-earning-bait",
    "offer-realism",
    "No work-from-home earnings bait",
    /work\s*from\s*home[^.]{0,60}?(?:earn|income|salary|₹|rs\.?|inr|lakh|k\s*per)/i,
    "The listing is not a work-from-home earnings bait post.",
    "Work-from-home earning bait is used to attract applicants.",
    "cybercrime.gov.in — work-from-home earning bait in reported scams.",
  ),
  findingAbsent(
    "employer-identity-is-specific",
    "offer-realism",
    "Employer identity is specific",
    "vague-employer",
    "The listing names a specific employer rather than a vague 'reputed company'.",
    "cybercrime.gov.in — deliberately vague employer identity.",
  ),

  // ── Pillar 4 · Legal identity & registration (14) ────────────────────────
  probe(
    "employer-name-stated",
    "legal-identity",
    "Employer name is stated",
    "The listing text and page content.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      return /(?:company|employer|organization|organisation|hiring\s+company)\s*[:\-–]/i.test(
        ctx.rawText,
      ) ||
        /[A-Z][A-Za-z0-9&.,' ]{2,50}\s+(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|LLP|Limited|Inc\.?|Corp\.?)/.test(
          ctx.rawText,
        )
        ? pass("A specific employer name appears in the listing.")
        : warn("No clearly identifiable employer name was found in the listing text.");
    },
  ),
  probe(
    "legal-entity-suffix-present",
    "legal-identity",
    "Registered legal-entity suffix present",
    "MCA/ROC naming convention for Indian companies.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      return /(?:Private\s+Limited|Pvt\.?\s*Ltd\.?|LLP|Limited|Incorporated|Inc\.?|Corporation)/i.test(
        ctx.rawText,
      )
        ? pass("The employer is named with a registered legal-entity suffix.")
        : warn(
            "No legal-entity suffix (Private Limited / LLP / Limited) appears — many genuine listings omit it, but it cannot be confirmed from the text alone.",
          );
    },
  ),
  probe(
    "registration-claim-is-checkable",
    "legal-identity",
    "Any registration claim is checkable",
    "MCA21 / GST portal records for the named entity.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      return /(?:MCA|CIN|LLPIN|registered\s+(?:company|office)|GST|incorporat)/i.test(
        ctx.rawText,
      )
        ? pass("The listing makes a checkable registration claim.")
        : warn("The listing makes no registration claim that can be checked.");
    },
  ),
  findingAbsent(
    "no-free-email-only-contact",
    "legal-identity",
    "Not contactable only via a free email",
    "free-email",
    "Contact details are not limited to a free consumer email address.",
    "CERT-In advisories on free-email-only recruitment contact.",
  ),
  probe(
    "recruiter-email-matches-employer",
    "legal-identity",
    "Recruiter email domain matches the employer",
    "The email domain in the listing versus the claimed employer name.",
    (ctx) => {
      const trust = ctx.findings.find((f) => f.id === "email-domain-match");
      if (trust) return pass("The recruiter's email domain matches the named employer.");
      return ctx.findings.some((f) => f.id === "free-email")
        ? fail("The only contact email is on a free consumer mail provider.")
        : na("No recruiter email address was present to check.");
    },
  ),
  findingAbsent(
    "no-impersonated-brand-domain",
    "legal-identity",
    "Listing does not impersonate a known brand",
    "lookalike-brand",
    "The domain does not impersonate a known employer's brand.",
    "Reported impersonation targets of Indian IT-services firms (CERT-In).",
  ),
  aiProbe(
    "legal-status-verified-online",
    "legal-identity",
    "Corporate registration verified online",
    "MCA21 / Zauba / Tofler records via web search.",
    (ai) => {
      const status = ai.companyAudit?.legalStatus?.status;
      if (!status) return null;
      if (status === "pass") {
        return pass(
          ai.companyAudit?.legalStatus?.details ||
            "Search found an active corporate registration.",
        );
      }
      return status === "warn"
        ? warn(ai.companyAudit?.legalStatus?.details || "Registration could only be partly verified.")
        : fail(ai.companyAudit?.legalStatus?.details || "No corporate registration could be found.");
    },
  ),
  aiProbe(
    "company-name-confirmed-by-search",
    "legal-identity",
    "Employer name confirmed by search",
    "Web search for the employer's canonical registered name.",
    (ai) =>
      ai.companyName
        ? pass(`Search resolved the employer to "${ai.companyName}".`)
        : fail("Search could not resolve the listing to a named legal entity."),
  ),
  probe(
    "company-name-matches-domain",
    "legal-identity",
    "Employer name matches the domain",
    "Comparison of the resolved employer name against the listing hostname.",
    (ctx) => {
      const name = ctx.ai?.companyName;
      if (!name) return null;
      const tokens = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (t) =>
            t.length > 2 &&
            !["private", "limited", "pvt", "ltd", "llp", "inc", "corp", "the"].includes(t),
        );
      if (tokens.length === 0) return null;
      const host = ctx.rootDomain.toLowerCase();
      const matched = tokens.filter((t) => host.includes(t));
      return matched.length > 0
        ? pass(`Domain contains the employer's name ("${matched[0]}").`)
        : warn(
            `The domain "${ctx.rootDomain}" does not contain any part of the registered name "${name}".`,
          );
    },
  ),
  aiProbe(
    "official-corporate-domain-found",
    "legal-identity",
    "Official corporate domain identified",
    "Web search for the employer's official website.",
    (ai) =>
      ai.officialDomain
        ? pass(`Official domain identified as ${ai.officialDomain}.`)
        : warn("Search did not identify an official corporate domain."),
  ),
  aiProbe(
    "employer-verified-legitimate",
    "legal-identity",
    "Employer verified as a legitimate entity",
    "Web search across corporate registries, news and professional profiles.",
    (ai) => {
      if (ai.isScamLikely) {
        return fail("Search findings class this employer as likely fraudulent.");
      }
      return ai.trustSignals && ai.trustSignals.length > 0
        ? pass(ai.trustSignals[0] ?? "Search confirms a legitimate employer.")
        : warn("Search found no positive confirmation of the employer's legitimacy.");
    },
  ),
  aiProbe(
    "not-flagged-scam-likely",
    "legal-identity",
    "Not classified as scam-likely by search",
    "Web search across review sites, forums and complaint boards.",
    (ai) =>
      ai.isScamLikely
        ? fail(ai.summary || "Search findings indicate a likely scam.")
        : pass("Search findings do not classify this employer as a scam."),
  ),
  aiProbe(
    "digital-footprint-not-minimal",
    "legal-identity",
    "Digital footprint is not minimal",
    "Web search across corporate site, LinkedIn and press.",
    (ai) => {
      const fp = ai.digitalFootprint;
      if (!fp) return null;
      return fp === "minimal" || fp === "suspicious"
        ? fail(`Search found a ${fp} digital footprint, consistent with a shell entity.`)
        : pass(`Search found a ${fp} digital footprint.`);
    },
  ),
  aiProbe(
    "corporate-identity-pillar-passed",
    "legal-identity",
    "Overall corporate identity check passed",
    "Aggregate of the resolution, registration and footprint findings.",
    (ai) => {
      const verdict = ai.companyAudit?.overallVerdict;
      if (!verdict) return null;
      return verdict === "verified"
        ? pass("The aggregate corporate-identity check passed.")
        : verdict === "unverified"
          ? warn("The employer could not be conclusively verified either way.")
          : fail("The aggregate corporate-identity check failed.");
    },
  ),

  // ── Pillar 5 · Physical presence & location (11) ─────────────────────────
  probe(
    "job-location-stated",
    "physical-presence",
    "Job location is stated",
    "The listing text.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      return /(?:location|office|based\s+in|located\s+in|work\s+location)\s*[:\-–]?/i.test(
        ctx.rawText,
      )
        ? pass("The listing states a job location.")
        : warn("No job location is stated in the listing text.");
    },
  ),
  probe(
    "office-address-given",
    "physical-presence",
    "A physical address is given",
    "The listing text.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      return /\b\d{1,4}[,\s][^.]{0,60}?(?:road|street|nagar|park|sector|layout|phase|tower|building|floor|campus|industrial\s+area)\b/i.test(
        ctx.rawText,
      )
        ? pass("The listing gives a street-level address.")
        : warn("No street-level office address appears in the listing.");
    },
  ),
  probe(
    "location-is-specific",
    "physical-presence",
    "Location is a specific place",
    "The listing text.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      return /(?:anywhere|any\s+location|all\s+india|pan\s+india|remote|work\s+from\s+home)\b/i.test(
        ctx.rawText,
      )
        ? warn("The listing does not commit to a specific work location.")
        : pass("The listing commits to a specific location.");
    },
  ),
  aiProbe(
    "location-matches-employer",
    "physical-presence",
    "Claimed location matches the employer's real address",
    "MCA registered office / Google Maps verified listing.",
    (ai) => {
      const lv = ai.locationVerification;
      if (!lv) return null;
      if (lv.verificationStatus === "verified" && lv.isExactMatch) {
        return pass(lv.reason || "The job location matches the company's verified address.");
      }
      if (lv.verificationStatus === "verified" && !lv.isExactMatch) {
        return pass(lv.reason || "The job location matches the company's location (hierarchical match).");
      }
      if (lv.verificationStatus === "unverified") {
        return fail(lv.reason || "The job location does not match the company's verified address.");
      }
      return warn("The employer's location could not be independently verified.");
    },
  ),
  aiProbe(
    "no-location-mismatch",
    "physical-presence",
    "No location mismatch flagged",
    "MCA registered office / Google Maps verified listing.",
    (ai) => {
      const lv = ai.locationVerification;
      if (!lv) return null;
      return lv.verificationStatus === "unverified"
        ? fail(
            `Job claims "${lv.jobLocationFromDescription}" but the company's verified address is "${ai.companyLocation?.fullAddress || "unknown"}".`,
          )
        : pass("No contradiction was found between the job location and company's verified address.");
    },
  ),
  aiProbe(
    "verified-address-available",
    "physical-presence",
    "An independent verified address exists",
    "MCA registered office / Google Maps verified listing.",
    (ai) => {
      const addr = ai.companyLocation?.fullAddress;
      if (!addr) return na("No independent address record was found for this employer.");
      return pass(`Independently verified address: ${addr}`);
    },
  ),
  aiProbe(
    "location-verification-is-sourced",
    "physical-presence",
    "Location verification names its source",
    "The verification source recorded by the investigation.",
    (ai) => {
      const lv = ai.locationVerification;
      if (!lv || !lv.reason) return null;
      return pass(`Location verification: ${lv.reason}`);
    },
  ),
  aiProbe(
    "location-claim-fact-checked",
    "physical-presence",
    "The location claim was fact-checked",
    "Claim-level verification of the listing's location assertion.",
    (ai) => {
      const claims = ai.claimVerifications;
      if (!claims || claims.length === 0) return null;
      const loc = claims.find((c) => c.claimType === "location");
      if (!loc) return na("No location claim was put through fact-checking.");
      return loc.verifiedStatus === "contradicted"
        ? fail(loc.details || "The location claim was contradicted by search.")
        : pass(loc.details || "The location claim was checked against search results.");
    },
  ),
  aiProbe(
    "physical-office-pillar-passed",
    "physical-presence",
    "Physical office check passed",
    "MCA registered office / Google Maps / commercial directories.",
    (ai) => {
      const pillar = ai.companyAudit?.physicalOffice;
      if (!pillar?.status) return null;
      if (pillar.status === "pass") return pass(pillar.details || "A physical office was confirmed.");
      return pillar.status === "warn"
        ? warn(pillar.details || "A physical office could only be partly confirmed.")
        : fail(pillar.details || "No physical office could be confirmed.");
    },
  ),
  probe(
    "no-remote-only-without-address",
    "physical-presence",
    "Not remote-only with no employer address",
    "The listing text.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      const remoteOnly = /(?:fully\s+remote|100\s*%\s*remote|work\s+from\s+home|wfh)/i.test(
        ctx.rawText,
      );
      const hasAddress = /\b\d{1,4}[,\s][^.]{0,60}?(?:road|street|nagar|park|sector|tower|building|floor)\b/i.test(
        ctx.rawText,
      );
      return remoteOnly && !hasAddress
        ? warn("The role is remote-only and no employer address is given, so the employer cannot be located.")
        : pass("The listing is not an addressless remote-only post.");
    },
  ),
  probe(
    "city-mentions-are-consistent",
    "physical-presence",
    "City references are consistent",
    "The listing text.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      const cities = [
        "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai",
        "Kolkata", "Pune", "Ahmedabad", "Gurgaon", "Gurugram", "Noida",
        "Chandigarh", "Jaipur", "Indore", "Bhopal", "Lucknow", "Kochi",
        "Coimbatore", "Nagpur",
      ].filter((c) => new RegExp(`\\b${c}\\b`, "i").test(ctx.rawText));
      const unique = [...new Set(cities.map((c) => c.toLowerCase()))];
      if (unique.length === 0) return na("No city is named in the listing.");
      return unique.length === 1
        ? pass(`The listing consistently refers to ${cities[0]}.`)
        : warn(`The listing names several cities (${unique.join(", ")}), which weakens the location claim.`);
    },
  ),

  // ── Pillar 6 · Contact & communication channels (10) ─────────────────────
  findingAbsent(
    "no-messaging-app-as-primary-contact",
    "contact-channels",
    "Not recruited primarily over WhatsApp/Telegram",
    "messaging-app-contact",
    "Recruitment does not run primarily through a messaging app.",
    "cybercrime.gov.in — WhatsApp/Telegram-only recruitment.",
  ),
  findingAbsent(
    "contact-phone-is-valid",
    "contact-channels",
    "Any listed phone number is valid",
    "invalid-phone-number",
    "Any phone number in the listing has a valid format and country code.",
    "ITU E.164 numbering plan.",
  ),
  findingAbsent(
    "no-multiple-disparate-phones",
    "contact-channels",
    "Phones are not a scatter of unrelated numbers",
    "multiple-phone-numbers",
    "The listing does not list an unusual number of unrelated contact numbers.",
    "cybercrime.gov.in — rotating contact numbers as an evasion tactic.",
  ),
  findingAbsent(
    "phone-region-matches-location",
    "contact-channels",
    "Phone region matches the stated location",
    "phone-location-mismatch",
    "The phone country/region matches the employer's stated location.",
    "ITU E.164 numbering plan versus the listing's claimed location.",
  ),
  aiProbe(
    "phone-not-reported-as-spam",
    "contact-channels",
    "Phone not reported as spam",
    "Truecaller spam reports and consumer complaint boards.",
    (ai) => {
      const phones = ai.companyAudit?.phoneVerification;
      if (!phones || phones.length === 0) {
        return na("No phone number was checked against spam databases.");
      }
      const flagged = phones.filter((p) => p.isTruecallerSpam);
      return flagged.length > 0
        ? fail(
            `Phone ${flagged[0]?.phoneNumber ?? ""} has been reported for spam or scam activity.`,
          )
        : pass("No listed phone number appears in spam reports.");
    },
  ),
  aiProbe(
    "phone-matches-company-location",
    "contact-channels",
    "Phone matches the company's location",
    "Comparison of the phone's country code against the employer's registered location.",
    (ai) => {
      const phones = ai.companyAudit?.phoneVerification;
      if (!phones || phones.length === 0) {
        return na("No phone number was available to compare against the employer's location.");
      }
      const mismatched = phones.filter((p) => !p.matchesCompanyLocation);
      return mismatched.length > 0
        ? warn(
            `${mismatched.length} of ${phones.length} listed numbers do not match the employer's stated location.`,
          )
        : pass("All listed phone numbers match the employer's location.");
    },
  ),
  findingAbsent(
    "contact-email-is-corporate",
    "contact-channels",
    "Contact email is corporate, not free",
    "free-email",
    "Contact is not handled through a free consumer email provider.",
    "CERT-In advisories on free-email-only recruitment contact.",
  ),
  findingAbsent(
    "contact-sender-domain-consistent",
    "contact-channels",
    "Sender domain is consistent with the claim",
    "sender-domain-mismatch",
    "The contact address does not contradict the claimed employer.",
    "Email-authentication guidance (SPF/DKIM/DMARC).",
  ),
  probe(
    "reachable-via-official-channel",
    "contact-channels",
    "Reachable through an official channel",
    "Presence of an official careers portal or ATS link.",
    (ctx) => {
      if (!hasText(ctx) && !ctx.pageFetched) return null;
      const haystack = `${ctx.rawText} ${ctx.pageData?.finalUrl ?? ""} ${ctx.hostname}`.toLowerCase();
      const onPlatform = containsAny(haystack, TRUSTED_JOB_PLATFORMS);
      const onAts = containsAny(haystack, TRUSTED_ATS);
      if (onAts) return pass("Applications run through a recognised applicant-tracking system.");
      if (onPlatform) {
        return pass("The listing is hosted on a recognised job platform with a complaint process.");
      }
      return warn(
        "No recognised careers portal or ATS link was found, so the application route cannot be vouched for.",
      );
    },
  ),
  probe(
    "listing-provides-contact-details",
    "contact-channels",
    "Listing provides some contact details",
    "The listing text.",
    (ctx) => {
      if (!hasText(ctx)) return null;
      const hasEmail = /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(ctx.rawText);
      const hasPhone = /(?:\+91[\s-]?)?[6-9]\d{9}\b/.test(ctx.rawText.replace(/[\s-]/g, ""));
      return hasEmail || hasPhone
        ? pass("The listing provides at least one contact detail.")
        : warn("The listing offers no way to contact the employer directly.");
    },
  ),

  // ── Pillar 7 · Reputation & fraud history (7) ────────────────────────────
  aiProbe(
    "no-scam-warnings-in-reviews",
    "reputation",
    "No scam warnings in employee reviews",
    "AmbitionBox, Glassdoor, Indeed and Google Reviews.",
    (ai) => {
      if (typeof ai.hasScamReviews !== "boolean") return null;
      if (!ai.hasScamReviews) return pass("No employee review raises a fraud warning.");
      const warnings =
        ai.employeeReviews
          ?.flatMap((r) => r.scamWarnings ?? [])
          .slice(0, 2) ?? [];
      return fail(
        warnings.length > 0
          ? `Employee reviews warn of fraud: ${warnings.join(" | ")}`
          : "Employee reviews contain fraud warnings.",
      );
    },
  ),
  aiProbe(
    "employee-rating-available",
    "reputation",
    "An employee rating was found",
    "AmbitionBox / Glassdoor aggregate ratings.",
    (ai) => {
      const score = ai.overallReviewScore;
      if (typeof score !== "number") {
        return na("No aggregate employee rating was found on the review sites.");
      }
      return pass(`Aggregate employee rating: ${score.toFixed(1)}/5.`);
    },
  ),
  aiProbe(
    "employee-rating-not-poor",
    "reputation",
    "Employee rating is not poor",
    "AmbitionBox / Glassdoor aggregate ratings.",
    (ai) => {
      const score = ai.overallReviewScore;
      if (typeof score !== "number") return null;
      return score >= 3
        ? pass(`Employee rating of ${score.toFixed(1)}/5 is not a red flag.`)
        : warn(`Employee rating of ${score.toFixed(1)}/5 is below average.`);
    },
  ),
  aiProbe(
    "no-scam-reports-on-forums",
    "reputation",
    "No scam reports on forums or complaint boards",
    "Reddit (r/developersIndia, r/india), Consumer Complaints, Quora.",
    (ai) => {
      const pillar = ai.companyAudit?.fraudDatabaseCheck;
      if (!pillar?.status) return null;
      if (pillar.status === "pass") {
        return pass(pillar.details || "No fraud reports were found for this employer.");
      }
      return pillar.status === "warn"
        ? warn(pillar.details || "Some unverified complaints were found.")
        : fail(pillar.details || "Fraud reports were found for this employer.");
    },
  ),
  aiProbe(
    "employee-reviews-pillar-passed",
    "reputation",
    "Employee-sentiment check passed",
    "AmbitionBox / Glassdoor / Indeed review analysis.",
    (ai) => {
      const pillar = ai.companyAudit?.employeeReviews;
      if (!pillar?.status) return null;
      if (pillar.status === "pass") return pass(pillar.details || "Employee sentiment is normal.");
      return pillar.status === "warn"
        ? warn(pillar.details || "Employee sentiment is mixed.")
        : fail(pillar.details || "Employee sentiment indicates problems.");
    },
  ),
  aiProbe(
    "fraud-history-pillar-passed",
    "reputation",
    "Fraud-history screening passed",
    "Public scam databases, forums and complaint boards.",
    (ai) => {
      const pillar = ai.companyAudit?.fraudDatabaseCheck;
      if (!pillar?.status) return null;
      return pillar.status === "pass"
        ? pass(pillar.details || "Fraud-history screening found nothing.")
        : fail(pillar.details || "Fraud-history screening raised a flag.");
    },
  ),
  aiProbe(
    "no-scam-signals-listed",
    "reputation",
    "No specific scam signals were recorded",
    "The scam signals surfaced by the investigation.",
    (ai) => {
      const signals = ai.scamSignals;
      if (!signals) return null;
      return signals.length === 0
        ? pass("The investigation recorded no specific scam signals.")
        : fail(`Scam signals recorded: ${signals.slice(0, 2).join(" | ")}`);
    },
  ),
];

/** Display order and labels for the pillars. */
export const PILLAR_ORDER: Array<{ pillar: CriteriaPillar; label: string }> = [
  { pillar: "digital-footprint", label: "Digital Footprint & Domain" },
  { pillar: "payment-demands", label: "Payment & Document Demands" },
  { pillar: "offer-realism", label: "Compensation & Offer Realism" },
  { pillar: "legal-identity", label: "Legal Identity & Registration" },
  { pillar: "physical-presence", label: "Physical Presence & Location" },
  { pillar: "contact-channels", label: "Contact & Communication" },
  { pillar: "reputation", label: "Reputation & Fraud History" },
];

/** The advertised size of the checklist. A test asserts CRITERIA.length matches. */
export const EXPECTED_CRITERIA_COUNT = 100;
