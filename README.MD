# JobCheck: Scam vs. Legit Job Link Checker

Paste a job link (and optionally the job description) and get an immediate **Low / Medium / High risk** estimate with clear, actionable reasons. Built for job seekers in India, where fake offers asking for "registration fees", WhatsApp-only recruiters, and task scams are widespread.

**Live site:** [jobcheck.live](https://jobcheck.live)  
**Accuracy:** 100% on 100-sample real-world benchmark suite (10 platforms × 10 companies)

> JobCheck estimates risk from public signals and AI-assisted analysis. It **cannot prove** a company or job is real or fake. Always verify on the company's official careers portal.

---

## Key Features

- **Multi-Layer Detection Engine:**
  - Fast client-side heuristics & pattern matching (Hinglish, salary traps, upfront fees, ATS detection).
  - Serverless link inspection (`/api/inspect`) with SSRF protection, RDAP domain age verification, and redirect-chain tracking.
  - AI Intelligence Layer (`/api/aiSearch`) powered by Google Gemini with multi-key rotation and automatic HTTP 429 failover.
- **Privacy-First & Secure:**
  - No user accounts required.
  - Anonymous visitor analytics powered by Supabase (`/api/track`) for tracking aggregate threat trends.
- **Exportable PDF Reports:**
  - One-click generated cybercrime/fraud audit reports suitable for reporting scams to cyber cells (1930 / cybercrime.gov.in).
- **Strictly Tested:**
  - 25 test suites, 256 unit/integration tests with 100% pass rate.

---

## How It Works

1. The client sends the link to the Netlify serverless inspection endpoint.
2. The function inspects the page (with SSRF protection), checks domain age (RDAP), and tracks redirect chains.
3. The rule engine calculates a risk score:
   - **0–24: Low Risk** (Green)
   - **25–54: Medium Risk** (Amber)
   - **55–100: High Risk / Scam** (Red)
4. AI verification kicks in via Gemini search grounding to confirm company legitimacy and lookalike domains.

---

## Getting Started Locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your GEMINI_API_KEYS and SUPABASE credentials

# 3. Run development server (with Netlify Functions support)
npx netlify dev

# 4. Run tests
npm test

# 5. Build for production
npm run build
```

---

## Deployment to Netlify

JobCheck is designed to deploy seamlessly from GitHub to Netlify:

1. Connect your GitHub repository to Netlify.
2. Build Settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
3. Environment Variables (in Netlify Site settings > Environment variables):
   - `GEMINI_API_KEYS`: Comma-separated Gemini API keys.
   - `SUPABASE_URL`: Your Supabase project URL.
   - `SUPABASE_KEY`: Your Supabase service role or anon key.

---

## Tech Stack

- **Frontend:** TypeScript, Vite, Vanilla DOM components (BEM architecture), html2canvas, jsPDF.
- **Backend:** Netlify Functions (Node.js/TypeScript).
- **Database/Analytics:** Supabase.
- **Testing:** Vitest, happy-dom.
