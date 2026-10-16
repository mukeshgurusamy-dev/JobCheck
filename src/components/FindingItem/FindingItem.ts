import "./FindingItem.css";
import { Finding } from "../../types/types";
import { createIcon, IconName } from "../Icon/Icon";

export interface FindingItemOptions {
  finding: Finding;
}

export function createFindingItem(options: FindingItemOptions): HTMLElement {
  const { finding } = options;

  const item = document.createElement("li");
  const variantClass =
    finding.kind === "trust"
      ? "c-finding-item--trust"
      : `c-finding-item--risk-${finding.severity}`;

  item.className = `c-finding-item ${variantClass}`;

  // Header row
  const header = document.createElement("div");
  header.className = "c-finding-item__header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "c-finding-item__title-group";

  // Icon
  let iconName: IconName = "info";
  let colorClass = "c-icon--primary";

  if (finding.kind === "trust") {
    iconName = "check";
    colorClass = "c-icon--trust";
  } else if (finding.severity === "high") {
    iconName = "shield-alert";
    colorClass = "c-icon--risk-high";
  } else if (finding.severity === "medium") {
    iconName = "alert-triangle";
    colorClass = "c-icon--risk-medium";
  }

  const iconWrapper = document.createElement("span");
  iconWrapper.className = "c-finding-item__icon";
  iconWrapper.appendChild(createIcon({ name: iconName, size: "sm", colorClass }));
  titleGroup.appendChild(iconWrapper);

  // Reason (strictly textContent, never innerHTML)
  const reasonEl = document.createElement("span");
  reasonEl.className = "c-finding-item__reason";
  reasonEl.textContent = finding.reason;
  titleGroup.appendChild(reasonEl);

  header.appendChild(titleGroup);

  // Points badge
  const badge = document.createElement("span");
  const badgeVariant =
    finding.kind === "trust"
      ? "c-finding-item__badge--trust"
      : `c-finding-item__badge--risk-${finding.severity}`;

  badge.className = `c-finding-item__badge ${badgeVariant}`;
  badge.textContent = finding.points > 0 ? `+${finding.points}` : `${finding.points}`;
  header.appendChild(badge);

  item.appendChild(header);

  // Evidence snippet if present
  if (finding.evidence) {
    const evidenceEl = document.createElement("div");
    evidenceEl.className = "c-finding-item__evidence";

    const label = document.createElement("span");
    label.className = "c-finding-item__evidence-label";
    label.textContent = "Signal evidence:";

    const snippet = document.createElement("span");
    snippet.textContent = `"${finding.evidence}"`;

    evidenceEl.appendChild(label);
    evidenceEl.appendChild(snippet);
    item.appendChild(evidenceEl);
  }

  return item;
}
