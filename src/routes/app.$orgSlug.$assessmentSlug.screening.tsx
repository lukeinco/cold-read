import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/session-context";
import * as mic from "@/lib/mic";
import { getPromptPlayer } from "@/lib/promptPlayer";
import { orgBySlugQueryOptions } from "@/lib/org-queries";

export type SegmentType =
  | "audio"
  | "text"
  | "text_entry"
  | "warmup"
  | "question"
  | "scripted"
  | "improv";

export interface Segment {
  id: string;
  type: SegmentType;
  promptAudioPath: string | null;
  scriptText: string | null;
  countdownSeconds: number | null;
  cueColor: string;
  cueLabel: string;
}

function segmentsForOrgQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: ["segments", "active", "org", orgId],
    queryFn: async (): Promise<Segment[]> => {
      const { data, error } = await supabase
        .from("segments")
        .select(
          "id, type, prompt_audio_path, script_text, countdown_seconds, cue_color, cue_label",
        )
        .eq("org_id", orgId)
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
    },
  });
}

export const Route = createFileRoute("/app/$slug/screening")({
  head: () => ({
    meta: [
      { title: "Screening — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const org = await context.queryClient.ensureQueryData(
      orgBySlugQueryOptions(params.slug),
    );
    await context.queryClient.ensureQueryData(segmentsForOrgQueryOptions(org.id));
  },
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

type Phase = "cue" | "respond" | "upload";

function Screening() {
  const { slug } = Route.useParams();
  const { data: org } = useSuspenseQuery(orgBySlugQueryOptions(slug));
  const { sessionId, sessionToken } = useSession();
  const { data: segments } = useSuspenseQuery(segmentsForOrgQueryOptions(org.id));
  const mediaStream = mic.getExisting();

  if (!sessionId || !sessionToken || !mediaStream) {
    return <Navigate to="/app/$slug" params={{ slug }} />;
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
  const [phase, setPhase] = useState<Phase>("cue");

  const segment = segments[index];
  const isLast = index === segments.length - 1;

  // Non-response steps: audio, text. Response steps: warmup/question/scripted/improv/text_entry.
  const isResponseStep = (t: SegmentType) =>
    t !== "audio" && t !== "text";

  // Progress counts response steps only.
  const responseSteps = useMemo(
    () => segments.filter((s) => isResponseStep(s.type)),
    [segments],
  );
  const responseIndex = useMemo(() => {
    if (!isResponseStep(segment.type)) return -1;
    return responseSteps.findIndex((s) => s.id === segment.id);
  }, [segment, responseSteps]);

  const advanceSegment = useCallback(() => {
    if (isLast) {
      navigate({ to: "/finish" });
    } else {
      setIndex((i) => i + 1);
      setPhase("cue");
    }
  }, [isLast, navigate]);

  // Audio step: render call screen only.
  if (segment.type === "audio") {
    return (
      <main className="min-h-screen relative">
        <AudioCallPhase key={`audio-${segment.id}`} segment={segment} onDone={advanceSegment} />
      </main>
    );
  }

  // Text slide: display only, no response saved.
  if (segment.type === "text") {
    return (
      <main className="min-h-screen relative">
        <TextSlidePhase key={`text-${segment.id}`} segment={segment} onDone={advanceSegment} />
      </main>
    );
  }

  // Text entry: candidate types response.
  if (segment.type === "text_entry") {
    return (
      <main className="min-h-screen relative">
        {responseIndex >= 0 && (
          <div className="pointer-events-none absolute right-6 top-6 z-40 font-mono text-xs uppercase tracking-[0.28em] text-charcoal/80">
            {String(responseIndex + 1).padStart(2, "0")} /{" "}
            {String(responseSteps.length).padStart(2, "0")}
          </div>
        )}
        <TextEntryPhase
          key={`text-entry-${segment.id}`}
          sessionId={sessionId}
          sessionToken={sessionToken}
          segment={segment}
          sortOrder={index}
          onDone={advanceSegment}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen relative">
      {/* Progress indicator — counts response steps only */}
      {responseIndex >= 0 && (
        <div className="pointer-events-none absolute right-6 top-6 z-40 font-mono text-xs uppercase tracking-[0.28em] text-charcoal/80">
          {String(responseIndex + 1).padStart(2, "0")} /{" "}
          {String(responseSteps.length).padStart(2, "0")}
        </div>
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

/* ------------------------------ Audio call ------------------------------- */

function AudioCallPhase({ segment, onDone }: { segment: Segment; onDone: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    let cancelled = false;
    const player = getPromptPlayer();
    const path = segment.promptAudioPath?.trim();

    // 8s safety timeout: if playback hasn't started, advance anyway.
    let started = false;
    const safety = window.setTimeout(() => {
      if (!started && !cancelled) {
        console.warn(`[audio-step ${segment.id}] playback did not start within 8s`);
        finish();
      }
    }, 8000);

    const onPlay = () => {
      started = true;
      window.clearTimeout(safety);
    };
    const onEnded = () => finish();
    const onError = () => {
      console.warn(`[audio-step ${segment.id}] playback error`);
      finish();
    };
    player.addEventListener("play", onPlay);
    player.addEventListener("ended", onEnded);
    player.addEventListener("error", onError);

    (async () => {
      if (!path) {
        console.warn(`[audio-step ${segment.id}] no prompt_audio_path`);
        finish();
        return;
      }
      const { data, error } = await supabase.storage
        .from("prompts")
        .createSignedUrl(path, 60 * 10);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        console.warn(`[audio-step ${segment.id}] signing failed`, error?.message);
        finish();
        return;
      }
      try {
        player.src = data.signedUrl;
        player.currentTime = 0;
        await player.play();
      } catch (e) {
        console.warn(`[audio-step ${segment.id}] play() rejected`, e);
        finish();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("error", onError);
      try {
        player.pause();
      } catch {
        /* noop */
      }
    };
  }, [segment.id, segment.promptAudioPath, finish]);

  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - start) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const cap = segment.countdownSeconds;
    if (cap == null || cap <= 0) return;
    const id = window.setTimeout(() => finish(), cap * 1000);
    return () => window.clearTimeout(id);
  }, [segment.countdownSeconds, finish]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <section
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: "#2B2B28" }}
    >
      <div
        className="flex items-center gap-3 text-parchment"
        style={{ fontFamily: "var(--font-mono), 'IBM Plex Mono', monospace" }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: "#3D5E4A" }}
          aria-hidden
        />
        <span className="text-sm uppercase tracking-[0.28em] tabular-nums">
          Call in progress — {mm}:{ss}
        </span>
      </div>
    </section>
  );
}

/* ---------------------------- Text slide (display) ------------------------ */

function readableOn(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#F5F0E8";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#2B2B28" : "#F5F0E8";
}

function TextSlidePhase({ segment, onDone }: { segment: Segment; onDone: () => void }) {
  const fg = readableOn(segment.cueColor);
  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const cap = segment.countdownSeconds;
    if (cap == null || cap <= 0) return;
    const id = window.setTimeout(() => finish(), cap * 1000);
    return () => window.clearTimeout(id);
  }, [segment.countdownSeconds, finish]);

  return (
    <section
      className="min-h-screen flex flex-col items-center justify-center px-8 py-16 text-center"
      style={{ backgroundColor: segment.cueColor, color: fg }}
    >
      <h1
        className="font-display uppercase leading-[0.95]"
        style={{ fontSize: "clamp(2.5rem, 8vw, 6rem)", letterSpacing: "0.02em" }}
      >
        {segment.cueLabel}
      </h1>
      {segment.scriptText && (
        <p
          className="mt-8 max-w-2xl font-serif leading-[1.3]"
          style={{ fontSize: "clamp(1.125rem, 2.5vw, 1.75rem)" }}
        >
          <em>{segment.scriptText}</em>
        </p>
      )}
      <button
        onClick={finish}
        className="mt-14 inline-flex items-center gap-3 border-2 px-8 py-4 font-mono text-sm uppercase tracking-[0.28em] transition-transform hover:-translate-y-0.5"
        style={{ borderColor: fg, color: fg }}
      >
        <span>Continue</span>
        <span aria-hidden>→</span>
      </button>
    </section>
  );
}

/* ------------------------------ Text entry ------------------------------- */

function TextEntryPhase({
  sessionId,
  sessionToken,
  segment,
  sortOrder,
  onDone,
}: {
  sessionId: string;
  sessionToken: string;
  segment: Segment;
  sortOrder: number;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const [remaining, setRemaining] = useState(segment.countdownSeconds ?? 0);
  const submittedRef = useRef(false);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setStatus("saving");
    try {
      const blob = new Blob([text], { type: "text/plain" });
      const form = new FormData();
      form.append("sessionId", sessionId);
      form.append("sessionToken", sessionToken);
      form.append("segmentId", segment.id);
      form.append("sortOrder", String(sortOrder));
      form.append("audio", blob, `${segment.id}.txt`);
      const res = await fetch("/api/save-recording", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text().catch(() => "save failed"));
      onDone();
    } catch (err) {
      console.error("text-entry save failed", err);
      submittedRef.current = false;
      setStatus("failed");
    }
  }, [text, sessionId, sessionToken, segment.id, sortOrder, onDone]);

  useEffect(() => {
    if (segment.countdownSeconds == null) return;
    const start = performance.now();
    const total = segment.countdownSeconds;
    const id = window.setInterval(() => {
      const left = Math.max(0, total - (performance.now() - start) / 1000);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        void submit();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [segment.countdownSeconds, submit]);

  const hasCountdown = segment.countdownSeconds != null;
  const secondsDisplay = hasCountdown ? Math.ceil(remaining) : null;

  return (
    <section className="min-h-screen flex flex-col bg-parchment px-6 pt-20 pb-10">
      <div className="mx-auto w-full max-w-3xl flex-1 flex flex-col">
        <h1
          className="font-display uppercase leading-[0.95] text-charcoal"
          style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)", letterSpacing: "0.02em" }}
        >
          {segment.cueLabel}
        </h1>
        {segment.scriptText && (
          <p className="mt-3 font-serif text-charcoal/85 text-lg leading-snug">
            <em>{segment.scriptText}</em>
          </p>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status === "saving"}
          placeholder="Type your response…"
          className="mt-6 flex-1 min-h-[240px] w-full bg-transparent border border-charcoal/25 focus:border-primary p-4 font-serif text-lg text-charcoal focus:outline-none resize-none disabled:opacity-60"
          autoFocus
        />
        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
            {hasCountdown ? (
              <span className="tabular-nums">
                {String(secondsDisplay ?? 0).padStart(2, "0")}s remaining
              </span>
            ) : (
              <span>Take your time</span>
            )}
            {status === "failed" && (
              <span className="ml-3 text-primary">Save failed — try again</span>
            )}
          </div>
          <button
            onClick={() => void submit()}
            disabled={status === "saving" || text.trim().length === 0}
            className="inline-flex items-center gap-3 bg-iron px-8 py-4 font-mono text-sm uppercase tracking-[0.28em] text-parchment transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <span>{status === "saving" ? "Saving…" : "Submit"}</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
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
