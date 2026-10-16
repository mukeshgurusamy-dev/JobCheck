# JobCheck — working notes for Claude

Scam-vs-legit checker for Indian job postings. A user pastes a job URL (and
ideally the description text); the app fetches the page, checks the domain,
optionally runs a Gemini web-search investigation, and returns a 0–100 risk
score with the reasons behind it.

## The one architectural fact that matters

**There are two runtimes, and the score is computed in the browser.**

- `netlify/functions/` — network side. Fetches the page, resolves the domain
  via RDAP, optionally calls Gemini. Returns raw evidence (`PageData`,
  `AiIntelligenceResult`). It does **not** score.
- `src/engine/` + `src/rules/` — browser side, and entirely deterministic.
  `analyzeJob()` in `src/engine/engine.ts` is a pure function of
  `(url, text, pageData, aiIntel) → Assessment`.

Consequence: every scoring change is testable without a network or an API key,
and it runs on the user's machine — no listing text is stored server-side.
Keep it that way. If you find yourself wanting to score inside a Netlify
function, don't.

## Commands

```bash
npm run typecheck   # tsc --noEmit — run this before claiming anything compiles
npm test            # vitest run, 22 suites
npm run benchmark   # 100 labelled postings; the release gate (see below)
npm run build       # typecheck + vite build
```

`npm run build` runs the typechecker first, so a type error fails the build.
TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals` and
`noUnusedParameters` — an unused import is a build failure, not a warning.

## Scoring invariants

- Bands: `0–24` Low, `25–54` Medium, `55–100` High (`src/engine/scoring.ts`).
- Trust findings are subtracted but capped at 30 points total; the result is
  clamped to `0–100`.
- Each finding `id` counts at most once, so a rule that matches five lines is
  not scored five times.
- **The core invariant: a posting exhibiting a hard scam flag must never be
  rated Low.** ~18 ids in `highRiskHardFlags` force `level = "High"` regardless
  of arithmetic. `tests/benchmark100.test.ts` enforces a zero-false-negative
  rule over the fixture — no High posting may come back Low. If a change makes
  a benchmark case fail, the change is wrong, not the fixture.
- AI-derived points do **not** go through the trust cap or the clamp: they are
  applied afterwards by `applyAiIntelligence()` in `src/engine/aiFusion.ts`,
  which does its own bounded arithmetic. That asymmetry is intentional but easy
  to trip over when adding AI rules.

All AI scoring policy lives in `src/engine/aiFusion.ts` and nowhere else.

## Conventions and gotchas

- `tests/failures.json` is written by the benchmark on every run and is
  gitignored. An empty array `[]` means the last run passed the gate.
- The benchmark fixture (`tests/fixtures/benchmark100.json`) is 50 Low / 50 High
  across 10 real job platforms. When adding a text rule, check both halves —
  a rule that fires on ordinary descriptions breaks the zero-false-negative
  rule from the other direction (legit postings drifting to High).
- Hinglish patterns need `\b`. "Mana**pakka**m" (a Chennai locality in legit
  fixture entries) collides with `pakka`. `tests/hinglish.test.ts` guards this.
- Sources are TypeScript and there is no `tsx`/`ts-node` loader, so a bare
  `node script.mjs` importing from `src/` will not run. Write a Vitest file.
- **Every number in user-facing marketing copy must be verifiable from this
  repo.** The UI previously advertised MCA database validation, a national
  cybercrime threat feed, scam-UPI-ID lists and "100+ safety checks" — none of
  which exist in the code. Avoid reintroducing claims the implementation can't
  back; prefer counts you can grep for (rule groups, patterns, fixture size).

## Secrets

`.env` is gitignored; `.env.example` lists the expected keys. `GEMINI_API_KEY`
is the only one currently wired up; Safe Browsing is optional and the code
degrades gracefully when its key is absent. Never paste a key into a document
or a commit — `QUICK_START.md` and `ENHANCEMENT_COMPLETE.md` both leaked one
this way and had to be redacted.
