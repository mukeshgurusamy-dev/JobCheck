import { describe, it, expect, vi } from "vitest";
import { createBadge } from "../src/components/Badge/Badge";
import { createButton } from "../src/components/Button/Button";
import { createIcon } from "../src/components/Icon/Icon";
import { createTooltip } from "../src/components/Tooltip/Tooltip";

describe("Atom Component: Icon", () => {
  it("creates an SVG with correct class and default hidden aria attributes", () => {
    const icon = createIcon({ name: "shield-check", size: "md" });
    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon.classList.contains("c-icon")).toBe(true);
    expect(icon.classList.contains("c-icon--md")).toBe(true);
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.innerHTML).toContain("polyline");
  });

  it("supports accessible labels when ariaHidden is false", () => {
    const icon = createIcon({ name: "shield-alert", ariaHidden: false, label: "Security alert" });
    expect(icon.getAttribute("role")).toBe("img");
    expect(icon.getAttribute("aria-label")).toBe("Security alert");
    expect(icon.getAttribute("aria-hidden")).toBeNull();
  });
});

describe("Atom Component: Badge", () => {
  it("renders text and correct risk variant class", () => {
    const badge = createBadge({ text: "High Risk", variant: "risk-high" });
    expect(badge.classList.contains("c-badge")).toBe(true);
    expect(badge.classList.contains("c-badge--risk-high")).toBe(true);
    expect(badge.textContent).toContain("High Risk");
    // Verify an icon is automatically included for risk-high
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("renders trust signal badge with check icon", () => {
    const badge = createBadge({ text: "Official ATS", variant: "trust" });
    expect(badge.classList.contains("c-badge--trust")).toBe(true);
    expect(badge.textContent).toContain("Official ATS");
  });
});

describe("Atom Component: Button", () => {
  it("renders button with text and triggers click events", () => {
    const handleClick = vi.fn();
    const btn = createButton({ text: "Inspect Link", onClick: handleClick });
    expect(btn.textContent).toBe("Inspect Link");
    expect(btn.classList.contains("c-button--primary")).toBe(true);

    btn.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("switches to loading state and becomes disabled", () => {
    const btn = createButton({ text: "Submit", variant: "primary" });
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains("c-button--loading")).toBe(false);

    btn.setLoading(true, "Scanning...");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain("Scanning...");

    btn.setLoading(false);
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.textContent).toContain("Submit");
  });
});

describe("Atom Component: Tooltip", () => {
  it("attaches aria-describedby to trigger pointing to tooltip bubble", () => {
    const tooltip = createTooltip({ text: "Explanation note" });
    const trigger = tooltip.querySelector("button");
    const bubble = tooltip.querySelector('[role="tooltip"]');

    expect(trigger).not.toBeNull();
    expect(bubble).not.toBeNull();
    expect(trigger?.getAttribute("aria-describedby")).toBe(bubble?.id);
    expect(bubble?.textContent).toBe("Explanation note");
  });

  it("dismisses on Escape keydown", () => {
    const tooltip = createTooltip({ text: "Dismiss me" });
    tooltip.classList.add("c-tooltip--active");
    expect(tooltip.classList.contains("c-tooltip--active")).toBe(true);

    tooltip.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tooltip.classList.contains("c-tooltip--active")).toBe(false);
  });
});
