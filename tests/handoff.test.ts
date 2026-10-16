import { describe, it, expect } from "vitest";
import { parseHandoff, MAX_DESCRIPTION_LENGTH } from "../src/utils/handoff";

describe("parseHandoff", () => {
  it("reads url and description from the hash", () => {
    const hash = `#u=${encodeURIComponent("https://www.linkedin.com/jobs/view/123")}&d=${encodeURIComponent("Pay ₹1500 fee & WhatsApp us")}`;
    expect(parseHandoff(hash)).toEqual({
      url: "https://www.linkedin.com/jobs/view/123",
      description: "Pay ₹1500 fee & WhatsApp us",
    });
  });

  it("returns an empty object when there is nothing to hand over", () => {
    expect(parseHandoff("")).toEqual({});
    expect(parseHandoff("#section-2")).toEqual({});
  });

  it("caps very long descriptions", () => {
    const hash = `#d=${encodeURIComponent("a".repeat(MAX_DESCRIPTION_LENGTH + 500))}`;
    expect(parseHandoff(hash).description?.length).toBe(MAX_DESCRIPTION_LENGTH);
  });
});
