import { InspectApiResponse } from "../types/types";

/**
 * Service to call the Netlify backend inspection endpoint.
 */
export async function inspectUrl(
  url: string,
  description?: string,
): Promise<InspectApiResponse> {
  try {
    const response = await fetch("/.netlify/functions/inspect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, description }),
    });

    if (!response.ok) {
      const errorJson = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: unknown;
      };
      return {
        fetched: false,
        error: errorJson.error || `Server responded with status ${response.status}.`
      };
    }

    const result = (await response.json()) as InspectApiResponse;
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error contacting server.";
    return {
      fetched: false,
      error: message
    };
  }
}
