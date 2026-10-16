import { Assessment, RiskLevel } from "../types/types";

/**
 * Formats a plain-text assessment summary for clipboard or messaging apps.
 * Deliberately excludes the analysed URL and any job text (privacy).
 */
export function formatCopySummary(assessment: Assessment): string {
  const lines: string[] = [
    `JobCheck: ${assessment.level} risk (${assessment.score}/100, confidence ${assessment.confidence}).`,
  ];

  if (assessment.findings.length === 0) {
    lines.push("No specific risk signals were detected.");
  } else {
    lines.push("Reasons:");
    for (const f of assessment.findings.slice(0, 5)) {
      lines.push(`- ${f.reason}`);
    }
  }

  lines.push("");
  lines.push(
    "This estimates risk from public signals and cannot confirm a job is real. Verify on the company's official careers page.",
  );
  lines.push("Report fraud: cybercrime.gov.in or helpline 1930.");

  return lines.join("\n");
}

/**
 * Copies text to user clipboard with navigator.clipboard or fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }

  // Fallback using textarea element
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Word-wraps text to a pixel width using the canvas's own font metrics.
 * Anything beyond maxLines is cut with an ellipsis.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (
    lines.length === maxLines &&
    current &&
    words.join(" ") !== lines.join(" ")
  ) {
    const last = lines[maxLines - 1] as string;
    lines[maxLines - 1] = `${last.replace(/[\s.,;:]+$/, "")}...`;
  }
  return lines.slice(0, maxLines);
}

/**
 * Renders a 1200x630 share card onto an off-screen canvas (no external libraries).
 * Privacy: the analysed URL and any job text are NEVER drawn on the card.
 */
export function renderShareCardToCanvas(
  assessment: Assessment,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return canvas;
  }

  const riskColor =
    assessment.level === "High"
      ? "#dc2626"
      : assessment.level === "Medium"
        ? "#d97706"
        : "#059669";

  // Background and accent bar
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = riskColor;
  ctx.fillRect(0, 0, 1200, 8);

  // Header
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText("JobCheck", 60, 70);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText("Scam vs. legit job link checker for Indian freshers", 60, 100);

  // Left panel: level, score, confidence
  ctx.fillStyle = "#1e293b";
  roundRect(ctx, 60, 135, 420, 360, 16);
  ctx.fill();

  ctx.fillStyle = riskColor;
  roundRect(ctx, 95, 170, 250, 54, 27);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${assessment.level.toUpperCase()} RISK`, 220, 205);
  ctx.textAlign = "left";

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 84px ${FONT}`;
  ctx.fillText(`${assessment.score}`, 95, 330);
  const scoreWidth = ctx.measureText(`${assessment.score}`).width;
  ctx.fillStyle = "#94a3b8";
  ctx.font = `28px ${FONT}`;
  ctx.fillText("/ 100", 95 + scoreWidth + 12, 330);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(`Confidence: ${assessment.confidence}`, 95, 395);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `18px ${FONT}`;
  const count = assessment.findings.length;
  ctx.fillText(`${count} signal${count === 1 ? "" : "s"} found`, 95, 430);

  // Right panel: top 3 findings
  ctx.fillStyle = "#1e293b";
  roundRect(ctx, 510, 135, 630, 360, 16);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText("Top signals", 545, 180);

  const top = assessment.findings.slice(0, 3);
  if (top.length === 0) {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `18px ${FONT}`;
    ctx.fillText("No specific risk signals were detected.", 545, 230);
    ctx.fillText(
      "Always verify the job on the official careers page.",
      545,
      264,
    );
  } else {
    let y = 230;
    for (const f of top) {
      const tag = f.points > 0 ? `+${f.points}` : `${f.points}`;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillStyle = f.kind === "risk" ? "#f87171" : "#38bdf8";
      ctx.fillText(tag, 545, y);

      ctx.font = `18px ${FONT}`;
      ctx.fillStyle = "#f1f5f9";
      const lines = wrapText(ctx, f.reason, 500, 2);
      lines.forEach((line, i) => ctx.fillText(line, 610, y + i * 26));
      y += 84;
    }
  }

  // Footer disclaimer
  ctx.fillStyle = "#0f172a";
  roundRect(ctx, 60, 520, 1080, 76, 12);
  ctx.fill();
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.font = `600 16px ${FONT}`;
  ctx.fillText(
    "Estimates risk from public signals. Verify independently.",
    85,
    553,
  );
  ctx.fillStyle = "#94a3b8";
  ctx.font = `14px ${FONT}`;
  ctx.fillText(
    "Real employers never charge fees. Report fraud: cybercrime.gov.in | Helpline 1930",
    85,
    578,
  );

  return canvas;
}

/**
 * Utility to draw rounded rectangles on HTML5 Canvas.
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generates and triggers automatic download of the PNG share card.
 */
export function downloadShareCardPng(assessment: Assessment): void {
  const canvas = renderShareCardToCanvas(assessment);

  canvas.toBlob((blob) => {
    if (!blob) {
      // Fallback to dataURL
      const dataUrl = canvas.toDataURL("image/png");
      triggerDownload(dataUrl, assessment.level);
      return;
    }
    const url = URL.createObjectURL(blob);
    triggerDownload(url, assessment.level);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}

function triggerDownload(url: string, level: RiskLevel): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = `jobcheck-${level.toLowerCase()}-risk-assessment.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
