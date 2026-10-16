/**
 * Origin allow-list for the inspect function.
 * Browsers always send an Origin header on cross-site POSTs, so this stops other
 * websites from using your function as a free proxy. It does NOT stop curl or
 * scripts (they can fake or omit the header); rate limiting covers those.
 */
export function getAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const origins = [
    env["URL"], // primary site URL on Netlify
    env["DEPLOY_PRIME_URL"], // branch / preview deploy URL
    "http://localhost:8888", // netlify dev
    "http://localhost:3000", // vite dev server
  ];
  return origins
    .filter((o): o is string => typeof o === "string" && o.length > 0)
    .map((o) => o.replace(/\/+$/, ""));
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowed: string[],
): boolean {
  if (!origin) return true; // same-origin requests and non-browser clients
  const clean = origin.replace(/\/+$/, "");
  if (allowed.includes(clean)) return true;
  // Allow all localhost and 127.0.0.1 dev server origins (any port)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) return true;
  return false;
}

