/**
 * SUPERSEDED — this file cannot run.
 *
 * It imported `./src/rules/textRules.js` and `./src/engine/normalize.js`, which
 * do not exist: the sources are TypeScript, and this project has no `tsx`/`ts-node`
 * loader. Running `node debug-test.mjs` therefore fails on the first import.
 *
 * The four cases below are already covered properly by the real test suite:
 *
 *   npx vitest run tests/newRules2026.test.ts   // crypto / investment / advance-salary / fake-govt
 *   npx vitest run tests/hinglish.test.ts       // romanised-Hindi fee and bait phrasing
 *
 * Delete this file. It is kept only so the case list is not lost.
 */
export const DEPRECATED_DEBUG_CASES = [
  { name: "Cryptocurrency", text: "Pay joining fee of ₹5000 in USDT to this TRC-20 address", expectedId: "cryptocurrency-payment" },
  { name: "Investment Scheme", text: "Invest ₹10,000 and earn guaranteed 15% ROI daily", expectedId: "investment-scheme" },
  { name: "Advance Salary", text: "Get advance salary before joining, just pay processing fee", expectedId: "advance-salary-loan" },
  { name: "Fake Government", text: "Government job guaranteed, registration fee ₹1500", expectedId: "fake-government-job" },
];
