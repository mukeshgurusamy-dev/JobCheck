/**
 * The closing recommendation shown at the foot of a result panel.
 *
 * The app already shows a score, a band, per-signal findings and a next-steps
 * list, but a jobseeker skimming the page could not tell what it was telling
 * them to actually *do*. This collapses all of it into one instruction.
 *
 * Pure and deterministic: same `Assessment` in, same verdict out. It reads the
 * band the engine already decided and never softens it — the core invariant is
 * that a posting with a hard scam flag is never presented as safe.
 */

import { Assessment } from "../../types/types";

export type VerdictVariant = "safe" | "verify" | "avoid";

export interface FinalVerdict {
  variant: VerdictVariant;
  /** Short label for the section heading, e.g. "Our recommendation". */
  headline: string;
  /** One or two sentences saying what to do. */
  body: string;
  /** Concrete actions, rendered as a short list. */
  steps: string[];
}

export function buildFinalVerdict(assessment: Assessment): FinalVerdict {
  const ai = assessment.aiIntel;
  const aiRan = ai?.status === "completed";
  const aiSaysScam = aiRan && ai?.isScamLikely === true;

  // A hard flag from either layer is decisive. The engine floors the level to
  // High for ~18 hard-flag ids, so this branch catches those too.
  if (assessment.level === "High" || aiSaysScam) {
    return {
      variant: "avoid",
      headline: "Do not apply — and do not pay anything",
      body: "This posting carries the signals of a scam: legitimate employers never ask a candidate for money, documents or an OTP. Stop replying to the recruiter and keep what you have as evidence.",
      steps: [
        "Do not pay any fee — registration, training, gate pass, deposit or courier.",
        "Do not share Aadhaar, PAN, bank details or any OTP.",
        "Report the post and the recruiter's number at cybercrime.gov.in or on 1930.",
        "Block the recruiter and leave any WhatsApp or Telegram group they added you to.",
      ],
    };
  }

  if (assessment.level === "Medium") {
    return {
      variant: "verify",
      headline: "Verify these things before you apply",
      body: "Nothing here proves the posting is fake, but several signals did not check out. Confirm the basics directly with the employer before you share anything or commit time.",
      steps: [
        "Find the vacancy on the company's own careers page, not just the job portal.",
        "Confirm the recruiter writes from a company email domain, not Gmail or a messaging app.",
        "Call the office number listed on the company's website and ask HR to confirm the role.",
        "Never pay a fee at any stage, including 'refundable' deposits.",
      ],
    };
  }

  // Low risk, but the web investigation did not run, so the clean result rests
  // on the automated rules alone. Saying "safe to apply" here would overstate
  // what was actually checked.
  if (!aiRan) {
    return {
      variant: "verify",
      headline: "No red flags found — but the web check did not run",
      body: "The automated checks found nothing wrong with this link. The web investigation that looks for reviews, complaints and company records was not completed for this scan, so confirm the employer yourself before you apply.",
      steps: [
        "Search the company name for reviews and complaints before applying.",
        "Apply through the official careers page rather than a link in a message.",
        "Never pay a fee, and never share Aadhaar, PAN or bank details before an offer.",
      ],
    };
  }

  return {
    variant: "safe",
    headline: "Safe to apply — through the official portal",
    body: "The checks we run found no scam signals on this posting, and the web investigation turned up no reports against this employer. Apply through the company's official careers page and keep the usual habits.",
    steps: [
      "Apply on the official careers page and keep a copy of the posting.",
      "Anyone asking you for a fee, a deposit or an OTP is not the employer — stop there.",
      "Share identity documents only after a written offer from a company email address.",
    ],
  };
}
