/**
 * Reads a link/description handed over from the bookmarklet via the URL hash,
 * e.g. https://site/#u=<encoded url>&d=<encoded text>.
 * The hash never reaches any server. The text is only prefilled; the user still
 * has to press "Check" themselves.
 */
export const MAX_DESCRIPTION_LENGTH = 25000;

export interface Handoff {
  url?: string;
  description?: string;
}

export function parseHandoff(hash: string): Handoff {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const url = params.get("u")?.trim().slice(0, 2048) || undefined;
  const description =
    params.get("d")?.trim().slice(0, MAX_DESCRIPTION_LENGTH) || undefined;

  const result: Handoff = {};
  if (url) result.url = url;
  if (description) result.description = description;
  return result;
}
