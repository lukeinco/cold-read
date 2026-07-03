let currentStream: MediaStream | null = null;
let inFlight: Promise<MediaStream> | null = null;

export function getExisting(): MediaStream | null {
  const live = currentStream?.getAudioTracks().some(t => t.readyState === "live");
  return live ? currentStream : null;
}

export function release(): void {
  currentStream?.getTracks().forEach(t => t.stop());
  currentStream = null;
}

async function request(): Promise<MediaStream> {
  release();
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if ((err as DOMException).name === "NotReadableError") {
      release();
      await new Promise(r => setTimeout(r, 400));
      currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } else {
      throw err;
    }
  }
  return currentStream!;
}

export function acquire(): Promise<MediaStream> {
  const existing = getExisting();
  if (existing) return Promise.resolve(existing);
  if (inFlight) return inFlight;
  inFlight = request().finally(() => { inFlight = null; });
  return inFlight;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => release());
}
