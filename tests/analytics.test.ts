import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initAnalytics,
  trackJobSearch,
  trackPdfDownload,
  trackHelplineClick,
  trackCopyReport,
} from "../src/utils/analytics";

describe("Analytics Tracking Module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
  });

  it("initAnalytics triggers fetch with device information", () => {
    initAnalytics();
    expect(global.fetch).toHaveBeenCalled();
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toBe("/.netlify/functions/track");
    const body = JSON.parse(options.body);
    expect(body.action).toBe("init");
    expect(body.session_id).toBeDefined();
    expect(body.browser).toBeDefined();
    expect(body.os).toBeDefined();
  });

  it("trackJobSearch sends search event payload", () => {
    trackJobSearch({
      jobUrl: "https://example.com/job/123",
      companyName: "Acme Corp",
      riskLevel: "High",
      score: 85,
      scamTypes: ["Fee Demand"],
    });

    const calls = (global.fetch as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    const body = JSON.parse(lastCall[1].body);
    expect(body.action).toBe("search");
    expect(body.job_url).toBe("https://example.com/job/123");
    expect(body.company_name).toBe("Acme Corp");
    expect(body.score).toBe(85);
  });

  it("trackPdfDownload sends pdf_download event", () => {
    trackPdfDownload();
    const calls = (global.fetch as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    const body = JSON.parse(lastCall[1].body);
    expect(body.action).toBe("pdf_download");
  });

  it("trackHelplineClick sends helpline_click event", () => {
    trackHelplineClick();
    const calls = (global.fetch as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    const body = JSON.parse(lastCall[1].body);
    expect(body.action).toBe("helpline_click");
  });

  it("trackCopyReport sends copy_report event", () => {
    trackCopyReport();
    const calls = (global.fetch as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    const body = JSON.parse(lastCall[1].body);
    expect(body.action).toBe("copy_report");
  });
});
