# JobCheck: scam vs. legit job link checker

Paste a job link (and optionally the job description) and get a **Low / Medium / High risk** estimate with the reasons behind it. Built for fresher job seekers in India, where fake offers asking for "registration fees", WhatsApp-only recruiters and task scams are common.

**Live demo:** <your-netlify-url>  
**Screenshot:** <add a screenshot or GIF>

> JobCheck estimates risk from public signals. It **cannot prove** a company or job is real or fake. Always verify on the company's official careers page.

## How it works

1. The browser sends the link to a small Netlify Function.
2. The function fetches the page (with SSRF protection), checks domain age (RDAP) and optionally Google Safe Browsing.
3. A rule engine runs in the browser: URL rules, text pattern groups, and trust signals.
4. Every point added or removed comes with a visible reason.

### Scoring

- Risk findings add points, trust findings subtract (trust reduction capped at 30). Score is clamped to 0-100.
- **0-24 Low, 25-54 Medium, 55-100 High.**
- Each text-pattern group counts once, however many of its patterns match.
- Hard flags (payment demands, task scams, early document requests, Safe Browsing hits) force at least High.
- **Confidence** (Low / Medium / High) reflects how much data was available: URL only, URL + domain age or text, or both.

### Rules

- **URL and domain (examples):** no HTTPS (+10), IP address host (+30), URL shortener (+20), free host or form (+20), suspicious TLD (+15), punycode (+30), lookalike of a known brand (+35), brand in the wrong place (+30), domain under 30 days old (+35), long redirect chain (+15), Safe Browsing flag (+60).
- **Text groups:** upfront payment (45), task/review scam (40), sensitive documents early (35), MLM/referral (30), unrealistic pay (30), paid training for a "job" (30), no-skill easy money (25), WhatsApp/Telegram-only contact (25), instant offer (25), overseas offer with fees (25), free email recruiter (20), fresher role with years of experience (20), urgency (15), vague employer (15), spammy writing style (10).
- **Trust signals:** known job platform (-10), known applicant-tracking system (-15), domain 5+ years old (-15), structured description (-10), recruiter email matches site domain (-10), realistic salary range (-5).

To add a rule: add an object in `src/rules/` (URL rules) or a group in `src/rules/patterns.ts` (text), then add a test and a fixture.

## Evaluation

`npm run evaluate` runs every sample in `tests/fixtures/fixtures.json`.

- Current result: <X> / <N> correct, <FP> false positives, <FN> false negatives.
- **Be honest here:** state how many samples are real (collected from real postings and messages) and how many were written by hand.

## Privacy

No accounts, no database. The link is sent to the function only to analyse it; it is not stored or logged. The share card and copy summary never include the link or job text.

## Known limitations

- It cannot verify a company. It judges the link and text only.
- LinkedIn, Naukri and similar sites often block fetching, so paste the description for a better result.
- Text rules are English-only.
- Domain age depends on RDAP, which not every domain supports.
- Browser Origin checks stop other websites from using the function, but not scripts; rate limiting (20 requests/min per IP, in memory per instance) covers those.
- DNS rebinding is not fully mitigated.

## Run locally

```bash
npm install
npx netlify dev     # site + function on http://localhost:8888
npm test
npm run build
```

Optional: set `SAFE_BROWSING_KEY` in Netlify's environment variables to enable Google Safe Browsing.

## Stack

Vite, strict TypeScript (no `any`), vanilla DOM components (BEM, component-first), Netlify Functions, Vitest.
