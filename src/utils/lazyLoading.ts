// PERFORMANCE OPTIMIZATION: Lazy-load heavy dependencies
// This file replaces eager imports with dynamic imports

/**
 * Load PDF libraries only when user clicks "Download PDF Report"
 * Saves ~625 KB on initial page load
 */
export async function lazyLoadPdfLibraries() {
  const { jsPDF } = await import("jspdf");
  const html2canvas = await import("html2canvas");
  return { jsPDF, html2canvas };
}

/**
 * Preload critical vendor libraries in background after page is interactive
 * Ensures smooth performance when user needs them
 */
export function preloadNonCriticalBundles(): void {
  // Only preload if device is not on slow network (4G+)
  if (typeof navigator !== "undefined") {
    const connection = (navigator as any).connection;
    if (connection && connection.effectiveType === "4g") {
      // Preload PDF libraries 2 seconds after page is interactive
      setTimeout(() => {
        void import("jspdf").catch(() => {});
        void import("html2canvas").catch(() => {});
      }, 2000);
    }
  }
}
