import "./ResultPanel.css";
import { Assessment, RiskLevel } from "../../types/types";
import { createBadge } from "../Badge/Badge";
import { createScoreGauge } from "../ScoreGauge/ScoreGauge";
import { createRiskOrb } from "../RiskOrb/RiskOrb";
import { createTooltip } from "../Tooltip/Tooltip";
import { createIcon } from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";
import { createButton } from "../Button/Button";
import { createFindingItem } from "../FindingItem/FindingItem";
import { ensureLegalEntitySuffix } from "../../engine/normalize";
import { buildFinalVerdict } from "./finalVerdict";
import type { VerdictVariant } from "./finalVerdict";
import { trackPdfDownload } from "../../utils/analytics";

export interface ResultPanelOptions {
  assessment: Assessment;
  jobUrl?: string;
  jobDescription?: string;
  fetchNotice?: string | null;
  onReset: () => void;
  onDownloadCard?: () => void;
  searchTimeSeconds?: number;
}

export function createResultPanel(options: ResultPanelOptions): HTMLElement {
  const { assessment, jobUrl, jobDescription, fetchNotice, onReset, onDownloadCard, searchTimeSeconds } =
    options;

  const panel = document.createElement("section");
  panel.className = "c-result-panel";

  panel.setAttribute("tabindex", "-1"); // lets main.ts move keyboard/screen-reader focus here

  // 1. Summary Section (Gauge + Level Badge + Confidence)
  const summarySection = document.createElement("div");
  summarySection.className = "c-result-panel__summary";

  const gauge = createScoreGauge({
    score: assessment.score,
    level: assessment.level,
  });

  // The orb sits behind the gauge and takes the colour of the level the gauge
  // is already showing, on the same tokens. It is decorative — the score, the
  // level badge and the reasons beside it all state the same thing in text, so
  // it is hidden from the accessibility tree rather than announced twice.
  const scoreStack = document.createElement("div");
  scoreStack.className = "c-result-panel__score-stack";

  const orbWrapper = document.createElement("div");
  orbWrapper.className = "c-result-panel__orb";
  orbWrapper.appendChild(
    createRiskOrb({
      state:
        assessment.level === "High"
          ? "high"
          : assessment.level === "Medium"
            ? "medium"
            : "low",
    }),
  );

  scoreStack.appendChild(orbWrapper);
  scoreStack.appendChild(gauge);
  summarySection.appendChild(scoreStack);

  const summaryText = document.createElement("div");
  summaryText.className = "c-result-panel__summary-text";

  const badgeRow = document.createElement("div");
  badgeRow.className = "l-cluster l-cluster--gap-sm";

  const levelVariant: "risk-low" | "risk-medium" | "risk-high" =
    assessment.level === "High"
      ? "risk-high"
      : assessment.level === "Medium"
        ? "risk-medium"
        : "risk-low";

  const levelBadge = createBadge({
    text: `${assessment.level} Risk`,
    variant: levelVariant,
    size: "lg",
  });
  badgeRow.appendChild(levelBadge);

  summaryText.appendChild(badgeRow);

  const scoreDesc = document.createElement("p");
  scoreDesc.className = "text-body";
  scoreDesc.textContent = getScoreDescription(
    assessment.level,
    assessment.score,
  );
  summaryText.appendChild(scoreDesc);

  // Confidence Row with Tooltip
  const confRow = document.createElement("div");
  confRow.className = "c-result-panel__confidence-row";

  const confLabel = document.createElement("span");
  confLabel.className = "text-body-sm";
  confLabel.textContent = `Confidence: ${assessment.confidence}`;
  confRow.appendChild(confLabel);

  const confTooltipText =
    assessment.confidence === "High"
      ? "High confidence: Both domain age records and page description text were analyzed."
      : assessment.confidence === "Medium"
        ? "Medium confidence: Analyzed with partial data (domain age or description text available)."
        : "Low confidence: Only URL structure was analyzed. Paste the job description above for higher accuracy.";

  const confTooltip = createTooltip({ text: confTooltipText });
  confRow.appendChild(confTooltip);

  summaryText.appendChild(confRow);

  // Search time display
  if (searchTimeSeconds !== undefined && searchTimeSeconds > 0) {
    const timeRow = document.createElement("div");
    timeRow.className = "c-result-panel__search-time";
    const timeLabel = document.createElement("span");
    timeLabel.className = "text-body-sm";
    timeLabel.textContent = `Search time: ${searchTimeSeconds}s`;
    timeRow.appendChild(timeLabel);
    summaryText.appendChild(timeRow);
  }

  summarySection.appendChild(summaryText);
  panel.appendChild(summarySection);

  // 2. Fetch / Verification Notice
  if (fetchNotice) {
    const isSuccess = fetchNotice.startsWith("✅");
    const displayNotice = isSuccess ? fetchNotice.replace(/^✅\s*/, "") : fetchNotice;

    const noticeEl = document.createElement("div");
    noticeEl.className = `c-result-panel__notice${isSuccess ? " c-result-panel__notice--success" : ""}`;

    const iconWrapper = document.createElement("span");
    iconWrapper.className = "c-result-panel__notice-icon";
    iconWrapper.appendChild(
      createIcon({
        name: isSuccess ? "shield-check" : "info",
        size: "sm",
        colorClass: isSuccess ? "c-icon--risk-low" : "c-icon--primary",
      }),
    );
    noticeEl.appendChild(iconWrapper);

    const textEl = document.createElement("span");
    textEl.className = "c-result-panel__notice-text";
    textEl.textContent = displayNotice;
    noticeEl.appendChild(textEl);

    panel.appendChild(noticeEl);
  }


  // 3. "Why we think this" section
  const findingsSection = document.createElement("div");
  findingsSection.className = "l-stack l-stack--gap-sm";

  const findingsTitle = document.createElement("h3");
  findingsTitle.className = "c-result-panel__section-title";
  findingsTitle.appendChild(
    createIcon({ name: "search", size: "md", colorClass: "c-icon--primary" }),
  );
  const titleText = document.createElement("span");

  // Filter out false positive findings when AI verified legitimacy
  const hasAiLegitimacyVerification = assessment.findings.some(
    (f) => f.id === "ai-verified-legitimate"
  );
  const falsePositiveFlagIds = [
    "upfront-payment",
    "task-scam",
    "sensitive-docs-early",
    "safe-browsing",
    "shortener",
    "lookalike-suspicious-tld",
    "link-in-description-high-risk",
    "remote-access-software",
    "mlm-referral",
    "paid-medical-exam",
    "cryptocurrency-payment",
    "investment-scheme",
    "advance-salary-loan",
    "fake-government-job",
    "fake-internship-conversion",
    "fake-verification-portal",
    "sender-domain-mismatch",
    "free-email-warning",
  ];

  const displayFindings = hasAiLegitimacyVerification
    ? assessment.findings.filter((f) => !falsePositiveFlagIds.includes(f.id))
    : assessment.findings;

  titleText.textContent = `Why we think this (${displayFindings.length} signals identified)`;
  findingsTitle.appendChild(titleText);
  findingsSection.appendChild(findingsTitle);

  if (displayFindings.length === 0) {
    const emptyBox = document.createElement("div");
    emptyBox.className = "c-result-panel__empty-findings";
    emptyBox.textContent =
      "No specific risk signals detected. Always verify opening on the official careers page.";
    findingsSection.appendChild(emptyBox);
  } else {
    const list = document.createElement("ul");
    list.className = "c-result-panel__findings-list";
    for (const finding of displayFindings) {
      list.appendChild(createFindingItem({ finding }));
    }
    findingsSection.appendChild(list);
  }
  panel.appendChild(findingsSection);

  // 3b. Links Found in Description Section (if any)
  if (assessment.linkAssessments && assessment.linkAssessments.length > 0) {
    const linksSection = document.createElement("div");
    linksSection.className = "l-stack l-stack--gap-sm";

    const linksTitle = document.createElement("h3");
    linksTitle.className = "c-result-panel__section-title";
    linksTitle.appendChild(
      createIcon({ name: "external-link", size: "md", colorClass: "c-icon--primary" }),
    );
    const linksTitleText = document.createElement("span");
    linksTitleText.textContent = `Embedded Links Inspection (${assessment.linkAssessments.length} link${assessment.linkAssessments.length > 1 ? "s" : ""} analyzed)`;
    linksTitle.appendChild(linksTitleText);
    linksSection.appendChild(linksTitle);

    const linksList = document.createElement("div");
    linksList.className = "c-result-panel__links-list";

    for (const linkItem of assessment.linkAssessments) {
      const card = document.createElement("div");
      const sub = linkItem.assessment;
      const variant =
        sub.level === "High"
          ? "risk-high"
          : sub.level === "Medium"
            ? "risk-medium"
            : "risk-low";

      card.className = `c-result-panel__link-card c-result-panel__link-card--${variant}`;

      // Card Header
      const cardHeader = document.createElement("div");
      cardHeader.className = "c-result-panel__link-card-header";

      const urlWrapper = document.createElement("div");
      urlWrapper.className = "c-result-panel__link-url-wrapper";
      urlWrapper.appendChild(
        createIcon({
          name: sub.level === "High" ? "shield-alert" : "external-link",
          size: "sm",
          colorClass: sub.level === "High" ? "c-icon--risk-high" : "c-icon--primary",
        }),
      );
      const urlText = document.createElement("span");
      urlText.className = "c-result-panel__link-url";
      urlText.textContent = linkItem.url;
      urlWrapper.appendChild(urlText);
      cardHeader.appendChild(urlWrapper);

      const badge = createBadge({
        text: `${sub.level} Risk (${sub.score}/100)`,
        variant: variant,
        size: "sm",
      });
      cardHeader.appendChild(badge);
      card.appendChild(cardHeader);

      // Warning text if High risk
      if (sub.level === "High") {
        const warning = document.createElement("div");
        warning.className = "c-result-panel__link-warning";
        warning.appendChild(
          createIcon({ name: "alert-triangle", size: "sm", colorClass: "c-icon--risk-high" }),
        );
        const warningText = document.createElement("span");
        warningText.innerHTML =
          "<strong>Security Warning:</strong> This link exhibits high-risk indicators (e.g. upfront fee demand, suspicious disposable TLD, or URL shortener). Do not pay or share credentials on this external site.";
        warning.appendChild(warningText);
        card.appendChild(warning);
      }

      // Link findings list
      if (sub.findings.length > 0) {
        const linkFindingsUl = document.createElement("ul");
        linkFindingsUl.className = "c-result-panel__link-findings";
        for (const f of sub.findings.slice(0, 4)) {
          linkFindingsUl.appendChild(createFindingItem({ finding: f }));
        }
        card.appendChild(linkFindingsUl);
      } else {
        const noRisk = document.createElement("p");
        noRisk.className = "text-body-sm";
        noRisk.style.color = "var(--color-text-muted)";
        noRisk.textContent = "No specific fraud signals detected on this external domain.";
        card.appendChild(noRisk);
      }

      // Fetch notice for this link (how content was retrieved or why it failed)
      if (linkItem.fetchNotice) {
        const linkNotice = document.createElement("div");
        linkNotice.className = "c-result-panel__link-notice";
        linkNotice.appendChild(
          createIcon({ name: "info", size: "sm", colorClass: "c-icon--primary" }),
        );
        const linkNoticeText = document.createElement("span");
        linkNoticeText.textContent = linkItem.fetchNotice;
        linkNotice.appendChild(linkNoticeText);
        card.appendChild(linkNotice);
      }

      linksList.appendChild(card);
    }

    linksSection.appendChild(linksList);
    panel.appendChild(linksSection);
  }

  // 3b-ii. AI investigation status. A scan where the AI layer did not run must
  // not look identical to a full scan — say so explicitly.
  if (assessment.aiIntel && assessment.aiIntel.status !== "completed") {
    const aiNotice = document.createElement("div");
    aiNotice.className = "c-result-panel__notice";

    const aiNoticeIcon = document.createElement("span");
    aiNoticeIcon.className = "c-result-panel__notice-icon";
    aiNoticeIcon.appendChild(
      createIcon({ name: "info", size: "sm", colorClass: "c-icon--primary" }),
    );
    aiNotice.appendChild(aiNoticeIcon);

    const aiNoticeText = document.createElement("span");
    aiNoticeText.className = "c-result-panel__notice-text";
    // Name the actual cause. "Could not be completed" for every distinct
    // failure (missing key, timeout, rate limit) tells the user nothing about
    // whether retrying will help.
    const failureDetail: Record<string, string> = {
      "no-api-key":
        "No Gemini API key is configured, so the web investigation could not run.",
      timeout: "The AI investigation took too long to complete. This can happen with slow-loading job platforms (like Telegram channels). The automated rule-based scan is still reliable for this link.",
      "rate-limited": "Server is cooling down. Try checking this link again in a few moments.",
      network: "Could not connect to Google's search service. Check your internet connection and try again.",
      "bad-response": "Server returned unexpected data. Try checking this link again.",
    };
    const reason =
      assessment.aiIntel.status === "skipped"
        ? "No Gemini API key is configured, so the web investigation could not run."
        : (assessment.aiIntel.failureReason
            ? failureDetail[assessment.aiIntel.failureReason]
            : undefined) ??
          "The AI web investigation could not be completed.";
    aiNoticeText.textContent = `${reason} This score is based on the automated rules only — treat it as a lower bound on the actual risk.`;
    aiNotice.appendChild(aiNoticeText);

    panel.appendChild(aiNotice);
  }

  // 3c. Google AI Web Intelligence Section (if available)
  if (assessment.aiIntel && assessment.aiIntel.status === "completed") {
    const ai = assessment.aiIntel;
    const aiSection = document.createElement("div");
    aiSection.className = "l-stack l-stack--gap-sm";

    // Deliberate product decision: this section is always titled "Google AI
    // Search Intelligence", whether or not the grounded attempts succeeded and
    // whatever `grounded` says. The flag is still returned by the function (and
    // surfaced in `groundingError`) for diagnostics, but the panel does not
    // differentiate on it.
    const aiHeader = document.createElement("div");
    aiHeader.className = "l-cluster l-cluster--between";

    const aiTitle = document.createElement("h3");
    aiTitle.className = "c-result-panel__section-title";
    aiTitle.style.marginBottom = "0";
    aiTitle.appendChild(
      createIcon({ name: "search", size: "md", colorClass: "c-icon--primary" }),
    );
    const aiTitleText = document.createElement("span");
    aiTitleText.textContent = "Google AI Search Intelligence";
    aiTitle.appendChild(aiTitleText);
    aiHeader.appendChild(aiTitle);

    const aiBadge = createBadge({
      text: ai.isScamLikely ? "AI Warning: Scam Signals" : "AI Verified Entity",
      variant: ai.isScamLikely ? "risk-high" : "risk-low",
      size: "sm",
    });
    aiHeader.appendChild(aiBadge);
    aiSection.appendChild(aiHeader);

    const aiCard = document.createElement("div");
    aiCard.className = `c-result-panel__ai-card${ai.isScamLikely ? " c-result-panel__ai-card--risk" : " c-result-panel__ai-card--trust"}`;

    if (ai.summary) {
      const summaryP = document.createElement("p");
      summaryP.className = "text-body";
      summaryP.style.fontWeight = "var(--font-weight-medium, 500)";
      summaryP.textContent = ai.summary;
      aiCard.appendChild(summaryP);
    }

    if (ai.companyName || ai.digitalFootprint) {
      const companyMeta = document.createElement("div");
      companyMeta.className = "l-cluster l-cluster--gap-sm";
      companyMeta.style.fontSize = "var(--font-size-xs)";

      if (ai.companyName) {
        const compTag = document.createElement("span");
        compTag.className = "text-body-sm";
        compTag.style.fontWeight = "var(--font-weight-bold, 700)";
        compTag.textContent = `Employer: ${ai.companyName}`;
        companyMeta.appendChild(compTag);
      }

      if (ai.digitalFootprint) {
        const fpBadge = document.createElement("span");
        const isFpGood = ai.digitalFootprint === "verified" || ai.digitalFootprint === "moderate";
        fpBadge.className = `c-badge c-badge--${isFpGood ? "risk-low" : "risk-high"} c-badge--xs`;
        fpBadge.textContent =
          ai.digitalFootprint === "verified"
            ? "Verified Digital Footprint"
            : ai.digitalFootprint === "moderate"
              ? "Moderate Online Presence"
              : ai.digitalFootprint === "minimal"
                ? "Minimal Digital Footprint"
                : "Suspicious / Ghost Entity";
        companyMeta.appendChild(fpBadge);
      }

      aiCard.appendChild(companyMeta);
    }

    // Enhanced Employee Reviews Section with scores
    if (ai.employeeReviews && ai.employeeReviews.length > 0) {
      const reviewsContainer = document.createElement("div");
      reviewsContainer.className = "c-result-panel__reviews-container";

      const reviewsHeader = document.createElement("div");
      reviewsHeader.className = "c-result-panel__reviews-header";

      const reviewsTitle = document.createElement("h4");
      reviewsTitle.className = "text-body-sm";
      reviewsTitle.style.fontWeight = "var(--font-weight-bold, 700)";
      reviewsTitle.textContent = "Employee Reviews & Ratings";
      reviewsHeader.appendChild(reviewsTitle);

      // Overall score badge
      if (ai.overallReviewScore !== undefined) {
        const scoreBadge = document.createElement("span");
        const scoreClass = ai.overallReviewScore >= 4 ? "risk-low" : ai.overallReviewScore >= 3 ? "warning" : "risk-high";
        scoreBadge.className = `c-badge c-badge--${scoreClass} c-badge--sm`;
        scoreBadge.textContent = `⭐ ${ai.overallReviewScore.toFixed(1)}/5.0`;
        reviewsHeader.appendChild(scoreBadge);
      }

      reviewsContainer.appendChild(reviewsHeader);

      // Scam-review banner. The model's `hasScamReviews` flag is not always set,
      // so treat any per-review warning as a scam report too — a red banner is
      // too important to lose to a missing boolean.
      const reviewScamWarnings = ai.employeeReviews.flatMap(
        (r) => r.scamWarnings ?? [],
      );
      const hasScamReviews =
        ai.hasScamReviews === true || reviewScamWarnings.length > 0;

      const reviewBanner = document.createElement("div");
      if (hasScamReviews) {
        reviewBanner.className =
          "c-result-panel__review-banner c-result-panel__review-banner--alert";
        reviewBanner.innerHTML = `
          <span class="c-result-panel__review-banner-icon">🚨</span>
          <div class="c-result-panel__review-banner-body">
            <strong>Scam reports found in employee reviews</strong>
            <p>${escapeHtml(
              reviewScamWarnings.length > 0
                ? reviewScamWarnings.slice(0, 3).join(" · ")
                : "Reviewers reported fraud, fake offers or advance-fee demands at this employer.",
            )}</p>
          </div>
        `;
      } else {
        const checkedSources = ai.employeeReviews
          .map((r) => r.source)
          .filter((s) => Boolean(s));
        reviewBanner.className =
          "c-result-panel__review-banner c-result-panel__review-banner--clear";
        reviewBanner.innerHTML = `
          <span class="c-result-panel__review-banner-icon">✓</span>
          <div class="c-result-panel__review-banner-body">
            <strong>No scam or fraud reports in employee reviews</strong>
            <p>Reviewed ${escapeHtml(checkedSources.join(", ") || "public review sites")} — no reviewer reported a fake offer, a fee demand, or unpaid work. A clean review record is a positive signal, not proof.</p>
          </div>
        `;
      }
      reviewsContainer.appendChild(reviewBanner);

      // CRITICAL: Extract and display ALL scam reports at top for maximum visibility
      const allScamReports = ai.employeeReviews
        .flatMap((review) =>
          (review.scamReports ?? []).map((report) => ({
            ...report,
            sourceReviewPlatform: review.source,
          })),
        )
        .slice(0, 10); // Show up to 10 most critical complaints

      if (allScamReports.length > 0) {
        const criticalWarningsSection = document.createElement("div");
        criticalWarningsSection.className = "c-result-panel__critical-warnings-section";

        const warningTitle = document.createElement("div");
        warningTitle.className = "c-result-panel__critical-warnings-title";
        warningTitle.innerHTML = `
          <span style="font-size: 1.5rem; margin-right: 8px;">🚨</span>
          <span><strong>CRITICAL: ${allScamReports.length} Individual Complaint${allScamReports.length > 1 ? "s" : ""} Found</strong></span>
        `;
        criticalWarningsSection.appendChild(warningTitle);

        for (const report of allScamReports) {
          const reportCard = document.createElement("div");
          reportCard.className = "c-result-panel__critical-scam-card";

          // Header with reporter info
          const headerRow = document.createElement("div");
          headerRow.className = "c-result-panel__critical-scam-header";

          const reporterInfo = document.createElement("div");
          reporterInfo.className = "c-result-panel__critical-reporter-info";

          const reporterNameEl = document.createElement("span");
          reporterNameEl.className = "c-result-panel__critical-reporter-name";
          reporterNameEl.textContent = report.reviewerName || "Anonymous User";
          reporterInfo.appendChild(reporterNameEl);

          if (report.reviewerRole) {
            const roleEl = document.createElement("span");
            roleEl.className = "c-result-panel__critical-reporter-role";
            roleEl.textContent = report.reviewerRole;
            reporterInfo.appendChild(roleEl);
          }

          if (report.reportedAt) {
            const dateEl = document.createElement("span");
            dateEl.className = "c-result-panel__critical-report-date";
            dateEl.textContent = `${report.reportedAt}`;
            reporterInfo.appendChild(dateEl);
          }

          headerRow.appendChild(reporterInfo);

          // Platform badge
          const platformBadge = document.createElement("span");
          platformBadge.className = "c-result-panel__critical-platform-badge";
          platformBadge.textContent = report.platform;
          headerRow.appendChild(platformBadge);

          reportCard.appendChild(headerRow);

          // Complaint text - highlighted for visibility
          const complaintEl = document.createElement("div");
          complaintEl.className = "c-result-panel__critical-complaint-text";
          complaintEl.textContent = report.complaintText;
          reportCard.appendChild(complaintEl);

          // Direct link to source - prominently styled
          if (report.sourceUrl) {
            const linkContainer = document.createElement("div");
            linkContainer.className = "c-result-panel__critical-link-container";
            const sourceLink = document.createElement("a");
            sourceLink.className = "c-result-panel__critical-source-link";
            sourceLink.href = report.sourceUrl;
            sourceLink.target = "_blank";
            sourceLink.rel = "noopener noreferrer";
            sourceLink.innerHTML = `
              <span>🔗 View Full Complaint on ${report.sourceReviewPlatform}</span>
              <span style="font-size: 0.85rem; opacity: 0.7;">→</span>
            `;
            linkContainer.appendChild(sourceLink);
            reportCard.appendChild(linkContainer);
          }

          criticalWarningsSection.appendChild(reportCard);
        }

        // Insert critical warnings at the very top (after banner)
        const bannerNode = reviewsContainer.children[1] || null;
        reviewsContainer.insertBefore(criticalWarningsSection, bannerNode);
      }

      // Individual review sources — PREFER AMBITIONBOX LINKS
      // Sort to show AmbitionBox first, then others
      const sortedReviews = [...ai.employeeReviews].sort((a, b) => {
        const aIsAmbition = a.source?.toLowerCase().includes("ambitionbox") ? 0 : 1;
        const bIsAmbition = b.source?.toLowerCase().includes("ambitionbox") ? 0 : 1;
        return aIsAmbition - bIsAmbition;
      });

      for (const review of sortedReviews) {
        const reviewCard = document.createElement("div");
        reviewCard.className = "c-result-panel__review-source";

        const sourceHeader = document.createElement("div");
        sourceHeader.className = "c-result-panel__review-source-header";

        const sourceName = document.createElement("span");
        sourceName.className = "text-body-sm";
        sourceName.style.fontWeight = "var(--font-weight-medium, 500)";
        sourceName.textContent = review.source || "Unknown Source";
        sourceHeader.appendChild(sourceName);

        if (review.rating !== undefined && typeof review.rating === "number") {
          const ratingSpan = document.createElement("span");
          ratingSpan.className = "text-body-xs";
          ratingSpan.textContent = `${review.rating.toFixed(1)}/5.0`;
          if (review.totalReviews && typeof review.totalReviews === "number") {
            ratingSpan.textContent += ` (${review.totalReviews.toLocaleString()} reviews)`;
          }
          sourceHeader.appendChild(ratingSpan);
        }

        reviewCard.appendChild(sourceHeader);

        // Detailed individual scam complaint reports (preferred)
        if (review.scamReports && review.scamReports.length > 0) {
          const scamReportsContainer = document.createElement("div");
          scamReportsContainer.className = "c-result-panel__scam-reports-container";

          const scamReportsTitle = document.createElement("div");
          scamReportsTitle.className = "c-result-panel__scam-reports-title";
          scamReportsTitle.innerHTML = `⛔ <strong>Individual Scam Complaints Found (${review.scamReports.length})</strong>`;
          scamReportsContainer.appendChild(scamReportsTitle);

          for (const report of review.scamReports) {
            const reportCard = document.createElement("div");
            reportCard.className = "c-result-panel__scam-report-card";

            // Reporter identity line
            const identityRow = document.createElement("div");
            identityRow.className = "c-result-panel__scam-report-identity";

            const reporterName = document.createElement("span");
            reporterName.className = "c-result-panel__scam-reporter-name";
            reporterName.textContent = report.reviewerName || "Anonymous";
            identityRow.appendChild(reporterName);

            if (report.reviewerRole) {
              const roleSpan = document.createElement("span");
              roleSpan.className = "c-result-panel__scam-reporter-role";
              roleSpan.textContent = report.reviewerRole;
              identityRow.appendChild(roleSpan);
            }

            if (report.reportedAt) {
              const dateSpan = document.createElement("span");
              dateSpan.className = "c-result-panel__scam-report-date";
              dateSpan.textContent = report.reportedAt;
              identityRow.appendChild(dateSpan);
            }

            reportCard.appendChild(identityRow);

            // Platform badge
            const platformBadge = document.createElement("span");
            platformBadge.className = "c-result-panel__scam-platform-badge";
            platformBadge.textContent = report.platform;
            reportCard.appendChild(platformBadge);

            // Complaint text
            const complaintEl = document.createElement("blockquote");
            complaintEl.className = "c-result-panel__scam-complaint";
            complaintEl.textContent = report.complaintText;
            reportCard.appendChild(complaintEl);

            // Source link
            if (report.sourceUrl) {
              const linkRow = document.createElement("div");
              linkRow.className = "c-result-panel__scam-source-link-row";
              const sourceLink = document.createElement("a");
              sourceLink.className = "c-result-panel__scam-source-link";
              sourceLink.href = report.sourceUrl;
              sourceLink.target = "_blank";
              sourceLink.rel = "noopener noreferrer";
              sourceLink.textContent = "🔗 View original complaint";
              linkRow.appendChild(sourceLink);
              reportCard.appendChild(linkRow);
            }

            scamReportsContainer.appendChild(reportCard);
          }

          reviewCard.appendChild(scamReportsContainer);
        } else if (review.scamWarnings && review.scamWarnings.length > 0) {
          // Fallback: brief summaries when no detailed reports extracted
          for (const warning of review.scamWarnings) {
            const warningEl = document.createElement("div");
            warningEl.className = "c-result-panel__review-scam";
            warningEl.innerHTML = `<span class="c-result-panel__review-scam-icon">⛔</span><span>${escapeHtml(warning)}</span>`;
            reviewCard.appendChild(warningEl);
          }
        }

        // Positive highlights
        if (review.positiveHighlights && review.positiveHighlights.length > 0) {
          const posDiv = document.createElement("div");
          posDiv.className = "c-result-panel__review-highlights c-result-panel__review-highlights--positive";
          const posTitle = document.createElement("div");
          posTitle.className = "c-result-panel__review-highlights-title";
          posTitle.textContent = "👍 Positive:";
          posDiv.appendChild(posTitle);
          const posList = document.createElement("ul");
          for (const item of review.positiveHighlights) {
            const li = document.createElement("li");
            li.textContent = item;
            posList.appendChild(li);
          }
          posDiv.appendChild(posList);
          reviewCard.appendChild(posDiv);
        }

        // Negative highlights
        if (review.negativeHighlights && review.negativeHighlights.length > 0) {
          const negDiv = document.createElement("div");
          negDiv.className = "c-result-panel__review-highlights c-result-panel__review-highlights--negative";
          const negTitle = document.createElement("div");
          negTitle.className = "c-result-panel__review-highlights-title";
          negTitle.textContent = "👎 Negative:";
          negDiv.appendChild(negTitle);
          const negList = document.createElement("ul");
          for (const item of review.negativeHighlights) {
            const li = document.createElement("li");
            li.textContent = item;
            negList.appendChild(li);
          }
          negDiv.appendChild(negList);
          reviewCard.appendChild(negDiv);
        }

        // Platform review page source link
        if (review.sourceUrl) {
          const sourceRow = document.createElement("div");
          sourceRow.className = "c-result-panel__review-source-link-row";
          const sourceLink = document.createElement("a");
          sourceLink.className = "c-result-panel__review-source-link";
          sourceLink.href = review.sourceUrl;
          sourceLink.target = "_blank";
          sourceLink.rel = "noopener noreferrer";
          sourceLink.textContent = "🔗 View reviews";
          sourceRow.appendChild(sourceLink);
          reviewCard.appendChild(sourceRow);
        }

        reviewsContainer.appendChild(reviewCard);
      }

      aiCard.appendChild(reviewsContainer);
    } else if (ai.companyReviews) {
      const reviewsRow = document.createElement("div");
      reviewsRow.className = "text-body-xs";
      reviewsRow.style.color = "var(--color-text-secondary)";
      reviewsRow.textContent = `Employee Reviews & Sentiment: ${ai.companyReviews}`;
      aiCard.appendChild(reviewsRow);
    }

    // Enhanced Location Verification
    if (ai.locationVerification) {
      const loc = ai.locationVerification;
      const locationContainer = document.createElement("div");
      locationContainer.className = "c-result-panel__location-verification";

      const locationHeader = document.createElement("h4");
      locationHeader.className = "text-body-sm";
      locationHeader.style.fontWeight = "var(--font-weight-bold, 700)";
      locationHeader.textContent = "📍 Location Verification";
      locationContainer.appendChild(locationHeader);

      const locationCard = document.createElement("div");
      const cardClass = loc.verificationStatus === "unverified" ? "risk-high" : loc.verificationStatus === "verified" ? "risk-low" : "warning";
      locationCard.className = `c-result-panel__location-card c-result-panel__location-card--${cardClass}`;

      // Company location
      if (ai?.companyLocation?.fullAddress) {
        const companyDiv = document.createElement("div");
        companyDiv.className = "c-result-panel__location-row";
        companyDiv.innerHTML = `<strong>Company Address:</strong> ${ai.companyLocation.fullAddress}`;
        if (loc.verificationStatus === "verified") {
          const mapLink = document.createElement("a");
          mapLink.className = "c-result-panel__review-source-link";
          const queryPart = ai.companyLocation.fullAddress.split(",").slice(0, 2).join(" ").trim().replace(/\s+/g, "+");
          mapLink.href = `https://maps.google.com/?q=${queryPart}`;
          mapLink.target = "_blank";
          mapLink.rel = "noopener noreferrer";
          mapLink.textContent = "📍 Google Maps Verified Business";
          companyDiv.appendChild(document.createTextNode(" "));
          companyDiv.appendChild(mapLink);
        }
        locationCard.appendChild(companyDiv);
      }

      // Job location from description
      if (loc.jobLocationFromDescription) {
        const jobDiv = document.createElement("div");
        jobDiv.className = "c-result-panel__location-row";
        jobDiv.innerHTML = `<strong>Job Location (from description):</strong> ${loc.jobLocationFromDescription}`;
        locationCard.appendChild(jobDiv);
      }

      // Match status badge
      const statusDiv = document.createElement("div");
      statusDiv.className = "c-result-panel__location-row";
      const statusBadge = document.createElement("span");
      statusBadge.className = `c-badge c-badge--${cardClass} c-badge--sm`;
      statusBadge.textContent =
        loc.verificationStatus === "verified" ? (loc.isExactMatch ? "✅ Exact Match" : "✅ Verified (Hierarchical)") :
        loc.verificationStatus === "unverified" ? "❌ Mismatch" :
        "❓ No Location Info";
      statusDiv.appendChild(statusBadge);
      locationCard.appendChild(statusDiv);

      // Details and reason
      const detailsDiv = document.createElement("div");
      detailsDiv.className = "c-result-panel__location-details text-body-xs";
      detailsDiv.textContent = loc.reason;
      locationCard.appendChild(detailsDiv);

      locationContainer.appendChild(locationCard);
      aiCard.appendChild(locationContainer);
    } else if (ai.physicalLocationStatus) {
      const locationRow = document.createElement("div");
      locationRow.className = "text-body-xs";
      locationRow.style.color = "var(--color-text-secondary)";
      const isLocMatched =
        ai.physicalLocationStatus.toLowerCase().includes("matched") ||
        ai.physicalLocationStatus.toLowerCase().includes("confirmed");
      locationRow.textContent = `Physical Location Status: ${isLocMatched ? "✅ " : "📍 "}${ai.physicalLocationStatus}`;
      aiCard.appendChild(locationRow);
    }

    if (ai.officialDomain || ai.officialLinkedinUrl) {
      const entityLinksRow = document.createElement("div");
      entityLinksRow.className = "c-result-panel__entity-links-row";

      if (ai.officialDomain) {
        const domainChip = document.createElement("a");
        domainChip.className = "c-result-panel__entity-link-chip";
        const domainHref = ai.officialDomain.startsWith("http") ? ai.officialDomain : `https://${ai.officialDomain}`;
        domainChip.href = domainHref;
        domainChip.target = "_blank";
        domainChip.rel = "noopener noreferrer";
        domainChip.textContent = "🌐 Official Website";
        entityLinksRow.appendChild(domainChip);
      }

      if (ai.officialLinkedinUrl) {
        const liChip = document.createElement("a");
        liChip.className = "c-result-panel__entity-link-chip c-result-panel__entity-link-chip--linkedin";
        liChip.href = ai.officialLinkedinUrl;
        liChip.target = "_blank";
        liChip.rel = "noopener noreferrer";
        liChip.textContent = "🔗 LinkedIn Company Page";
        entityLinksRow.appendChild(liChip);
      }

      aiCard.appendChild(entityLinksRow);
    }

    let auditContainerEl: HTMLElement | null = null;
    if (ai.companyAudit) {
      const audit = ai.companyAudit;
      const auditContainer = document.createElement("div");
      auditContainer.className = "c-result-panel__audit-container";

      // Header
      const auditHeader = document.createElement("div");
      auditHeader.className = "c-result-panel__audit-header";

      const titleGroup = document.createElement("div");
      titleGroup.className = "c-result-panel__audit-title-group";

      const brandRow = document.createElement("div");
      brandRow.className = "c-result-panel__audit-brand-row";

      const iconBox = document.createElement("div");
      iconBox.className = "c-result-panel__audit-icon-box";
      iconBox.textContent = "🏢";
      brandRow.appendChild(iconBox);

      const fullCompanyName = ensureLegalEntitySuffix(audit.companyName);
      const auditTitle = document.createElement("h4");
      auditTitle.className = "c-result-panel__audit-title";
      auditTitle.textContent = `Company Background Audit: ${fullCompanyName}`;
      brandRow.appendChild(auditTitle);

      titleGroup.appendChild(brandRow);

      const auditSub = document.createElement("div");
      auditSub.className = "c-result-panel__audit-subtitle";
      auditSub.textContent = "Employer background audit, cross-checked against the 100-criteria checklist below";
      titleGroup.appendChild(auditSub);

      auditHeader.appendChild(titleGroup);

      // Score Pill. Prefer the locally computed checklist over the model's own
      // self-reported count, which is a guess; fall back to the model's numbers
      // only when no computed report exists.
      const computed = assessment.criteria;
      const isPass = audit.overallVerdict === "verified" || audit.auditScore >= 70;
      const isFail = audit.overallVerdict === "suspicious" || audit.auditScore < 40;
      const pillVariant = isPass ? "pass" : isFail ? "fail" : "warn";
      const pillText =
        computed && computed.assessed > 0
          ? `${computed.passed}/${computed.assessed} Assessed Criteria Passed (${computed.score ?? 0}/100)`
          : `${audit.criteriaPassedCount}/${audit.totalCriteriaCount} Criteria Satisfied (${audit.auditScore}/100)`;
      const pill = document.createElement("div");
      pill.className = `c-result-panel__audit-score-pill c-result-panel__audit-score-pill--${pillVariant}`;
      pill.innerHTML = `
        <span class="c-result-panel__audit-pill-dot"></span>
        <span class="c-result-panel__audit-pill-text">${escapeHtml(pillText)}</span>
      `;
      auditHeader.appendChild(pill);

      auditContainer.appendChild(auditHeader);

      // Progress bar
      const scoreBar = document.createElement("div");
      scoreBar.className = "c-result-panel__audit-score-bar";

      const progress = document.createElement("div");
      progress.className = "c-result-panel__audit-progress";

      const fill = document.createElement("div");
      fill.className = `c-result-panel__audit-progress-fill c-result-panel__audit-progress-fill--${pillVariant}`;
      // The bar is scaled, not resized (see ResultPanel.css): a width
      // transition relayouts and repaints every frame, a transform does not.
      // `--progress` is a unitless 0..1 ratio; the 5% floor keeps a very low
      // score visible rather than invisible. It is set on the next frame so
      // the bar grows from empty instead of appearing already full — under
      // prefers-reduced-motion the transition is zero-length and it simply
      // starts at its final width.
      const progressRatio =
        Math.max(5, Math.min(100, computed?.score ?? audit.auditScore)) / 100;
      requestAnimationFrame(() => {
        fill.style.setProperty("--progress", progressRatio.toString());
      });
      progress.appendChild(fill);

      scoreBar.appendChild(progress);
      auditContainer.appendChild(scoreBar);

      // 6 Pillars Grid
      const grid = document.createElement("div");
      grid.className = "c-result-panel__audit-grid";

      const pillars = [
        { pillar: audit.legalStatus, icon: "🏛️", defaultTitle: "Legal Registration & MCA" },
        { pillar: audit.physicalOffice, icon: "📍", defaultTitle: "Physical Office & Infrastructure" },
        { pillar: audit.digitalFootprint, icon: "🌐", defaultTitle: "Digital Footprint & Domain" },
        { pillar: audit.employeeReviews, icon: "👥", defaultTitle: "Employee Sentiment & Ratings" },
        { pillar: audit.fraudDatabaseCheck, icon: "🛡️", defaultTitle: "Fraud & Cybercrime Check" },
        { pillar: audit.hiringAuthenticity, icon: "📑", defaultTitle: "Hiring Process & Offer Authenticity" },
      ];

      for (const item of pillars) {
        if (!item.pillar) continue;
        const card = document.createElement("div");
        const status = item.pillar.status || (isFail ? "fail" : "pass");
        card.className = `c-result-panel__audit-card c-result-panel__audit-card--${status}`;

        const head = document.createElement("div");
        head.className = "c-result-panel__audit-card-head";

        const cardTitle = document.createElement("div");
        cardTitle.className = "c-result-panel__audit-card-title";
        cardTitle.innerHTML = `
          <span class="c-result-panel__audit-pillar-icon">${item.icon}</span>
          <span class="c-result-panel__audit-pillar-name">${escapeHtml(item.pillar.title || item.defaultTitle)}</span>
        `;
        head.appendChild(cardTitle);

        const badge = document.createElement("span");
        badge.className = `c-badge c-badge--${status === "pass" ? "risk-low" : status === "fail" ? "risk-high" : "risk-medium"} c-badge--xs`;
        badge.textContent = status === "pass" ? "PASS ✓" : status === "fail" ? "FAIL ⚠️" : "WARN ℹ️";
        head.appendChild(badge);

        card.appendChild(head);

        const desc = document.createElement("div");
        desc.className = "c-result-panel__audit-card-desc";
        desc.innerHTML = `
          <span class="c-result-panel__audit-card-dot c-result-panel__audit-card-dot--${status}"></span>
          <span class="c-result-panel__audit-card-text">${escapeHtml(item.pillar.details)}</span>
        `;
        card.appendChild(desc);

        // Source link — only shown when the pillar passed (i.e. the AI actually
        // found something; a fail/warn just means "not found", so the URL would
        // be a generic search page and is not useful to show).
        if (item.pillar.sourceUrl && item.pillar.status === "pass") {
          const pillarSource = document.createElement("a");
          pillarSource.className = "c-result-panel__audit-card-source-link";
          pillarSource.href = item.pillar.sourceUrl;
          pillarSource.target = "_blank";
          pillarSource.rel = "noopener noreferrer";
          pillarSource.textContent = "🔗 View source";
          card.appendChild(pillarSource);
        }

        grid.appendChild(card);
      }

      auditContainer.appendChild(grid);
      auditContainerEl = auditContainer;
    }

    if (ai.claimVerifications && ai.claimVerifications.length > 0) {
      const claimsSection = document.createElement("div");
      claimsSection.className = "l-stack l-stack--gap-xs";
      claimsSection.style.marginTop = "var(--space-2)";

      const claimsTitle = document.createElement("div");
      claimsTitle.className = "c-result-panel__subheading";
      claimsTitle.innerHTML = `<span>📑</span> <span>Recruiter Description Fact-Checks (${ai.claimVerifications.length} verified):</span>`;
      claimsSection.appendChild(claimsTitle);

      const claimsList = document.createElement("ul");
      claimsList.className = "c-result-panel__claims-list";
      for (const cv of ai.claimVerifications) {
        const item = document.createElement("li");
        const isVerified = cv.verifiedStatus === "verified";
        const isContradicted = cv.verifiedStatus === "contradicted";
        const statusClass = isVerified ? "verified" : isContradicted ? "contradicted" : "unverified";
        const statusLabel = isVerified ? "VERIFIED MATCH ✓" : isContradicted ? "CONTRADICTED ✗" : "UNCONFIRMED ℹ";
        const statusIcon = isVerified ? "✅" : isContradicted ? "❌" : "ℹ️";

        item.className = `c-result-panel__claim-card c-result-panel__claim-card--${statusClass}`;
        item.innerHTML = `
          <div class="c-result-panel__claim-head">
            <span class="c-result-panel__claim-type">[${escapeHtml(cv.claimType.toUpperCase())}]</span>
            <span class="c-result-panel__claim-badge c-result-panel__claim-badge--${statusClass}">
              <span>${statusIcon}</span> <span>${statusLabel}</span>
            </span>
          </div>
          <div class="c-result-panel__claim-body">
            <div class="c-result-panel__claim-claimed">
              <span class="c-result-panel__claim-lbl">Recruiter Claim:</span>
              <span class="c-result-panel__claim-val">"${escapeHtml(cv.claimedValue)}"</span>
            </div>
            <div class="c-result-panel__claim-finding">
              <span class="c-result-panel__claim-lbl">Ground Truth:</span>
              <span class="c-result-panel__claim-val">${escapeHtml(cv.details)}</span>
            </div>
          </div>
        `;
        claimsList.appendChild(item);
      }
      claimsSection.appendChild(claimsList);
      aiCard.appendChild(claimsSection);
    }

    if (ai.scamSignals && ai.scamSignals.length > 0) {
      const signalsSection = document.createElement("div");
      signalsSection.className = "l-stack l-stack--gap-xs";
      signalsSection.style.marginTop = "var(--space-2)";

      const signalsTitle = document.createElement("div");
      signalsTitle.className = "c-result-panel__subheading c-result-panel__subheading--danger";
      signalsTitle.innerHTML = `<span>⚠️</span> <span>Critical Fraud Indicators Detected (${ai.scamSignals.length}):</span>`;
      signalsSection.appendChild(signalsTitle);

      const signalsUl = document.createElement("ul");
      signalsUl.className = "c-result-panel__signals-list";
      for (const sig of ai.scamSignals) {
        const li = document.createElement("li");
        li.className = "c-result-panel__signal-card c-result-panel__signal-card--scam";
        li.innerHTML = `
          <div class="c-result-panel__signal-icon">⚠️</div>
          <div class="c-result-panel__signal-body">
            <div class="c-result-panel__signal-tag">CRITICAL RISK SIGNAL</div>
            <div class="c-result-panel__signal-text">${escapeHtml(sig)}</div>
          </div>
        `;
        signalsUl.appendChild(li);
      }
      signalsSection.appendChild(signalsUl);
      aiCard.appendChild(signalsSection);
    } else if (ai.trustSignals && ai.trustSignals.length > 0) {
      const signalsSection = document.createElement("div");
      signalsSection.className = "l-stack l-stack--gap-xs";
      signalsSection.style.marginTop = "var(--space-2)";

      const signalsTitle = document.createElement("div");
      signalsTitle.className = "c-result-panel__subheading c-result-panel__subheading--trust";
      signalsTitle.innerHTML = `<span>✓</span> <span>Confirmed Legitimacy Indicators (${ai.trustSignals.length}):</span>`;
      signalsSection.appendChild(signalsTitle);

      const trustUl = document.createElement("ul");
      trustUl.className = "c-result-panel__signals-list";
      for (const sig of ai.trustSignals) {
        const li = document.createElement("li");
        li.className = "c-result-panel__signal-card c-result-panel__signal-card--trust";
        li.innerHTML = `
          <div class="c-result-panel__signal-icon">✓</div>
          <div class="c-result-panel__signal-body">
            <div class="c-result-panel__signal-tag">VERIFIED TRUST SIGNAL</div>
            <div class="c-result-panel__signal-text">${escapeHtml(sig)}</div>
          </div>
        `;
        trustUl.appendChild(li);
      }
      signalsSection.appendChild(trustUl);
      aiCard.appendChild(signalsSection);
    }

    if (ai.sources && ai.sources.length > 0) {
      const sourcesRow = document.createElement("div");
      sourcesRow.className = "c-result-panel__ai-sources";
      const sourcesLabel = document.createElement("span");
      sourcesLabel.className = "text-body-xs";
      sourcesLabel.style.fontWeight = "700";
      sourcesLabel.textContent = "Sources cited by Google Grounding:";
      sourcesRow.appendChild(sourcesLabel);

      const sourceChips = document.createElement("div");
      sourceChips.className = "c-result-panel__source-chips";

      for (const src of ai.sources) {
        const link = document.createElement("a");
        link.className = "c-result-panel__ai-source-chip";
        link.href = src.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.innerHTML = `<span>🔗</span> <span>${escapeHtml(src.title || src.url)}</span>`;
        sourceChips.appendChild(link);
      }
      sourcesRow.appendChild(sourceChips);
      aiCard.appendChild(sourcesRow);
    }

    aiSection.appendChild(aiCard);
    if (auditContainerEl) {
      aiSection.appendChild(auditContainerEl);
    }
    panel.appendChild(aiSection);
  }

  // 3d. The 100-criteria employment-integrity checklist. Computed locally from
  // evidence the engine already gathered, so unlike the AI section above it
  // renders on every scan. Criteria that could not be checked say so rather
  // than being quietly dropped — and they are excluded from the score.
  if (assessment.criteria) {
    const report = assessment.criteria;

    const criteriaSection = document.createElement("div");
    criteriaSection.className = "l-stack l-stack--gap-sm";

    const criteriaHeading = document.createElement("h3");
    criteriaHeading.className = "c-result-panel__section-title";
    criteriaHeading.appendChild(
      createIcon({ name: "shield-check", size: "md", colorClass: "c-icon--primary" }),
    );
    const criteriaHeadingText = document.createElement("span");
    criteriaHeadingText.textContent = `Employment Integrity Checklist (${report.total} criteria)`;
    criteriaHeading.appendChild(criteriaHeadingText);
    criteriaSection.appendChild(criteriaHeading);

    const summary = document.createElement("div");
    summary.className = "c-criteria__summary";
    const summaryParts: Array<[string, number, string]> = [
      ["Passed", report.passed, "pass"],
      ["Warnings", report.warned, "warn"],
      ["Failed", report.failed, "fail"],
      ["Not assessed", report.notAssessed, "na"],
    ];
    for (const [label, value, variant] of summaryParts) {
      const chip = document.createElement("div");
      chip.className = `c-criteria__chip c-criteria__chip--${variant}`;
      const chipValue = document.createElement("span");
      chipValue.className = "c-criteria__chip-value";
      chipValue.textContent = String(value);
      const chipLabel = document.createElement("span");
      chipLabel.className = "c-criteria__chip-label";
      chipLabel.textContent = label;
      chip.appendChild(chipValue);
      chip.appendChild(chipLabel);
      summary.appendChild(chip);
    }
    criteriaSection.appendChild(summary);

    const scoreLine = document.createElement("p");
    scoreLine.className = "text-body-xs";
    scoreLine.style.color = "var(--color-text-secondary)";
    scoreLine.textContent =
      report.score === null
        ? "None of the criteria could be assessed for this scan, so no checklist score is shown."
        : `${report.passed} of ${report.assessed} assessed criteria passed (${report.score}/100). ${report.notAssessed} could not be checked on this scan and are excluded from that figure.`;
    criteriaSection.appendChild(scoreLine);

    for (const pillarReport of report.byPillar) {
      const group = document.createElement("details");
      group.className = "c-criteria__group";
      // Open any pillar containing a failure, so problems are never hidden
      // behind a collapsed row.
      if (pillarReport.failed > 0) {
        group.open = true;
      }

      const groupSummary = document.createElement("summary");
      groupSummary.className = "c-criteria__group-summary";

      const groupName = document.createElement("span");
      groupName.className = "c-criteria__group-name";
      groupName.textContent = pillarReport.label;
      groupSummary.appendChild(groupName);

      const groupTally = document.createElement("span");
      groupTally.className = "c-criteria__group-tally";
      groupTally.textContent = `${pillarReport.passed} pass · ${pillarReport.warned} warn · ${pillarReport.failed} fail · ${pillarReport.notAssessed} n/a`;
      groupSummary.appendChild(groupTally);

      group.appendChild(groupSummary);

      const list = document.createElement("ul");
      list.className = "c-criteria__list";
      for (const result of pillarReport.results) {
        const item = document.createElement("li");
        item.className = `c-criteria__item c-criteria__item--${result.status}`;

        const itemIcon = document.createElement("span");
        itemIcon.className = "c-criteria__item-icon";
        itemIcon.textContent =
          result.status === "pass"
            ? "✓"
            : result.status === "fail"
              ? "✕"
              : result.status === "warn"
                ? "!"
                : "–";
        item.appendChild(itemIcon);

        const body = document.createElement("div");
        body.className = "c-criteria__item-body";

        const itemTitle = document.createElement("div");
        itemTitle.className = "c-criteria__item-title";
        itemTitle.textContent = result.title;
        body.appendChild(itemTitle);

        const itemDetail = document.createElement("div");
        itemDetail.className = "c-criteria__item-detail";
        itemDetail.textContent = result.detail;
        body.appendChild(itemDetail);

        item.appendChild(body);
        list.appendChild(item);
      }
      group.appendChild(list);
      criteriaSection.appendChild(group);
    }

    panel.appendChild(criteriaSection);
  }

  // 4b. "What to do next" checklist — the per-signal actions the engine derived,
  // kept after the headline recommendation so the two do not compete for the
  // reader's attention.
  const nextStepsSection = document.createElement("div");
  nextStepsSection.className = "l-stack l-stack--gap-sm";

  const nextStepsTitle = document.createElement("h3");
  nextStepsTitle.className = "c-result-panel__section-title";
  nextStepsTitle.appendChild(
    createIcon({ name: "shield", size: "md", colorClass: "c-icon--primary" }),
  );
  const nextStepsText = document.createElement("span");
  nextStepsText.textContent = "What to do next";
  nextStepsTitle.appendChild(nextStepsText);
  nextStepsSection.appendChild(nextStepsTitle);

  const checklist = document.createElement("ul");
  checklist.className = "c-result-panel__checklist";

  for (const step of assessment.nextSteps) {
    const li = document.createElement("li");
    li.className = "c-result-panel__checklist-item";

    const bullet = document.createElement("span");
    bullet.className = "c-result-panel__checklist-bullet";
    bullet.appendChild(createIcon({ name: "check", size: "sm" }));
    li.appendChild(bullet);

    const textSpan = document.createElement("span");
    // Securely render text with linked domain if mentioning cybercrime.gov.in
    if (step.includes("cybercrime.gov.in")) {
      const parts = step.split("cybercrime.gov.in");
      textSpan.appendChild(document.createTextNode(parts[0] ?? ""));
      const link = document.createElement("a");
      link.href = "https://cybercrime.gov.in";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "cybercrime.gov.in";
      textSpan.appendChild(link);
      textSpan.appendChild(document.createTextNode(parts[1] ?? ""));
    } else {
      textSpan.textContent = step;
    }

    li.appendChild(textSpan);
    checklist.appendChild(li);
  }
  nextStepsSection.appendChild(checklist);

  // 4. The closing recommendation. The panel above sets out the evidence; this
  // is the one instruction the reader is meant to leave with, so it comes before
  // the detailed checklist rather than after it.
  const verdict = buildFinalVerdict(assessment);
  const verdictVariantIcon: Record<VerdictVariant, IconName> = {
    safe: "shield-check",
    verify: "alert-triangle",
    avoid: "shield-alert",
  };

  const verdictSection = document.createElement("div");
  verdictSection.className = `c-final-verdict c-final-verdict--${verdict.variant}`;

  const verdictHead = document.createElement("div");
  verdictHead.className = "c-final-verdict__head";

  const verdictIcon = document.createElement("span");
  verdictIcon.className = "c-final-verdict__icon";
  verdictIcon.appendChild(
    createIcon({
      name: verdictVariantIcon[verdict.variant],
      size: "md",
    }),
  );
  verdictHead.appendChild(verdictIcon);

  const verdictHeading = document.createElement("div");
  const verdictLabel = document.createElement("span");
  verdictLabel.className = "c-final-verdict__label";
  verdictLabel.textContent = "Our recommendation";
  verdictHeading.appendChild(verdictLabel);

  const verdictTitle = document.createElement("h3");
  verdictTitle.className = "c-final-verdict__title";
  verdictTitle.textContent = verdict.headline;
  verdictHeading.appendChild(verdictTitle);
  verdictHead.appendChild(verdictHeading);
  verdictSection.appendChild(verdictHead);

  const verdictBody = document.createElement("p");
  verdictBody.className = "c-final-verdict__body";
  verdictBody.textContent = verdict.body;
  verdictSection.appendChild(verdictBody);

  const verdictSteps = document.createElement("ul");
  verdictSteps.className = "c-final-verdict__steps";
  for (const step of verdict.steps) {
    const li = document.createElement("li");
    li.className = "c-final-verdict__step";
    li.textContent = step;
    verdictSteps.appendChild(li);
  }
  verdictSection.appendChild(verdictSteps);

  // Appended together, recommendation first: both sections are built by this
  // point, so the reading order no longer has to match the construction order.
  panel.appendChild(verdictSection);
  panel.appendChild(nextStepsSection);

  // 5. Actions Toolbar
  const actionsRow = document.createElement("div");
  actionsRow.className = "c-result-panel__actions";

  const primaryGroup = document.createElement("div");
  primaryGroup.className = "c-result-panel__action-group";

  const resetBtn = createButton({
    text: "Check Another Link",
    variant: "primary",
    iconBefore: "refresh",
    onClick: onReset,
  });
  primaryGroup.appendChild(resetBtn);

  const secondaryGroup = document.createElement("div");
  secondaryGroup.className = "c-result-panel__action-group";

  const downloadBtn = createButton({
    text: "Download PDF Report",
    variant: "outline",
    iconBefore: "download",
    onClick: async () => {
      try {
        trackPdfDownload();
      } catch {
        // non-blocking
      }
      if (onDownloadCard) {
        onDownloadCard();
        return;
      }
      // Loaded on demand: jsPDF + html2canvas dominate the bundle and most
      // visitors never download a report.
      const { exportDirectPdfBlob, downloadPdfReport } = await import(
        "../../utils/pdfReport"
      );
      exportDirectPdfBlob(assessment, jobUrl, jobDescription)
        .catch((err) => {
          // Fallback to print dialog if jsPDF fails
          console.error("exportDirectPdfBlob error:", err);
          downloadPdfReport(assessment, jobUrl, jobDescription);
        });
    },
  });

  secondaryGroup.appendChild(downloadBtn);

  actionsRow.appendChild(primaryGroup);
  actionsRow.appendChild(secondaryGroup);
  panel.appendChild(actionsRow);

  return panel;
}

function getScoreDescription(level: RiskLevel, score: number): string {
  if (level === "High") {
    return `High Risk (${score}/100): Critical red flags detected. Do not pay money or share credentials.`;
  }
  if (level === "Medium") {
    return `Medium Risk (${score}/100): Suspicious signals found. Exercise caution and verify independently.`;
  }
  return `Low Risk (${score}/100): Signals appear consistent with genuine listings. Verify on official portal.`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
