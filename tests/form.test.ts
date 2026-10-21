import { describe, it, expect, vi } from "vitest";
import { createCheckerForm } from "../src/components/CheckerForm/CheckerForm";

describe("CheckerForm Organism Component", () => {
  it("rejects empty URL submission and sets accessible error", () => {
    const handleSubmit = vi.fn();
    const form = createCheckerForm({ onSubmit: handleSubmit });
    document.body.appendChild(form);

    form.dispatchEvent(new Event("submit", { cancelable: true }));

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorEl = form.querySelector('[role="alert"]');
    expect(errorEl?.textContent).toContain("cannot be empty");

    document.body.removeChild(form);
  });

  it("blocks localhost and private IPs on submission", () => {
    const handleSubmit = vi.fn();
    const form = createCheckerForm({ onSubmit: handleSubmit });
    document.body.appendChild(form);

    form.setUrl("http://localhost:3000/job");
    form.dispatchEvent(new Event("submit", { cancelable: true }));

    expect(handleSubmit).not.toHaveBeenCalled();
    const errorEl = form.querySelector('[role="alert"]');
    expect(errorEl?.textContent).toContain("blocked");

    document.body.removeChild(form);
  });

  it("normalizes and submits valid URL with description", () => {
    const handleSubmit = vi.fn();
    const form = createCheckerForm({ onSubmit: handleSubmit });
    document.body.appendChild(form);

    form.setUrl("careers.infosys.com/job/123");
    form.setDescription("Software Engineer entry level opening.");

    form.dispatchEvent(new Event("submit", { cancelable: true }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith({
      url: "https://careers.infosys.com/job/123",
      description: "Software Engineer entry level opening.",
      isSecondAttempt: false
    });

    document.body.removeChild(form);
  });

  it("clicking a sample chip populates URL and description", () => {
    const form = createCheckerForm({ onSubmit: vi.fn() });
    document.body.appendChild(form);

    const firstChip = form.querySelector(".c-checker-form__sample-chip") as HTMLButtonElement;
    expect(firstChip).not.toBeNull();
    firstChip.click();

    const input = form.querySelector("input[type='url']") as HTMLInputElement;
    const textarea = form.querySelector("textarea") as HTMLTextAreaElement;

    expect(input.value).toContain("careers.tcs.com");
    expect(textarea.value).toContain("Tata Consultancy Services");

    document.body.removeChild(form);
  });

  it("toggles the collapsible job description disclosure", () => {
    const form = createCheckerForm({ onSubmit: vi.fn(), initiallyExpanded: false });
    document.body.appendChild(form);

    const toggle = form.querySelector(".c-checker-form__disclosure-toggle") as HTMLButtonElement;
    const disclosure = form.querySelector(".c-checker-form__disclosure");

    expect(disclosure?.classList.contains("c-checker-form__disclosure--open")).toBe(false);

    toggle.click();
    expect(disclosure?.classList.contains("c-checker-form__disclosure--open")).toBe(true);

    toggle.click();
    expect(disclosure?.classList.contains("c-checker-form__disclosure--open")).toBe(false);

    document.body.removeChild(form);
  });

  it("enforces pasting job description when entering trusted platform (LinkedIn/Naukri)", () => {
    const handleSubmit = vi.fn();
    const form = createCheckerForm({ onSubmit: handleSubmit });
    document.body.appendChild(form);

    form.setUrl("https://www.linkedin.com/jobs/view/123456");

    // Disclosure should automatically be opened
    const disclosure = form.querySelector(".c-checker-form__disclosure");
    expect(disclosure?.classList.contains("c-checker-form__disclosure--open")).toBe(true);

    // Submitting without description should be blocked
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(handleSubmit).not.toHaveBeenCalled();

    // Warning message should be displayed
    const warningBox = form.querySelector(".c-checker-form__warning-box") as HTMLElement | null;
    expect(warningBox?.textContent).toContain("Paste the job description");
    expect(warningBox?.style.display).not.toBe("none");

    // Submitting with description succeeds
    form.setDescription("Valid job description for TCS posting");
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(handleSubmit).toHaveBeenCalledTimes(1);

    document.body.removeChild(form);
  });
});

