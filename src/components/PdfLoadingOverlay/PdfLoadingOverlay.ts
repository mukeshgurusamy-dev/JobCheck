/**
 * PDF Loading Overlay with Responsive Spinner
 * Shows semi-transparent overlay with centered spinner and "Downloading..." text
 * during PDF generation and download
 */

export interface PdfLoadingOverlayElement extends HTMLDivElement {
  remove: () => void;
}

export function createPdfLoadingOverlay(): PdfLoadingOverlayElement {
  const overlay = document.createElement("div") as PdfLoadingOverlayElement;
  overlay.className = "pdf-overlay";

  const spinnerBox = document.createElement("div");
  spinnerBox.className = "pdf-overlay__spinner-box";

  const spinner = document.createElement("div");
  spinner.className = "pdf-overlay__spinner";

  const text = document.createElement("div");
  text.className = "pdf-overlay__text";
  text.textContent = "Downloading...";

  spinnerBox.appendChild(spinner);
  spinnerBox.appendChild(text);
  overlay.appendChild(spinnerBox);

  document.body.appendChild(overlay);

  // Override remove to also clear from DOM
  const originalRemove = overlay.remove.bind(overlay);
  overlay.remove = () => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    originalRemove();
  };

  return overlay;
}
