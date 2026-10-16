/**
 * Sonic Logo Intro Component
 *
 * Displays a full-screen video intro with the sonic logo before revealing the main site.
 * Includes skip button, accessibility features, and remembers user preference.
 */

const SKIP_STORAGE_KEY = "jobcheck:skip-intro";
const INTRO_DURATION = 6000; // 6 seconds max

interface SonicIntroOptions {
  videoSrc: string;
  onComplete: () => void;
}

export function createSonicIntro(options: SonicIntroOptions): HTMLElement {
  const { videoSrc, onComplete } = options;

  // Check if user has already seen or skipped the intro
  const hasSeenIntro = sessionStorage.getItem(SKIP_STORAGE_KEY) === "true";
  if (hasSeenIntro) {
    onComplete();
    return document.createElement("div"); // Return empty element
  }

  const container = document.createElement("div");
  container.className = "c-sonic-intro";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", "Brand introduction");
  container.setAttribute("aria-live", "polite");

  // Video container - for smart centering with responsive padding
  const videoContainer = document.createElement("div");
  videoContainer.className = "c-sonic-intro__video-container";

  // Video element
  const video = document.createElement("video");
  video.className = "c-sonic-intro__video";
  video.src = videoSrc;
  video.autoplay = true;
  video.muted = false; // Enable sound for sonic logo
  video.playsInline = true;
  video.setAttribute("aria-label", "JobCheck sonic logo animation");

  // Fallback for browsers that block autoplay with sound
  video.addEventListener("canplay", () => {
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay with sound blocked, mute and retry
        video.muted = true;
        video.play().catch(() => {
          // If still fails, just complete the intro
          completeIntro();
        });
      });
    }
  });

  // Skip button
  const skipButton = document.createElement("button");
  skipButton.className = "c-sonic-intro__skip";
  skipButton.type = "button";
  skipButton.textContent = "Skip Intro";
  skipButton.setAttribute("aria-label", "Skip brand introduction");

  // Progress indicator
  const progressBar = document.createElement("div");
  progressBar.className = "c-sonic-intro__progress";
  const progressFill = document.createElement("div");
  progressFill.className = "c-sonic-intro__progress-fill";
  progressBar.appendChild(progressFill);

  // Assemble: video container holds the video, main container holds everything
  videoContainer.appendChild(video);
  container.appendChild(videoContainer);
  container.appendChild(skipButton);
  container.appendChild(progressBar);

  // Animation and completion logic
  let progressInterval: number | NodeJS.Timeout;
  let timeoutId: number | NodeJS.Timeout;

  const completeIntro = () => {
    clearInterval(progressInterval as number);
    clearTimeout(timeoutId as number);

    // Remember that user has seen/skipped the intro
    sessionStorage.setItem(SKIP_STORAGE_KEY, "true");

    // Fade out animation
    container.classList.add("c-sonic-intro--fade-out");

    setTimeout(() => {
      container.remove();
      onComplete();
    }, 600); // Match CSS transition duration
  };

  // Video ended naturally
  video.addEventListener("ended", completeIntro);

  // Skip button handler
  skipButton.addEventListener("click", completeIntro);

  // ESC key to skip
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      completeIntro();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);

  // Progress bar animation
  const startTime = Date.now();
  progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min((elapsed / INTRO_DURATION) * 100, 100);
    progressFill.style.width = `${progress}%`;
  }, 50);

  // Failsafe timeout (in case video doesn't load or end event doesn't fire)
  timeoutId = setTimeout(completeIntro, INTRO_DURATION);

  return container;
}
