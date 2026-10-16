/**
 * Curated lists of platforms, shorteners, ATS providers, and impersonation targets.
 */

export const TRUSTED_JOB_PLATFORMS: readonly string[] = [
  "linkedin",
  "naukri",
  "indeed",
  "foundit",
  "internshala",
  "glassdoor",
  "instahyre",
  "wellfound",
  "cutshort",
  "hirist",
  "apna",
  "shine",
  // Official company career pages - these are employer-controlled and verified
  "metacareers", // Meta/Facebook careers
] as const;

export const SHORTENERS: readonly string[] = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "rb.gy",
  "tiny.cc"
] as const;

export const TRUSTED_ATS: readonly string[] = [
  "greenhouse.io",
  "lever.co",
  "workday",
  "myworkdayjobs.com",
  "smartrecruiters",
  "smartrecruiters.com",
  "ashbyhq",
  "ashbyhq.com",
  "zohorecruit",
  "zohorecruit.com",
  "icims",
  "icims.com",
  "taleo",
  "taleo.net",
  "successfactors",
  "successfactors.com"
] as const;

export const IMPERSONATION_TARGETS: readonly string[] = [
  "tcs",
  "infosys",
  "wipro",
  "hcl",
  "techmahindra",
  "cognizant",
  "accenture",
  "capgemini",
  "amazon",
  "google",
  "microsoft",
  "flipkart",
  "zoho",
  "ibm",
  "deloitte",
  "paytm",
  "swiggy",
  "zomato",
  "reliance",
  "adani",
  "tata",
  "ltimindtree"
] as const;

export const FREE_HOST_OR_FORMS: readonly string[] = [
  "forms.gle",
  "docs.google.com/forms",
  "wixsite.com",
  "blogspot.com",
  "weebly.com",
  "t.me",
  "wa.me",
  "linktr.ee",
  "notion.site",
  "carrd.co",
  "sites.google.com",
  "telegr.am",
  "api.whatsapp.com",
  "chat.whatsapp.com"
] as const;

export const SUSPICIOUS_TLDS: readonly string[] = [
  ".xyz",
  ".top",
  ".click",
  ".work",
  ".site",
  ".online",
  ".buzz",
  ".icu",
  ".cyou",
  ".shop",
  ".live",
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq"
] as const;

export const DOMAIN_KEYWORDS: readonly string[] = [
  "job",
  "jobs",
  "career",
  "careers",
  "hiring",
  "apply",
  "vacancy",
  "recruit",
  "india",
  "2025",
  "2026"
] as const;

// === OPTIMIZED SET LOOKUPS (O(1) instead of O(n)) ===
export const TRUSTED_JOB_PLATFORMS_SET = new Set(TRUSTED_JOB_PLATFORMS);
export const SHORTENERS_SET = new Set(SHORTENERS);
export const TRUSTED_ATS_SET = new Set(TRUSTED_ATS);
export const IMPERSONATION_TARGETS_SET = new Set(IMPERSONATION_TARGETS);
export const FREE_HOST_OR_FORMS_SET = new Set(FREE_HOST_OR_FORMS);
export const SUSPICIOUS_TLDS_SET = new Set(SUSPICIOUS_TLDS);
export const DOMAIN_KEYWORDS_SET = new Set(DOMAIN_KEYWORDS);
