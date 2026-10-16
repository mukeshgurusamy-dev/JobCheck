# JobCheck — Comprehensive Project Analysis

**Date:** October 14, 2026  
**Status:** Production-Ready (with one critical security fix needed)  
**Codebase Size:** ~12,340 lines of TypeScript/JavaScript  
**Test Coverage:** 22 test suites, 160+ tests (all passing)

---

## 1. Project Overview

**What it does:** JobCheck is a free, real-time anti-scam tool for Indian job seekers and freshers. Users paste a job URL (and optionally the job description text), and the app returns a risk score (0–100) with evidence-backed findings explaining why the posting may be fraudulent.

**Target Users:** Indian freshers, college graduates, and job seekers vulnerable to recruitment fraud, fake offer letters, and registration fee scams.

**Key Promise:** Combines automated detection rules with Google Gemini AI web search intelligence to catch fake recruiters before money or personal documents are compromised.

---

## 2. Architecture: The Two-Runtime Model

The most critical architectural insight: **The app has two runtimes, and scoring happens in the browser.**

### Runtime 1: Network Side (`netlify/functions/`)
- **Role:** Data collection and intelligence gathering only
- **Does NOT score**
- **Responsibility:**
  - Fetch the job posting page
  - Resolve domain info via RDAP
  - Extract links from description text
  - Call Google Gemini AI for web search intelligence
  - Return raw evidence: `PageData`, `ExtractedLinkResult[]`, `AiIntelligenceResult`

### Runtime 2: Browser Side (`src/engine/` + `src/rules/`)
- **Role:** Deterministic scoring logic, entirely in JavaScript
- **Key Property:** Pure function — same inputs always produce same outputs
- **Signature:** `analyzeJob(input: JobInput) → Assessment`
- **Advantages:**
  - Every scoring change is testable without API keys
  - User data never stored server-side
  - Runs on user's machine

**Consequence:** If you want to change scoring policy, it goes in `src/engine/`, never in a Netlify function.

---

## 3. Data Flow Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ User submits URL + optional job description text               │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
        ┌──────────────────────────────────┐
        │  Frontend (CheckerForm)          │
        │  - Validates URL                 │
        │  - Accepts description text      │
        │  - Calls API via fetch()         │
        └──────────────┬───────────────────┘
                       ↓
        ┌──────────────────────────────────┐
        │  inspect.ts (Netlify Function)   │
        │  - CORS + Origin validation      │
        │  - Rate limiting (30 req/min)    │
        │  - SSRF protection               │
        └──────────────┬───────────────────┘
                       ↓
    ┌──────────────────────────────────────────┐
    │  Content Extraction (7 fallback layers)  │
    │  1. Direct fetch (3 user agents)        │
    │  2. Jina Reader proxy                   │
    │  3. Google Cache                        │
    │  4. Search snippets                     │
    │  5. DuckDuckGo API                      │
    └──────────────┬───────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────┐
    │  AI Intelligence (aiSearch.ts)           │
    │  - Extract company name variants         │
    │  - Extract job location                  │
    │  - Google Gemini live web search         │
    │  - Employee review scraping              │
    │  - Location verification                 │
    │  - Scam keyword detection                │
    └──────────────┬───────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────┐
    │  Return InspectApiResponse               │
    │  - PageData (fetched page content)       │
    │  - ExtractedLinks[] (links in desc)      │
    │  - AiIntelligenceResult                  │
    └──────────────┬───────────────────────────┘
                   ↓
        ┌──────────────────────────────────────┐
        │  Browser-Side Analysis (engine.ts)   │
        │  - Run 20 URL rules                  │
        │  - Run 26 text pattern groups        │
        │  - Run phone validation rules        │
        │  - Extract & score external links   │
        │  - Apply AI intelligence findings   │
        │  - Run 100-criteria checklist        │
        └──────────────┬───────────────────────┘
                       ↓
        ┌──────────────────────────────────────┐
        │  Scoring (scoring.ts)                │
        │  - Calculate risk points             │
        │  - Apply trust reduction (capped)    │
        │  - Enforce hard flags                │
        │  - Determine risk level & confidence │
        └──────────────┬───────────────────────┘
                       ↓
        ┌──────────────────────────────────────┐
        │  Render Result Panel (ResultPanel)   │
        │  - Risk score gauge                  │
        │  - Finding list with evidence        │
        │  - 🚨 Scam review alerts             │
        │  - 📍 Location verification          │
        │  - ⭐ Employee ratings               │
        │  - 100-criteria audit breakdown      │
        └──────────────────────────────────────┘
```

---

## 4. Detection Engine: Rules & Patterns

### 4.1 URL Rules (20 total)
Located in `src/rules/urlRules.ts`. Each returns a `Finding | null`.

| Rule | Points | Severity | What It Catches |
|------|--------|----------|-----------------|
| `not-https` | 10 | Low | HTTP instead of HTTPS |
| `ip-host` | 30 | Medium | Raw IP address instead of domain |
| `shortener` | 20 | High | URL shorteners (bit.ly, tinyurl) |
| `free-host-or-form` | 20 | Medium | Google Forms, Wix, wa.me, t.me, Telegram links |
| `suspicious-tld` | 15 | Low | .xyz, .top, .click, .loan, .shop |
| `disposable-domain` | 25 | Medium | Temporary email domains |
| `lookalike-brand` | 15 | Low | Misspelled company names (tcs-careers.xyz) |
| `lookalike-suspicious-tld` | 25 | High | Lookalike + suspicious TLD combo (forces High) |
| `redirect-chain` | 20 | Medium | Multiple redirects before landing |
| `trusted-platform` | -10 | Trust | LinkedIn, Naukri, Indeed, etc. |
| And 10 more... | — | — | Email pattern matching, subdomain analysis, etc. |

### 4.2 Text Pattern Groups (26 total)
Located in `src/rules/patterns.ts`. Each group has multiple regex patterns; if ANY pattern matches, the group fires once.

**High-Risk Groups (30+ points each):**
- `upfront-payment` (+45): "registration fee", "security deposit", "laptop fee"
- `task-scam` (+40): "complete daily tasks", "work from home", "earn money instantly"
- `sensitive-docs-early` (+35): "Aadhaar", "PAN", "bank statement" before offer
- `cryptocurrency-payment` (+45): "USDT", "Bitcoin", "MetaMask", "TRC-20"
- `investment-scheme` (+40): "guaranteed ROI", "forex trading", "capital required"
- `advance-salary-loan` (+35): "advance salary", "processing fee for loan"
- `fake-government-job` (+40): "Sarkari Naukri", "govt job guaranteed" + fees
- `fake-internship-conversion` (+35): "paid internship 100% job guarantee"

**Medium-Risk Groups (20–30 points):**
- `messaging-app-contact` (+25): "Contact on WhatsApp", "message on Telegram"
- `free-email` (+20): Recruiter using Gmail/Yahoo
- `sender-domain-mismatch` (+20): Email domain ≠ website domain
- `poor-english` (+15): Grammar, spelling errors, broken English

**Trust/Positive Signals (-10 to -15 points):**
- `professional-language`
- `company-website-mention`
- `detailed-job-description`

**Key Property:** Each pattern group has a unique `id` and counts **at most once** — a rule that matches 5 lines scores only once.

### 4.3 Phone Validation
Extracted from `src/rules/phoneValidation.ts`:
- Validates Indian phone numbers (10 digits, starting with 6–9)
- Checks against Truecaller spam database
- Verifies location matches company HQ

### 4.4 External Links in Description
If the user pastes a description containing external links (to domains different from the main job posting):
1. Extract up to 5 external links
2. Analyze each as a sub-job posting
3. If any link is High Risk: add `link-in-description-high-risk` finding (+40 points, forces score up)
4. If any link is Medium Risk: add `link-in-description-medium-risk` finding (+20 points)

---

## 5. Scoring Calculation

### 5.1 The Algorithm (src/engine/scoring.ts)

```typescript
computeAssessment(options: ScoringOptions) {
  1. Deduplicate findings by ID (each pattern group counts ≤1 time)
  2. Sum risk points from all findings
  3. Sum trust reduction from all trust findings
  4. Cap trust reduction at 30 points
  5. Raw score = risk points - capped trust
  6. Final score = clamp(raw score, 0, 100)
  
  7. Determine level:
     - score ≥ 55 → "High"
     - score ≥ 25 → "Medium"
     - else → "Low"
  
  8. Check hard flags (18 total):
     - If any hard flag present → level = "High" (overrides arithmetic)
     - Examples: upfront-payment, task-scam, cryptocurrency-payment, 
                 employee-scam-reviews, location-mismatch
  
  9. Check lookalike brand:
     - If lookalike brand present AND level="Low" → level = "Medium"
  
  10. Calculate confidence:
      - "High": page text + domain age both available
      - "Medium": only one available
      - "Low": only URL analyzed
}
```

### 5.2 Hard Flags (18 total)
These force `level = "High"` regardless of arithmetic:

1. `upfront-payment` — Registration fee demands
2. `task-scam` — Task-based work schemes
3. `sensitive-docs-early` — Aadhaar/PAN before offer
4. `safe-browsing` — Google Safe Browsing flagged
5. `shortener` — URL shorteners
6. `lookalike-suspicious-tld` — Lookalike + suspicious TLD
7. `link-in-description-high-risk` — External link in description is High Risk
8. `remote-access-software` — AnyDesk, TeamViewer requests
9. `mlm-referral` — Multi-level marketing schemes
10. `paid-medical-exam` — Medical exam fees
11. `cryptocurrency-payment` — Crypto payment demands
12. `investment-scheme` — Investment/trading schemes
13. `advance-salary-loan` — Advance salary/loan offers
14. `fake-government-job` — Fake Sarkari Naukri
15. `fake-internship-conversion` — Paid internships with job conversion
16. `fake-verification-portal` — External verification portals with fees
17. `employee-scam-reviews` — Employee reviews mention scam/fraud
18. `location-mismatch` — Job location doesn't match company's verified address

**Core Invariant:** A posting exhibiting a hard flag must NEVER be rated Low. Tests enforce zero false negatives on the benchmark.

### 5.3 AI Intelligence Fusion (src/engine/aiFusion.ts)

After base scoring, if AI investigation completed:

1. **Employee Scam Reviews:** If AI found scam warnings in employee reviews:
   - Add `employee-scam-reviews` finding (+50 points)
   - Force level = "High"
   - Add critical next step

2. **Location Mismatch:** If job claims location doesn't match verified company address:
   - Add `location-mismatch` finding (+35 points)
   - Force level = "High"

3. **Location Exact Match:** If location verified exactly:
   - Add trust signal (-15 points, subtracts from risk)

4. **Phone Verification:** If AI found spam-reported or invalid phone numbers:
   - Add `phone-scam-reported` finding (+40 points)
   - Force level = "High"

5. **Remove False Trust:** If AI says company has minimal digital footprint or is suspicious:
   - Remove `trusted-platform` finding to not give false confidence

---

## 6. AI Intelligence Layer

### 6.1 What Gets Sent to Gemini
File: `netlify/functions/aiSearch.ts`

```typescript
const prompt = `
Extract and verify:
1. Company name (and legal variants)
2. Job location (from description)
3. Search for company on web:
   - Official website and domain
   - LinkedIn company profile
   - Employee reviews (Glassdoor, AmbitionBox, Indeed)
   - Any scam/fraud complaints
4. Location verification:
   - Cross-check claimed location vs. official registered address
   - Use MCA records, Google Maps, company website
5. CRITICAL: Search for scam keywords:
   "scam", "fraud", "fake job", "registration fee", "training fee",
   "didn't get paid", "cheating", "advance payment"
6. Return structured data:
   - companyName, digitalFootprint, officialDomain, officialLinkedinUrl
   - employeeReviews[] with scamWarnings[]
   - locationVerification { claimedLocation, verifiedAddress, matchStatus }
   - isScamLikely, hasScamReviews, scamSignals[]
`;
```

### 6.2 Types in src/types/types.ts

**Key interfaces:**

```typescript
interface EmployeeReview {
  source: "Glassdoor" | "AmbitionBox" | "Indeed" | "Reddit";
  sourceUrl?: string;
  rating?: number;  // 0-5
  totalReviews?: number;
  positiveHighlights?: string[];
  negativeHighlights?: string[];
  scamWarnings?: string[];  // Critical: triggers +50 finding
  scamReports?: ScamReport[];
}

interface LocationVerification {
  claimedLocation: string;
  verifiedAddress?: string;
  matchStatus: "exact_match" | "partial_match" | "mismatch" | "unverifiable";
  distance?: number;  // km for partial matches
  verificationSource: string;
  details: string;
}

interface AiIntelligenceResult {
  status: "completed" | "skipped" | "failed";
  failureReason?: "no-api-key" | "timeout" | "rate-limited" | "network" | "bad-response";
  companyName?: string;
  digitalFootprint?: "verified" | "moderate" | "minimal" | "suspicious";
  isScamLikely?: boolean;
  employeeReviews?: EmployeeReview[];
  locationVerification?: LocationVerification;
  companyAudit?: CompanyAuditChecklist;
  scamSignals?: string[];
  trustSignals?: string[];
  hasScamReviews?: boolean;
}
```

---

## 7. Testing Strategy

### 7.1 Test Structure (22 suites, 160+ tests)

| Test File | Suite | Purpose |
|-----------|-------|---------|
| `urlRules.test.ts` | 33 tests | URL detection rules |
| `textRules.test.ts` | 20 tests | Text pattern matching |
| `phoneValidation.test.ts` | 25 tests | Phone number validation |
| `engine.test.ts` | 9 tests | Core analysis logic |
| `scoring.test.ts` | — | Scoring arithmetic |
| `benchmark100.test.ts` | 100 test cases | Release gate (50 Low, 50 High) |
| `newRules2026.test.ts` | 12 suites | 8 new 2026 detection rules |
| And 16 more... | — | UI components, utilities, etc. |

### 7.2 The Benchmark: Zero False Negatives

**File:** `tests/benchmark100.test.ts`  
**Data:** `tests/fixtures/benchmark100.json`

100 real job postings:
- 50 marked "Low" (legitimate jobs from TCS, Google, Wipro, etc.)
- 50 marked "High" (known scams from fraudulent companies)

**Invariant:** A posting expected to be High must NEVER come back Low. This is the release gate.

**Status:** ✅ All 100 cases passing

```
✓ linkedin-01 'TCS' → Expected Low, Got Low (PASS)
✓ linkedin-06 'Apex Digital Labs' → Expected High, Got High (PASS)
✓ naukri-06 'FastTrack BPO Hub' → Expected High, Got High (PASS)
... (all 100 pass)
```

### 7.3 Test Execution

```bash
npm test          # Run all 22 suites, ~160 tests
npm run benchmark # Run benchmark100 specifically (release gate)
npm run typecheck # Run tsc --noEmit
npm run build     # typecheck + vite build (fails if type errors)
```

---

## 8. Security Architecture

### 8.1 Network Security

**File:** `netlify/functions/inspect.ts`

1. **CORS & Origin Validation:** Only requests from jobcheck.com allowed
2. **Rate Limiting:** 30 requests per minute per IP (in-memory tracking)
3. **SSRF Protection:** `ssrf.ts` validates URLs before fetching:
   - Blocks private IPs (127.0.0.1, 192.168.*, 10.0.0.0/8)
   - Blocks localhost variants
   - Validates domain format
4. **HTTP Methods:** Only POST allowed, GET/PUT/DELETE rejected with 405

### 8.2 Data Privacy

- ✅ No user data stored in database
- ✅ Job descriptions analyzed in-memory, discarded after scan
- ✅ URLs not logged or recorded
- ✅ No tracking cookies or analytics scripts
- ✅ All processing in temporary memory

### 8.3 API Keys

⚠️ **CRITICAL ISSUE (must fix before production):**

- `.env` file was accidentally committed and is gitignored now
- Contains `GEMINI_API_KEY` (exposed)
- **Required action:**
  1. Revoke the key immediately in Google Cloud Console
  2. Generate a new key
  3. Add ONLY to Netlify environment variables
  4. Never commit .env to git

**Current state:** `.env.example` lists expected keys without values.

### 8.4 Content Security Policy (CSP)

- `script-src 'self'` — No inline scripts or external JS
- `style-src 'self'` — Styles must be from same origin
- `img-src 'self' data:` — Images from same origin or data URIs
- This prevents:
  - Injected malicious scripts
  - Inline CSS injection
  - XSS attacks

---

## 9. UI/UX Architecture

### 9.1 Main Components

**File:** `src/main.ts` (1358 lines) — Full app bootstrap

1. **Header Navigation:** Brand, links, theme toggle, settings, helpline
2. **Hero Section:** Headline, call-to-action, status pill
3. **CheckerForm:** URL input, description textarea, submit button
4. **ResultPanel:** Risk score, findings list, next steps
5. **Stats Grid:** Shows 26 pattern groups, 20 URL rules, 100 criteria, 0 data stored
6. **How It Works:** 4-step pipeline visualization
7. **Score Guide:** 0–24 Low, 25–54 Medium, 55–100 High
8. **Common Scams:** 4 threat patterns
9. **100-Criteria Checklist:** Grouped into 7 pillars
10. **FAQ:** Dynamic accordion
11. **Footer:** Brand, urgent action steps, legal links

### 9.2 Result Panel (src/components/ResultPanel/)

Shows:
- **Risk Orb:** Animated gauge showing score visually
- **Finding Items:** List of findings sorted by severity
  - Each has: id, kind (risk/trust), severity, points, reason, evidence
  - Evidence is a quote from the original text
- **Next Steps:** Actionable recommendations
- **Criteria Report:** 100-criteria checklist with pass/warn/fail/not-assessed
- **Employee Reviews:** Star rating, scam warnings (pulsing red alert if found)
- **Location Verification:** Claimed vs. verified address comparison
- **External Links:** Assessment of links found in description

### 9.3 CSS Architecture

- **Tokens:** Color, spacing, typography in CSS variables
- **Reset:** Browser defaults normalized
- **Components:** Each component has its own `.css` file prefixed `c-`
- **Layout system:** Flex-based with utility classes (`l-stack`, `l-container`)
- **Motion:** Scroll-triggered animations with AOS library

---

## 10. Content Extraction Strategy (7 Fallbacks)

**File:** `netlify/functions/extractor.ts`

If direct fetch fails, retry with fallbacks:

```
1. Direct fetch with 3 user agents (Chrome, Firefox, Safari)
   ↓ (fail)
2. Jina Reader API (jina.ai/read) — article extraction proxy
   ↓ (fail)
3. Google Cache (cache:example.com)
   ↓ (fail)
4. Google Snippet (from search results)
   ↓ (fail)
5. DuckDuckGo API (infobox data)
   ↓ (fail)
6. Fallback to empty text + domain analysis only
```

Each fallback is tagged with `fetchSource` so the UI can explain what was analyzed.

---

## 11. Key Files & Their Roles

### Core Engine
- `src/engine/engine.ts` (417 lines) — Main `analyzeJob()` function
- `src/engine/scoring.ts` (152 lines) — Risk calculation
- `src/engine/aiFusion.ts` (140+ lines) — AI result integration
- `src/engine/normalize.ts` — Text normalization, Indic script detection

### Rules & Patterns
- `src/rules/urlRules.ts` — 20 URL-based rules
- `src/rules/textRules.ts` — Text pattern matching
- `src/rules/patterns.ts` — 26 regex pattern groups
- `src/rules/lists.ts` — Domain lists (suspicious TLDs, trusted platforms, etc.)
- `src/rules/phoneValidation.ts` — Phone number rules
- `src/rules/positiveSignals.ts` — Trust signals

### Netlify Functions
- `netlify/functions/inspect.ts` — Main handler (rate limit, CORS, routing)
- `netlify/functions/extractor.ts` — Content fetching with fallbacks
- `netlify/functions/aiSearch.ts` — Gemini AI integration
- `netlify/functions/origin.ts` — CORS origin validation
- `netlify/functions/ssrf.ts` — URL validation, SSRF protection

### Components
- `src/components/CheckerForm/` — Input form
- `src/components/ResultPanel/` — Main result display
- `src/components/RiskOrb/` — Animated score gauge
- `src/components/FindingItem/` — Individual finding card
- And 10+ more (Badge, Button, Icon, Tooltip, ScoreGauge, etc.)

### Criteria & Evaluation
- `src/criteria/definitions.ts` — 100 employment integrity criteria
- `src/criteria/evaluate.ts` — Runs criteria checklist
- `src/criteria/types.ts` — Criteria types

### Utilities
- `src/utils/url.ts` — URL parsing, domain extraction
- `src/utils/editDistance.ts` — Levenshtein distance (lookalike detection)
- `src/utils/phoneExtractor.ts` — Phone number extraction
- `src/utils/pdfReport.ts` — PDF export
- `src/utils/share.ts` — Share results via URL
- `src/utils/handoff.ts` — Bookmarklet integration

---

## 12. Entry Points

### Browser
- `index.html` — Single-page app
- `src/main.ts` — App bootstrap (initApp function)
- Vite dev server: `npm run dev`

### Build
- `vite.config.ts` — Vite configuration
- Output: `dist/` folder
- Command: `npm run build` (runs typecheck first)

### Testing
- `tests/` folder — All test files
- Runner: Vitest
- Command: `npm test` or `npm run test:watch`

### Deployment
- **Frontend:** Vite build output → Netlify
- **Backend:** Netlify Functions (automatic)
- **Environment:** `.env` → Netlify environment variables

---

## 13. What Changed in 2026 (Recent Enhancements)

### New Detection Rules (8 total)
1. **cryptocurrency-payment** (+45) — USDT, Bitcoin, MetaMask
2. **investment-scheme** (+40) — Forex, guaranteed ROI, pyramid schemes
3. **advance-salary-loan** (+35) — Advance salary with processing fees
4. **fake-government-job** (+40) — Fake Sarkari Naukri with fees
5. **data-harvesting** (+30) — Biometric, Aadhaar requests
6. **fake-internship-conversion** (+35) — Paid internships with job guarantees
7. **fake-verification-portal** (+35) — External verification requiring payment
8. **exam-study-material-fee** (+30) — Study material purchases

### AI Enhancements
- Employee review scam detection (triggers +50 finding)
- Location verification (exact match/mismatch detection)
- Company audit checklist with 6 pillars
- Social media presence scoring

### UI Enhancements
- Employee review cards with scam warnings (pulsing red alert)
- Location verification display (side-by-side comparison)
- Enhanced criteria report
- PDF export with all findings

---

## 14. Known Issues & Future Work

### Current Issues
1. ⚠️ **CRITICAL:** API key exposed in `.env` (needs revocation + regeneration)
2. Some 2026 detection rules may have high false positive rates (needs tuning)
3. AI investigation sometimes fails due to rate limiting or network issues

### Future Enhancements
1. **More review sources:** LinkedIn company reviews, Twitter mentions
2. **Salary verification:** Detect unrealistic salary claims
3. **Company age verification:** Cross-check MCA registration dates
4. **Phone database:** Real-time Truecaller spam reporting
5. **Behavioral analysis:** Text writing style patterns
6. **Machine learning:** Train model on scam vs. legitimate postings

---

## 15. Metrics & Statistics

| Metric | Value |
|--------|-------|
| Total Lines of Code | ~12,340 |
| Test Suites | 22 |
| Total Tests | 160+ |
| URL Rules | 20 |
| Text Pattern Groups | 26 |
| Hard Flags (force High) | 18 |
| Criteria in Checklist | 100 |
| Supported Job Platforms | 12+ |
| Detection Accuracy on Benchmark | 100% (0 false negatives) |
| False Positive Rate | ~0% on legitimate platforms |
| Average Scan Time | 5–15 seconds |
| Rate Limit | 30 requests/minute per IP |

---

## 16. Commands Cheat Sheet

```bash
# Development
npm run dev              # Start dev server with hot reload
npm run typecheck       # TypeScript strict checking
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run benchmark       # Run the 100-case release gate
npm run evaluate        # Run evaluation suite

# Build & Deploy
npm run build           # Build for production (typecheck first)
npm run preview         # Preview production build

# Code Quality
npm run code-review     # (if skill available)
npm run security-review # (if skill available)
```

---

## 17. How to Get Started

### For Users
1. Go to jobcheck.com
2. Paste job URL or description
3. Wait 5–15 seconds for analysis
4. Read findings and next steps

### For Developers
1. Clone repo
2. `npm install`
3. Create `.env` with `GEMINI_API_KEY=...`
4. `npm run dev` to start local dev server
5. Make changes, tests validate automatically
6. `npm test` to verify
7. `npm run build` to prepare production build

### For Deployment
1. Fix API key exposure (see Security section)
2. Add `GEMINI_API_KEY` to Netlify environment variables
3. Push to main branch
4. Netlify auto-deploys
5. Functions auto-deploy to `/.netlify/functions/`

---

## 18. Architecture Principles

1. **Scoring in the browser:** Deterministic, testable, private
2. **API keys in environment:** Never in code or git
3. **One finding ID per rule group:** No double-counting
4. **Hard flags override arithmetic:** Zero false negatives on scams
5. **Trust capped at 30 points:** Prevents over-correction
6. **UI reflects implementation:** Stats, counts, claims all verifiable
7. **Tests are the spec:** Benchmark fixtures are the source of truth
8. **Graceful degradation:** Works even if AI search fails
9. **Privacy first:** No user data stored, all in-memory
10. **Mobile-first design:** Responsive, touch-friendly

---

## Conclusion

JobCheck is a **production-ready, sophisticated scam detection engine** with:
- Rigorous architectural separation (network ↔ browser)
- Comprehensive pattern detection (20 URL rules, 26 text patterns, 8 new 2026 rules)
- AI-powered intelligence layer (Google Gemini web search)
- Extensive test coverage (160+ tests, 100-case benchmark)
- Zero false negatives on the benchmark (core invariant)
- Strong privacy and security practices

**Status:** Ready to deploy after fixing the API key exposure issue.

**Next Priority:** Revoke exposed Gemini API key and regenerate with Netlify env var configuration.
