import { Handler, HandlerEvent, HandlerResponse } from "@netlify/functions";
import { isAllowedOrigin, getAllowedOrigins } from "./origin";

/**
 * Netlify serverless function: /api/track
 *
 * Receives visitor analytics events from the frontend and writes them to
 * Supabase.  The browser never talks to Supabase directly — this endpoint
 * acts as a secure proxy so the Supabase key stays server-side.
 *
 * Netlify automatically provides geo headers (x-country, x-nf-geo) and the
 * true client IP (x-nf-client-connection-ip), so we enrich every event with
 * accurate location data that cannot be spoofed from JavaScript.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

// ---------- helpers ----------

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function extractGeo(headers: Record<string, string | undefined>): {
  ip: string;
  country: string;
  city: string;
  region: string;
} {
  const ip =
    headers["x-nf-client-connection-ip"] ||
    headers["client-ip"] ||
    headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    "unknown";

  // Netlify edge geo headers (free, automatic, no external API needed)
  const country = headers["x-country"] || headers["x-nf-country-code"] || "";
  const city = decodeURIComponent(headers["x-nf-city-name"] || headers["x-city"] || "");
  const region = decodeURIComponent(headers["x-nf-region-name"] || headers["x-region"] || "");

  return { ip, country, city, region };
}

function isBotUA(ua: string): boolean {
  return /bot|crawler|spider|googlebot|bingbot|slurp|yandex|baidu|duckduck|facebot|ia_archiver|semrush|ahref/i.test(
    ua,
  );
}

// ---------- Supabase REST helpers ----------

async function supabaseInsert(
  row: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_visits`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function supabaseUpdate(
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_visits?session_id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );
  return { ok: res.ok, status: res.status, body: await res.text() };
}

// ---------- handler ----------

export const handler: Handler = async (
  event: HandlerEvent,
): Promise<HandlerResponse> => {
  const origin = event.headers["origin"] || event.headers["Origin"];
  const headers = corsHeaders(origin);

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Origin check
  if (!isAllowedOrigin(origin, getAllowedOrigins())) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: "Origin not allowed" }),
    };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Analytics not configured" }),
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const action = String(payload.action || "");
  const sessionId = String(payload.session_id || "");

  if (!sessionId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "session_id required" }),
    };
  }

  const geo = extractGeo(event.headers as Record<string, string | undefined>);
  const ua = event.headers["user-agent"] || "";

  try {
    // ---- ACTION: init (first visit) ----
    if (action === "init") {
      const row: Record<string, unknown> = {
        session_id: sessionId,
        ip_address: geo.ip,
        country: geo.country || payload.country || null,
        city: geo.city || payload.city || null,
        region: geo.region || payload.region || null,
        browser: payload.browser || null,
        os: payload.os || null,
        device_type: payload.device_type || null,
        is_mobile: !!payload.is_mobile,
        is_bot: isBotUA(ua),
        screen_resolution: payload.screen_resolution || null,
        language: payload.language || null,
        referrer: payload.referrer || null,
        landing_page: payload.landing_page || null,
      };

      const result = await supabaseInsert(row);
      if (!result.ok && result.status === 409) {
        // Duplicate session_id — session already exists, that's fine
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, note: "session exists" }) };
      }
      if (!result.ok) {
        console.error("Supabase insert error:", result.status, result.body);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "db-insert-failed" }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ---- ACTION: search (user ran a job scan) ----
    if (action === "search") {
      // We use Supabase's RPC or a raw SQL approach, but for simplicity
      // we read the current row, append the job, and write back.
      // To avoid a read, we use Supabase's jsonb concatenation via raw PATCH.
      const jobEntry = {
        url: payload.job_url || "",
        company: payload.company_name || "",
        risk_level: payload.risk_level || "",
        score: payload.score ?? 0,
        scam_types: payload.scam_types || [],
        searched_at: new Date().toISOString(),
      };

      // We need to read current row to append to arrays
      const readRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_visits?session_id=eq.${encodeURIComponent(sessionId)}&select=searched_jobs,company_names_searched,detected_scam_types,highest_risk_score,total_searches_count`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );

      if (!readRes.ok) {
        console.error("Supabase read error:", readRes.status);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "db-read-failed" }) };
      }

      const rows = (await readRes.json()) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "session not found" }) };
      }

      const existing = rows[0]!;
      const searchedJobs = Array.isArray(existing.searched_jobs) ? existing.searched_jobs : [];
      const companyNames = Array.isArray(existing.company_names_searched)
        ? existing.company_names_searched
        : [];
      const scamTypes = Array.isArray(existing.detected_scam_types)
        ? existing.detected_scam_types
        : [];
      const prevHighScore = typeof existing.highest_risk_score === "number"
        ? existing.highest_risk_score
        : 0;
      const prevCount = typeof existing.total_searches_count === "number"
        ? existing.total_searches_count
        : 0;

      searchedJobs.push(jobEntry);
      if (payload.company_name && !companyNames.includes(payload.company_name)) {
        companyNames.push(payload.company_name);
      }
      const newScamTypes = Array.isArray(payload.scam_types) ? payload.scam_types : [];
      for (const st of newScamTypes) {
        if (!scamTypes.includes(st)) scamTypes.push(st);
      }

      const patch: Record<string, unknown> = {
        searched_jobs: searchedJobs,
        company_names_searched: companyNames,
        detected_scam_types: scamTypes,
        total_searches_count: prevCount + 1,
        highest_risk_score: Math.max(prevHighScore, Number(payload.score) || 0),
        last_active_at: new Date().toISOString(),
      };

      const result = await supabaseUpdate(sessionId, patch);
      if (!result.ok) {
        console.error("Supabase update error:", result.status, result.body);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ---- ACTION: pdf_download ----
    if (action === "pdf_download") {
      // Read current count
      const readRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_visits?session_id=eq.${encodeURIComponent(sessionId)}&select=pdf_download_count`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        },
      );
      const rows = readRes.ok ? ((await readRes.json()) as Array<Record<string, unknown>>) : [];
      const prevCount =
        rows.length > 0 && typeof rows[0]!.pdf_download_count === "number"
          ? rows[0]!.pdf_download_count as number
          : 0;

      const result = await supabaseUpdate(sessionId, {
        downloaded_pdf: true,
        pdf_download_count: prevCount + 1,
        last_active_at: new Date().toISOString(),
      });
      if (!result.ok) {
        console.error("Supabase update error:", result.status, result.body);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ---- ACTION: helpline_click ----
    if (action === "helpline_click") {
      const result = await supabaseUpdate(sessionId, {
        clicked_helpline: true,
        last_active_at: new Date().toISOString(),
      });
      if (!result.ok) {
        console.error("Supabase update error:", result.status, result.body);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ---- ACTION: copy_report ----
    if (action === "copy_report") {
      const result = await supabaseUpdate(sessionId, {
        copied_report_text: true,
        last_active_at: new Date().toISOString(),
      });
      if (!result.ok) {
        console.error("Supabase update error:", result.status, result.body);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ---- ACTION: exit (user is leaving the site) ----
    if (action === "exit") {
      const result = await supabaseUpdate(sessionId, {
        session_duration_seconds: payload.duration_seconds ?? 0,
        last_active_at: new Date().toISOString(),
      });
      if (!result.ok) {
        console.error("Supabase update error:", result.status, result.body);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Unknown action: ${action}` }),
    };
  } catch (err) {
    console.error("Track function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal error" }),
    };
  }
};
