import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/session-context";
import * as mic from "@/lib/mic";

export type SegmentType = "warmup" | "question" | "scripted" | "improv";

export interface Segment {
  id: string;
  type: SegmentType;
  promptAudioPath: string | null;
  scriptText: string | null;
  countdownSeconds: number | null;
  cueColor: string;
  cueLabel: string;
}

async function fetchSegments(): Promise<Segment[]> {
  const { data, error } = await supabase
    .from("segments")
    .select(
      "id, type, prompt_audio_path, script_text, countdown_seconds, cue_color, cue_label",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    type: r.type as SegmentType,
    promptAudioPath: (r.prompt_audio_path as string | null) ?? null,
    scriptText: (r.script_text as string | null) ?? null,
    countdownSeconds: (r.countdown_seconds as number | null) ?? null,
    cueColor: r.cue_color as string,
    cueLabel: r.cue_label as string,
  }));
}

const segmentsQueryOptions = queryOptions({
  queryKey: ["segments", "active"],
  queryFn: fetchSegments,
});

export const Route = createFileRoute("/screening")({
  head: () => ({
    meta: [
      { title: "Screening — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(segmentsQueryOptions),
  component: Screening,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
        Couldn't load screening — {error.message}
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal/60">
        No active segments.
      </p>
    </main>
  ),
});

type Phase = "prompt" | "cue" | "respond" | "upload";

function Screening() {
  const { sessionId, sessionToken } = useSession();
  const { data: segments } = useSuspenseQuery(segmentsQueryOptions);
  const mediaStream = mic.getExisting();

  if (!sessionId || !sessionToken || !mediaStream) {
    return <Navigate to="/" />;
  }

  if (segments.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal/60">
          No active segments.
        </p>
      </main>
    );
  }

  return (
    <Player
      sessionId={sessionId}
      sessionToken={sessionToken}
      mediaStream={mediaStream}
      segments={segments}
    />
  );
}

function Player({
  sessionId,
  sessionToken,
  mediaStream,
  segments,
}: {
  sessionId: string;
  sessionToken: string;
  mediaStream: MediaStream;
  segments: Segment[];
}) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("prompt");

  const segment = segments[index];
  const isLast = index === segments.length - 1;

  const advanceSegment = useCallback(() => {
    if (isLast) {
      navigate({ to: "/finish" });
    } else {
      setIndex((i) => i + 1);
      setPhase("prompt");
    }
  }, [isLast, navigate]);

  return (
    <main className="min-h-screen relative">
      {/* Progress indicator */}
      <div className="pointer-events-none absolute right-6 top-6 z-40 font-mono text-xs uppercase tracking-[0.28em] text-charcoal/80">
        {String(index + 1).padStart(2, "0")} / {String(segments.length).padStart(2, "0")}
      </div>

      {phase === "prompt" && (
        <PromptPhase
          key={`prompt-${segment.id}`}
          segment={segment}
          onDone={() => setPhase("cue")}
        />
      )}
      {phase === "cue" && (
        <CuePhase
          key={`cue-${segment.id}`}
          segment={segment}
          onDone={() => setPhase("respond")}
        />
      )}
      {phase === "respond" && (
        <RespondPhase
          key={`respond-${segment.id}`}
          segment={segment}
          mediaStream={mediaStream}
          onDone={(blob) => {
            void blob;
            setPhase("upload");
          }}
          onBlob={(blob) => {
            latestBlobRef.current = blob;
          }}
        />
      )}
      {phase === "upload" && (
        <UploadPhase
          key={`upload-${segment.id}-${index}`}
          sessionId={sessionId}
          segment={segment}
          sortOrder={index}
          sessionToken={sessionToken}
          getBlob={() => latestBlobRef.current}
          onDone={advanceSegment}
        />
      )}
    </main>
  );
}

// Blob handoff between Respond → Upload phases without re-render churn.
const latestBlobRef: { current: Blob | null } = { current: null };

/* --------------------------------- Prompt --------------------------------- */

function PromptPhase({ segment, onDone }: { segment: Segment; onDone: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const path = segment.promptAudioPath?.trim();
    if (!path) {
      setResolvedUrl(null);
      setResolved(true);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from("prompts")
        .createSignedUrl(path, 60 * 10);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setResolvedUrl(null);
      } else {
        setResolvedUrl(data.signedUrl);
      }
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [segment.promptAudioPath]);

  useEffect(() => {
    if (!resolvedUrl) return;
    const el = audioRef.current;
    if (!el) return;
    el.play().catch(() => {
      // Autoplay may be blocked; user can wait for onEnded or use fallback.
    });
  }, [resolvedUrl]);

  if (!resolved) {
    return <section className="min-h-screen bg-parchment" />;
  }

  return (
    <section className="min-h-screen flex items-center justify-center bg-parchment px-6">
      {resolvedUrl ? (
        <audio ref={audioRef} src={resolvedUrl} onEnded={onDone} className="hidden" />
      ) : (
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal/55">
            ‹audio pending›
          </p>
          <button
            onClick={onDone}
            className="mt-8 inline-flex items-center gap-3 border border-charcoal bg-transparent px-6 py-3 font-mono text-xs uppercase tracking-[0.24em] text-charcoal transition-colors hover:bg-charcoal hover:text-parchment"
          >
            <span>Continue</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------- Cue ---------------------------------- */

function CuePhase({ segment, onDone }: { segment: Segment; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, [onDone]);

  const isImprov = segment.type === "improv";
  const label = isImprov ? "You're off script now — Improvise" : segment.cueLabel;
  const textColor = "#F5F0E8";

  return (
    <section
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: segment.cueColor, color: textColor }}
    >
      <h1
        className="text-center font-display leading-[0.9]"
        style={{
          fontSize: "clamp(3rem, 10vw, 8rem)",
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </h1>
    </section>
  );
}

/* --------------------------------- Respond -------------------------------- */

function RespondPhase({
  segment,
  mediaStream,
  onDone,
  onBlob,
}: {
  segment: Segment;
  mediaStream: MediaStream;
  onDone: (blob: Blob) => void;
  onBlob: (blob: Blob) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stoppedRef = useRef(false);
  const [remaining, setRemaining] = useState(segment.countdownSeconds ?? 0);
  const [recording, setRecording] = useState(false);
  const totalMs = (segment.countdownSeconds ?? 0) * 1000;

  const stopAndFinish = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    setRecording(false);
  }, []);

  useEffect(() => {
    chunksRef.current = [];
    stoppedRef.current = false;

    let mimeType = "audio/webm;codecs=opus";
    if (typeof MediaRecorder !== "undefined" && !MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    }

    const rec = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstart = () => setRecording(true);
    rec.onstop = () => {
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      onBlob(blob);
      onDone(blob);
    };

    rec.start();

    return () => {
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (segment.countdownSeconds == null) return;
    const start = performance.now();
    const total = segment.countdownSeconds;
    const id = window.setInterval(() => {
      const elapsedSec = (performance.now() - start) / 1000;
      const left = Math.max(0, total - elapsedSec);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        stopAndFinish();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [segment.countdownSeconds, stopAndFinish]);

  useEffect(() => {
    if (segment.countdownSeconds != null) return;
    const t = window.setTimeout(stopAndFinish, 120_000);
    return () => window.clearTimeout(t);
  }, [segment.countdownSeconds, stopAndFinish]);

  const hasCountdown = segment.countdownSeconds != null;
  const pct = hasCountdown && totalMs > 0 ? (remaining / (segment.countdownSeconds ?? 1)) * 100 : 0;
  const secondsDisplay = hasCountdown ? Math.ceil(remaining) : null;

  return (
    <section className="min-h-screen flex flex-col bg-parchment relative">
      {/* Small REC chip while recording */}
      {recording && (
        <div className="pointer-events-none absolute left-6 top-6 z-40 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-iron">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-iron opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-iron" />
          </span>
          REC
        </div>
      )}

      <div className="flex items-center gap-3 px-6 pt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-iron opacity-0">
        Recording
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        {segment.scriptText ? (
          <p
            className="max-w-3xl text-center font-serif leading-[1.15] text-charcoal"
            style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)" }}
          >
            <em>{segment.scriptText}</em>
          </p>
        ) : (
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal/55">
              Speak freely
            </p>
          </div>
        )}
      </div>

      <div className="px-6 pb-10">
        {hasCountdown ? (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70">
              <span>Time remaining</span>
              <span className="text-charcoal tabular-nums">
                {String(secondsDisplay ?? 0).padStart(2, "0")}s
              </span>
            </div>
            <div className="mt-2 h-2 w-full bg-charcoal/10">
              <div
                className="h-full bg-iron transition-[width] duration-100 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={stopAndFinish}
              className="inline-flex items-center gap-3 bg-iron px-8 py-4 font-mono text-sm uppercase tracking-[0.28em] text-parchment transition-transform hover:-translate-y-0.5"
            >
              <span>Done</span>
              <span aria-hidden>■</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- Upload --------------------------------- */

function UploadPhase({
  sessionId,
  segment,
  sortOrder,
  sessionToken,
  getBlob,
  onDone,
}: {
  sessionId: string;
  segment: Segment;
  sortOrder: number;
  sessionToken: string;
  getBlob: () => Blob | null;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<"saving" | "failed">("saving");
  const attemptedRef = useRef(false);

  const run = useCallback(async () => {
    const blob = getBlob();
    if (!blob) {
      setStatus("failed");
      return;
    }
    setStatus("saving");

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const form = new FormData();
        form.append("sessionId", sessionId);
        form.append("sessionToken", sessionToken);
        form.append("segmentId", segment.id);
        form.append("sortOrder", String(sortOrder));
        form.append("audio", blob, `${segment.id}.webm`);

        const res = await fetch("/api/save-recording", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`save-recording failed: ${res.status} ${body}`);
        }

        onDone();
        return;
      } catch (err) {
        lastErr = err;
        console.error(`Upload attempt ${attempt} failed`, err);
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    console.error("Upload failed after retries", lastErr);
    setStatus("failed");
  }, [getBlob, onDone, segment.id, sessionId, sessionToken, sortOrder]);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    void run();
  }, [run]);

  return (
    <section className="min-h-screen flex items-center justify-center bg-parchment px-6">
      {status === "saving" ? (
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-charcoal/70">
            Saving…
          </p>
          <div className="mt-6 mx-auto h-px w-24 bg-charcoal/30 overflow-hidden">
            <div className="h-full w-1/2 bg-iron animate-[slide_1.2s_ease-in-out_infinite]" />
          </div>
          <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }`}</style>
        </div>
      ) : (
        <div className="max-w-md text-center border border-charcoal p-8">
          <p className="font-display text-4xl text-charcoal">Couldn't save</p>
          <p className="mt-3 font-serif text-lg text-charcoal/85">
            <em>Your recording is still here. Try again.</em>
          </p>
          <button
            onClick={() => {
              attemptedRef.current = true;
              void run();
            }}
            className="mt-6 inline-flex items-center gap-3 bg-iron px-6 py-3 font-mono text-xs uppercase tracking-[0.24em] text-parchment"
          >
            <span>Retry</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </section>
  );
}
