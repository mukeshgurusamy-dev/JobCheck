/**
 * Hero Video Component - Mastercard-style video hero with mute/unmute controls
 * Logic: Max 3 plays per session, resets every 2 hours
 * Audio Preference: First visit shows prompt, subsequent visits remember choice
 * Audio Prompt: Always shown on first visit to get user's audio preference
 */

const HERO_VIDEO_STORAGE_KEY = "jobcheck:video-tracker";
const HERO_VIDEO_PREFERENCE_KEY = "jobcheck:video-audio-preference";
const MAX_PLAYS_PER_SESSION = 3;
const RESET_INTERVAL_HOURS = 2;

interface VideoTracker {
  count: number;
  lastPlayTime: number;
}

interface HeroVideoOptions {
  videoSrc: string;
  onVideoComplete: () => void;
  onReadyToPlay?: () => void;
}

export function createHeroVideo(options: HeroVideoOptions): HTMLElement {
  const { videoSrc, onVideoComplete, onReadyToPlay } = options;

  // Check if video should be skipped based on play count and time
  const shouldSkipVideo = checkVideoPlayLimit();

  if (shouldSkipVideo) {
    // Video won't play - just call complete
    onVideoComplete();
    return document.createElement("div"); // Empty, will be removed
  }

  const container = document.createElement("div");
  container.className = "c-hero-video";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Brand introduction video");
  container.setAttribute("data-hero-video", "true");

  // Video wrapper - maintains aspect ratio
  const videoWrapper = document.createElement("div");
  videoWrapper.className = "c-hero-video__wrapper";

  // Video element
  const video = document.createElement("video");
  video.className = "c-hero-video__player";
  video.src = videoSrc;
  video.playsInline = true;
  video.setAttribute("aria-label", "JobCheck brand introduction");

  // Check if user has already set audio preference
  const hasAudioPreference = hasUserAudioPreference();

  // Get user's audio preference (default to muted if no preference yet)
  const userPrefersMuted = getUserAudioPreference();

  // Don't autoplay yet - will start after user choice or after scroll
  video.autoplay = false;
  video.muted = userPrefersMuted;

  // Video controls container
  const controlsContainer = document.createElement("div");
  controlsContainer.className = "c-hero-video__controls";

  // Mute/Unmute button
  const muteButton = document.createElement("button");
  muteButton.className = "c-hero-video__mute-btn";
  muteButton.type = "button";
  muteButton.setAttribute("aria-label", "Toggle mute");

  const updateMuteButton = () => {
    if (video.muted) {
      muteButton.textContent = "🔇";
      muteButton.setAttribute("aria-pressed", "true");
      muteButton.classList.remove("c-hero-video__mute-btn--active");
    } else {
      muteButton.textContent = "🔊";
      muteButton.setAttribute("aria-pressed", "false");
      muteButton.classList.add("c-hero-video__mute-btn--active");
    }
  };

  muteButton.addEventListener("click", () => {
    video.muted = !video.muted;
    // Save user preference
    saveUserAudioPreference(video.muted);
    updateMuteButton();
  });

  video.addEventListener("volumechange", updateMuteButton);
  updateMuteButton(); // Initial state

  // Skip video button
  const skipButton = document.createElement("button");
  skipButton.className = "c-hero-video__skip-btn";
  skipButton.type = "button";
  skipButton.textContent = "Skip";
  skipButton.setAttribute("aria-label", "Skip video");

  controlsContainer.appendChild(muteButton);
  controlsContainer.appendChild(skipButton);

  // Progress bar
  const progressBar = document.createElement("div");
  progressBar.className = "c-hero-video__progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "c-hero-video__progress-fill";
  progressBar.appendChild(progressFill);

  videoWrapper.appendChild(video);
  videoWrapper.appendChild(controlsContainer);
  videoWrapper.appendChild(progressBar);

  container.appendChild(videoWrapper);

  // Completion logic
  const completeVideo = () => {
    // Increment play count
    recordVideoPlay();

    // Fade out animation
    container.classList.add("c-hero-video--fade-out");

    setTimeout(() => {
      container.remove();
      onVideoComplete();
    }, 800); // Match CSS transition duration
  };

  // Video ended naturally
  video.addEventListener("ended", completeVideo);

  // Skip button handler
  skipButton.addEventListener("click", completeVideo);

  // ESC key to skip
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      completeVideo();
      document.removeEventListener("keydown", handleKeydown);
    }
  };
  document.addEventListener("keydown", handleKeydown);

  // Update progress bar
  video.addEventListener("timeupdate", () => {
    if (video.duration) {
      const progress = (video.currentTime / video.duration) * 100;
      progressFill.style.width = `${progress}%`;
    }
  });

  // If no audio preference yet (first time), show prompt
  if (!hasAudioPreference) {
    // Show prompt after a short delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        showAudioPrompt(video, onReadyToPlay);
      }, 100);
    });
  } else {
    // Already has preference, just notify ready to play
    if (onReadyToPlay) {
      onReadyToPlay();
    }
  }

  return container;
}

/**
 * Show audio enable/disable prompt
 */
function showAudioPrompt(video: HTMLVideoElement, onReadyToPlay?: () => void): void {
  const overlay = document.createElement("div");
  overlay.className = "c-hero-video-prompt__overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Audio preference");

  const promptBox = document.createElement("div");
  promptBox.className = "c-hero-video-prompt__box";

  const title = document.createElement("h2");
  title.className = "c-hero-video-prompt__title";
  title.textContent = "Enable Audio?";

  const description = document.createElement("p");
  description.className = "c-hero-video-prompt__description";
  description.textContent = "Would you like to play this video with sound?";

  const buttonsContainer = document.createElement("div");
  buttonsContainer.className = "c-hero-video-prompt__buttons";

  const enableBtn = document.createElement("button");
  enableBtn.className = "c-hero-video-prompt__btn c-hero-video-prompt__btn--enable";
  enableBtn.textContent = "Yes, Enable Audio";
  enableBtn.type = "button";

  const disableBtn = document.createElement("button");
  disableBtn.className = "c-hero-video-prompt__btn c-hero-video-prompt__btn--disable";
  disableBtn.textContent = "No, Keep Muted";
  disableBtn.type = "button";

  const handleChoice = (userWantsMuted: boolean) => {
    video.muted = userWantsMuted;
    saveUserAudioPreference(userWantsMuted);
    overlay.remove();
    // Now that user has chosen, trigger video playback
    if (onReadyToPlay) {
      onReadyToPlay();
    }
  };

  enableBtn.addEventListener("click", () => handleChoice(false));
  disableBtn.addEventListener("click", () => handleChoice(true));

  buttonsContainer.appendChild(enableBtn);
  buttonsContainer.appendChild(disableBtn);

  promptBox.appendChild(title);
  promptBox.appendChild(description);
  promptBox.appendChild(buttonsContainer);
  overlay.appendChild(promptBox);

  document.body.appendChild(overlay);
}

/**
 * Check if user has already set audio preference
 */
function hasUserAudioPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(HERO_VIDEO_PREFERENCE_KEY);
    return stored !== null;
  } catch {
    return false;
  }
}

/**
 * Get user's audio preference from localStorage
 * First time: returns false (unmuted) as default
 * After user chooses: returns their stored preference
 */
function getUserAudioPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(HERO_VIDEO_PREFERENCE_KEY);

    if (stored === null) {
      // First time - no preference stored yet, default to muted
      return true; // Start with muted as safe default
    }

    // Return user's preference (true = muted, false = unmuted)
    return stored === "true";
  } catch {
    // LocalStorage error, default to muted
    return true;
  }
}

/**
 * Save user's audio preference to localStorage
 */
function saveUserAudioPreference(isMuted: boolean): void {
  try {
    window.localStorage.setItem(HERO_VIDEO_PREFERENCE_KEY, String(isMuted));
  } catch {
    // LocalStorage not available (private browsing, etc.)
  }
}

/**
 * Check if video should be skipped based on play count and 2-hour reset logic
 */
function checkVideoPlayLimit(): boolean {
  try {
    const stored = window.localStorage.getItem(HERO_VIDEO_STORAGE_KEY);

    if (!stored) {
      // First visit, show video
      return false;
    }

    const tracker: VideoTracker = JSON.parse(stored);
    const now = Date.now();
    const twoHoursInMs = RESET_INTERVAL_HOURS * 60 * 60 * 1000;

    // Check if 2 hours have passed since last play
    if (now - tracker.lastPlayTime > twoHoursInMs) {
      // Reset counter, allow video to play again
      return false;
    }

    // Check if max plays reached in this cycle
    if (tracker.count >= MAX_PLAYS_PER_SESSION) {
      // Skip video, max plays reached
      return true;
    }

    // Allow video to play (count < max)
    return false;
  } catch {
    // Error parsing or accessing storage, show video
    return false;
  }
}

/**
 * Record video play and update counter
 */
function recordVideoPlay(): void {
  try {
    const stored = window.localStorage.getItem(HERO_VIDEO_STORAGE_KEY);
    let tracker: VideoTracker;

    if (!stored) {
      // First play
      tracker = {
        count: 1,
        lastPlayTime: Date.now(),
      };
    } else {
      tracker = JSON.parse(stored);
      const now = Date.now();
      const twoHoursInMs = RESET_INTERVAL_HOURS * 60 * 60 * 1000;

      // Check if 2 hours have passed, reset counter
      if (now - tracker.lastPlayTime > twoHoursInMs) {
        tracker.count = 1;
      } else {
        // Increment counter (max 3)
        tracker.count = Math.min(tracker.count + 1, MAX_PLAYS_PER_SESSION);
      }

      tracker.lastPlayTime = now;
    }

    window.localStorage.setItem(HERO_VIDEO_STORAGE_KEY, JSON.stringify(tracker));
  } catch {
    // LocalStorage not available (private browsing, etc.)
  }
}
