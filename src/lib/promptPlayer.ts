// Singleton HTMLAudioElement used for all prospect-audio playback in a session.
// Unlocked once inside a user gesture on the landing page so subsequent
// programmatic .play() calls succeed without another tap.

let el: HTMLAudioElement | null = null;
let unlocked = false;

// 1-frame silent wav data URL
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export function getPromptPlayer(): HTMLAudioElement {
  if (!el) {
    if (typeof Audio === "undefined") {
      throw new Error("Audio not available");
    }
    el = new Audio();
    el.preload = "auto";
    el.crossOrigin = "anonymous";
  }
  return el;
}

/** Call inside a user gesture (e.g. click handler) to satisfy autoplay policy. */
export async function unlockPromptPlayer(): Promise<void> {
  if (unlocked) return;
  const player = getPromptPlayer();
  try {
    player.src = SILENT_WAV;
    player.muted = true;
    await player.play().catch(() => {});
    player.pause();
    player.currentTime = 0;
    player.muted = false;
    player.removeAttribute("src");
    player.load();
    unlocked = true;
  } catch {
    // Best-effort; even if unlock fails, subsequent play() may still succeed.
  }
}

export function isPromptPlayerUnlocked(): boolean {
  return unlocked;
}
