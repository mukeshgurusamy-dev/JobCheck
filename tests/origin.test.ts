import { describe, it, expect } from "vitest";
import {
  getAllowedOrigins,
  isAllowedOrigin,
} from "../netlify/functions/origin";

describe("isAllowedOrigin", () => {
  const allowed = getAllowedOrigins({ URL: "https://jobcheck.netlify.app/" });

  it("allows the site's own origin (trailing slash ignored)", () => {
    expect(isAllowedOrigin("https://jobcheck.netlify.app", allowed)).toBe(true);
    expect(isAllowedOrigin("https://jobcheck.netlify.app/", allowed)).toBe(
      true,
    );
  });

  it("allows local dev origins", () => {
    expect(isAllowedOrigin("http://localhost:8888", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
  });

  it("rejects other websites", () => {
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(
      isAllowedOrigin("https://jobcheck.netlify.app.evil.example", allowed),
    ).toBe(false);
  });

  it("allows requests with no Origin header (same-origin / non-browser)", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
  });

  it("ignores unset env values", () => {
    expect(getAllowedOrigins({})).toEqual([
      "https://jobcheck.tech",
      "https://www.jobcheck.tech",
      "https://jobcheck.live",
      "https://www.jobcheck.live",
      "http://localhost:8888",
      "http://localhost:3000",
      "http://localhost:5173",
    ]);
  });
});
