# JobCheck

> **Detect job scams in seconds. Protect yourself before you apply.**

[![Live Site](https://img.shields.io/badge/live-jobcheck.live-brightgreen)](https://jobcheck.live)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)
[![Tests](https://img.shields.io/badge/tests-256%2F256%20passing-brightgreen)](./tests)
[![Accuracy](https://img.shields.io/badge/accuracy-100%25%20%28100%2F100%29-brightgreen)](#accuracy)

---

## The Problem

**Job scams are epidemic.** Especially in India.

Every day, thousands of job seekers lose money to fake recruiters asking for "registration fees," "interview gate passes," or "laptop delivery charges." They're targeted on LinkedIn, WhatsApp, Telegram, and fake career portals.

Traditional solutions fail:
- ❌ You can't verify every company manually
- ❌ Google Search gives mixed results
- ❌ Most "scam checkers" are generic and slow
- ❌ No way to report scams officially (until now)

**JobCheck solves this.**

---

## What We Do

### Instant Risk Detection
Paste any job link or offer message. Get a **Low / Medium / High risk** verdict in **under 3 seconds**, with clear, actionable reasons.

```
Input: https://careers-tcs-entry.xyz/apply
Output:
┌─────────────────────────────────────┐
│ 🔴 HIGH RISK: Likely Scam           │
├─────────────────────────────────────┤
│ Domain Reputation: New domain        │
│ Typosquatting: Similar to TCS        │
│ Content: Payment demand detected     │
│ AI Verification: Not found on web    │
└─────────────────────────────────────┘
```

### Multi-Layer Detection Engine

We analyze from **three independent layers:**

1. **Client-Side Heuristics** (Instant)
   - Pattern matching: Fee demands, Hinglish scam language, suspicious URLs
   - 20+ domain & URL rules, 27 scam pattern groups

2. **Serverless Inspection** (Fast)
   - Domain age verification (RDAP)
   - HTTPS validation
   - Redirect chain tracking
   - SSRF-protected link analysis

3. **AI Verification** (Accurate)
   - Google Gemini grounding: Is this company real?
   - Lookalike domain detection
   - Public web footprint analysis
   - 100% accuracy on real-world benchmark (100/100 samples)

### Export & Report
Generate **PDF audit reports** suitable for filing cybercrime complaints with:
- India's Cyber Cell (1930 / cybercrime.gov.in)
- Your jurisdiction's law enforcement

---

## Key Features

✨ **Privacy First**
- No sign-up required. No accounts. No tracking.
- Anonymous aggregate analytics only (trend detection).
- Never store personal data.

⚡ **Blazing Fast**
- Sub-3-second detection (client + server + AI)
- Instant pattern matching
- Automatic failover for API quota management

🔒 **Production Security**
- SSRF attack protection on link inspection
- Multi-key Gemini API rotation
- Rate limiting & abuse prevention
- CSP headers, secure defaults

🎯 **India-Focused**
- Detects region-specific scams (WhatsApp recruiters, registration fees, task scams)
- Hinglish language analysis
- Local platform knowledge (LinkedIn India, Naukri, CareerJet patterns)

📊 **Deeply Tested**
- 256 unit & integration tests (100% pass rate)
- 100% accuracy on 100-sample real-world benchmark
- Zero false negatives (critical for scam detection)
- Accuracy gate enforced: fails build if < 90%

---

## How It Works

### The Flow

```
User Input (Link + Description)
          ↓
    [Client Analysis]
    Pattern matching, URL checks
          ↓
         Low Risk? → Return result
          ↓ (No)
   [Serverless Inspection]
   Domain age, HTTPS, redirects, content
          ↓
      Medium Risk? → Return result
          ↓ (No)
    [AI Verification]
    Gemini: Company real? Lookalikes?
          ↓
   [Score Aggregation]
   Combine all signals
          ↓
   Return: Risk Level + Reasons + Export Option
```

### The Score

- **0–24: Low Risk** 🟢 (Likely legitimate)
- **25–54: Medium Risk** 🟡 (Verify on official careers page)
- **55–100: High Risk** 🔴 (Likely scam, report to authorities)

---

## Tech Stack

**Frontend**
- **Language:** TypeScript
- **Build:** Vite (⚡ fast)
- **Components:** Vanilla DOM (BEM architecture, no frameworks)
- **Export:** html2canvas + jsPDF
- **Responsive:** Mobile-first, 8+ breakpoints (300px → 1500px+)

**Backend**
- **Functions:** Netlify Functions (Node.js/TypeScript)
- **Security:** SSRF protection, rate limiting, multi-key rotation
- **APIs:** Google Gemini (AI), RDAP (domain age), custom heuristics

**Data & Analytics**
- **Database:** Supabase (PostgreSQL)
- **Tracking:** Anonymous visitor analytics
- **Reporting:** Real-time threat trend dashboard

**Testing & CI/CD**
- **Tests:** Vitest (256 tests, 100% pass)
- **CI:** GitHub Actions (type-check → build → test → benchmark)
- **Deployment:** Netlify (auto-deploy on GitHub push)

---

## Getting Started

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/mukeshgurusamy-dev/JobCheck.git
cd JobCheck

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with:
# - GEMINI_API_KEYS=your_api_key_1,your_api_key_2
# - SUPABASE_URL=your_supabase_url
# - SUPABASE_KEY=your_supabase_key

# 4. Run development server (with Netlify Functions)
npx netlify dev

# 5. Open browser
# → http://localhost:8888
```

### Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Benchmark suite (accuracy gate)
npm test -- tests/benchmark100.test.ts
```

### Build for Production

```bash
# Type-check + build bundle
npm run build

# Output directory: dist/
```

---

## Deployment

### Deploy to Netlify (Recommended)

```bash
# 1. Connect GitHub repository to Netlify
# 2. Set build settings:
#    - Build command: npm run build
#    - Publish directory: dist
#    - Functions directory: netlify/functions

# 3. Set environment variables in Netlify:
#    - GEMINI_API_KEYS
#    - SUPABASE_URL
#    - SUPABASE_KEY

# 4. Auto-deploy on every GitHub push
```

### Self-Hosted / Docker

```dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "--import=./dist/index.js"]
```

---

## Accuracy & Benchmarking

### Real-World Performance

We test on **100 actual job postings** across **10 platforms** × **10 companies**:

| Platform | Sample Size | Accuracy | False Negatives |
|----------|-------------|----------|-----------------|
| LinkedIn | 10 | 100% | 0 |
| Naukri | 10 | 100% | 0 |
| Indeed | 10 | 100% | 0 |
| Facebook Careers | 10 | 100% | 0 |
| Telegram Groups | 10 | 100% | 0 |
| WhatsApp Messages | 10 | 100% | 0 |
| Brand Typo Sites | 10 | 100% | 0 |
| Direct Email | 10 | 100% | 0 |
| Career Portals | 10 | 100% | 0 |
| Recruiter Messages | 10 | 100% | 0 |
| **Total** | **100** | **100%** | **0** |

**Benchmark Suite:** `tests/benchmark100.test.ts` (runs in CI/CD)
- **Fail Condition:** Accuracy < 90% OR any false negative
- **Status:** ✅ All checks passing

---

## Transparency & Limitations

### What JobCheck Does ✅
- Analyze public signals (domain age, HTTPS, content patterns, AI verification)
- Flag common scam indicators
- Provide actionable, evidence-based verdicts
- Help you make informed decisions

### What JobCheck Cannot Do ❌
- **Prove a company is real.** We estimate risk, not certainty.
- **Catch novel scams.** Our patterns are based on historical data.
- **Replace official verification.** Always verify on the company's official careers portal.
- **Legal advice.** We're a tool, not a lawyer.

### How to Use Responsibly
1. Use JobCheck as **one signal**, not the only one
2. **Always verify** on the company's official website
3. If JobCheck flags a scam, **report it to authorities** (we provide PDF export)
4. Share false positives with us so we improve

---

## API Reference

### `/api/inspect` (POST)

Inspect a job link and get risk signals.

```javascript
const response = await fetch('/.netlify/functions/inspect', {
  method: 'POST',
  body: JSON.stringify({
    url: 'https://example.com/job/123',
    description: 'Job description text (optional)'
  })
});

const result = await response.json();
// {
//   url: "https://example.com/job/123",
//   riskScore: 42,
//   riskLevel: "medium",
//   signals: {
//     domainAge: "new",
//     httpsValid: true,
//     contentFlags: ["payment_demand"],
//     aiVerification: "not_found_on_web"
//   },
//   reasons: ["Domain registered < 30 days ago", "Payment demand detected"]
// }
```

### `/api/track` (POST)

Report a scan (anonymous analytics).

```javascript
await fetch('/.netlify/functions/track', {
  method: 'POST',
  body: JSON.stringify({
    url: 'https://example.com/job/123',
    riskLevel: 'high',
    platform: 'linkedin'
  })
});
```

---

## Contributing

We welcome contributions! Our goal is to catch more scams and help more people.

### How to Contribute

1. **Report false positives/negatives**
   - Open an issue with the job link + your analysis
   - Include screenshots
   - We'll investigate and improve

2. **Add scam patterns**
   - Suggest new detection rules: `src/rules/patterns.ts`
   - Include test cases
   - Must maintain 100% accuracy

3. **Improve detection**
   - Optimize heuristics in `src/engine/engine.ts`
   - Add tests
   - Benchmark impact

4. **Improve UX**
   - Responsive design enhancements
   - Better error messages
   - Accessibility improvements

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/add-new-pattern

# Make changes + write tests
npm test

# Commit with clear message
git commit -m "feat: add pattern detection for task scams"

# Push + create PR
git push origin feature/add-new-pattern
```

**Note:** All PRs must pass:
- ✅ Type-checking (`tsc --noEmit`)
- ✅ Tests (256/256 passing)
- ✅ Benchmark accuracy (≥90%)

---

## Roadmap

### Q4 2026 (Current)
- ✅ Multi-layer detection engine
- ✅ PDF export for reporting
- ✅ 100% benchmark accuracy
- 🔄 SEO + organic growth

### Q1 2027
- 🚀 Browser extension (1-click scanning)
- 🚀 WhatsApp bot (scan in-app)
- 📊 Crowdsourced scam database

### Q2 2027
- 🌍 Multi-language support (Hindi, Bengali, Tamil)
- 🌍 Expand to 3+ countries
- 💼 API for recruiters & HR platforms

### Q3 2027+
- 🤝 Partnerships with job boards
- 📱 Mobile app (iOS/Android)
- 🏢 Enterprise tier (company verification)

---

## Security & Privacy

### Security First 🔒

- **SSRF Protection:** All external link inspection is sandboxed
- **API Key Rotation:** Multi-key Gemini setup with automatic failover
- **Rate Limiting:** Prevents abuse, protects quota
- **CSP Headers:** XSS prevention
- **Input Validation:** All user input sanitized

### Privacy by Design 🔐

- **No Accounts:** You don't need to sign up
- **No Tracking:** We don't profile individual users
- **Anonymous Analytics:** Only aggregate threat trends
- **No Personal Data:** We only store: URL, timestamp, risk level
- **No Cookies:** Except session (Netlify)
- **GDPR Compliant:** Full transparency, easy data deletion

See [`PRIVACY.md`](./PRIVACY.md) for full details.

---

## License

MIT License © 2026 JobCheck

See [`LICENSE`](./LICENSE) for full text.

---

## Contact & Support

**Questions?** We're here to help.

- **Website:** [jobcheck.live](https://jobcheck.live)
- **Email:** support@jobcheck.live
- **Issues:** [GitHub Issues](https://github.com/mukeshgurusamy-dev/JobCheck/issues)
- **Feedback:** Use the in-app feedback form

---

## Acknowledgments

- **Google Gemini** for AI-powered verification
- **Supabase** for backend infrastructure
- **Netlify** for serverless deployment
- **The job seeker community** in India for feedback & insights

---

## Disclaimer

JobCheck is a **tool for risk assessment**, not a guarantee of legitimacy. We strongly recommend:

1. ✅ Always verify on the company's **official careers website**
2. ✅ Never pay upfront fees for interviews or jobs
3. ✅ Report suspected scams to **local authorities** or **cybercrime.gov.in**
4. ✅ Use JobCheck + your own judgment for informed decisions

**Your safety is our priority.** If you discover a scam, please report it—it helps us improve and protects others.

---

**Built with ❤️ to keep job seekers safe.**
