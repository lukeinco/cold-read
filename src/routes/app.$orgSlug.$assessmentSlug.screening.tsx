import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/session-context";
import * as mic from "@/lib/mic";
import { getPromptPlayer } from "@/lib/promptPlayer";
import { themedAssessmentQueryOptions } from "@/lib/assessment-theme";

export type SegmentType =
  | "audio"
  | "text"
  | "text_entry"
  | "warmup"
  | "question"
  | "scripted"
  | "improv";

export interface EntryField {
  id: string;
  label: string;
}

export interface Segment {
  id: string;
  type: SegmentType;
  promptAudioPath: string | null;
  scriptText: string | null;
  countdownSeconds: number | null;
  cueColor: string;
  cueLabel: string;
  overrideCardColor: string | null;
  overrideTextColor: string | null;
  entryFields: EntryField[];
}

function segmentsForAssessmentQueryOptions(assessmentId: string) {
  return queryOptions({
    queryKey: ["segments", "active", "assessment", assessmentId],
    queryFn: async (): Promise<Segment[]> => {
      const { data, error } = await supabase
        .from("segments")
        .select(
          "id, type, prompt_audio_path, script_text, countdown_seconds, cue_color, cue_label, override_card_color, override_text_color, entry_fields",
        )
        .eq("assessment_id", assessmentId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const rawFields = Array.isArray(r.entry_fields) ? r.entry_fields : [];
        const entryFields: EntryField[] = rawFields
          .filter(
            (f): f is { id: string; label: string } =>
              !!f &&
              typeof f === "object" &&
              typeof (f as { id?: unknown }).id === "string" &&
              typeof (f as { label?: unknown }).label === "string",
          )
          .map((f) => ({ id: f.id, label: f.label }));
        return {
          id: r.id as string,
          type: r.type as SegmentType,
          promptAudioPath: (r.prompt_audio_path as string | null) ?? null,
          scriptText: (r.script_text as string | null) ?? null,
          countdownSeconds: (r.countdown_seconds as number | null) ?? null,
          cueColor: r.cue_color as string,
          cueLabel: r.cue_label as string,
          overrideCardColor: (r.override_card_color as string | null) ?? null,
          overrideTextColor: (r.override_text_color as string | null) ?? null,
          entryFields,
        };
      });
    },
  });
}

export const Route = createFileRoute("/app/$orgSlug/$assessmentSlug/screening")({
  head: () => ({
    meta: [
      { title: "Screening — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context, params }) => {
    const { assessment } = await context.queryClient.ensureQueryData(
      themedAssessmentQueryOptions(params.orgSlug, params.assessmentSlug),
    );
    await context.queryClient.ensureQueryData(
      segmentsForAssessmentQueryOptions(assessment.id),
    );
  },
  component: Screening,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center a-bg px-6">
      <p className="a-font-body text-xs uppercase tracking-[0.28em] a-accent">
        Couldn't load screening — {error.message}
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="min-h-screen flex items-center justify-center a-bg px-6">
      <p className="a-font-body text-xs uppercase tracking-[0.28em] a-muted">
        No active segments.
      </p>
    </main>
  ),
});

type Phase = "cue" | "respond" | "upload";

function Screening() {
  const { orgSlug, assessmentSlug } = Route.useParams();
  const { data } = useSuspenseQuery(
    themedAssessmentQueryOptions(orgSlug, assessmentSlug),
  );
  const { sessionId, sessionToken } = useSession();
  const { data: segments } = useSuspenseQuery(
    segmentsForAssessmentQueryOptions(data.assessment.id),
  );
  const mediaStream = mic.getExisting();

  if (!sessionId || !sessionToken || !mediaStream) {
    return <Navigate to="/app/$orgSlug/$assessmentSlug" params={{ orgSlug, assessmentSlug }} />;
  }

  if (segments.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center a-bg px-6">
        <p className="a-font-body text-xs uppercase tracking-[0.28em] a-muted">
          No active segments.
        </p>
      </main>
    );
  }

  return (
    <Player
      orgSlug={orgSlug}
      assessmentSlug={assessmentSlug}
      sessionId={sessionId}
      sessionToken={sessionToken}
      mediaStream={mediaStream}
      segments={segments}
    />
  );
}

function Player({
  orgSlug,
  assessmentSlug,
  sessionId,
  sessionToken,
  mediaStream,
  segments,
}: {
  orgSlug: string;
  assessmentSlug: string;
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

  const isResponseStep = (t: SegmentType) => t !== "audio" && t !== "text";

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
      navigate({
        to: "/app/$orgSlug/$assessmentSlug/finish",
        params: { orgSlug, assessmentSlug },
      });
    } else {
      setIndex((i) => i + 1);
      setPhase("cue");
    }
  }, [isLast, navigate, orgSlug, assessmentSlug]);

  if (segment.type === "audio") {
    return (
      <main className="min-h-screen relative a-bg">
        <AudioCallPhase key={`audio-${segment.id}`} segment={segment} onDone={advanceSegment} />
      </main>
    );
  }

  if (segment.type === "text") {
    return (
      <main className="min-h-screen relative a-bg">
        <TextSlidePhase key={`text-${segment.id}`} segment={segment} onDone={advanceSegment} />
      </main>
    );
  }

  if (segment.type === "text_entry") {
    return (
      <main className="min-h-screen relative a-bg">
        {responseIndex >= 0 && (
          <ProgressChip current={responseIndex + 1} total={responseSteps.length} />
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
    <main className="min-h-screen relative a-bg">
      {responseIndex >= 0 && (
        <ProgressChip current={responseIndex + 1} total={responseSteps.length} />
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

const latestBlobRef: { current: Blob | null } = { current: null };

function ProgressChip({ current, total }: { current: number; total: number }) {
  return (
    <div className="pointer-events-none absolute right-6 top-6 z-40 a-font-body text-xs uppercase tracking-[0.28em] a-muted">
      {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
    </div>
  );
}

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
    <section className="min-h-screen flex items-center justify-center px-6 a-bg">
      <div className="flex items-center gap-3 a-text a-font-body">
        <span
          className="inline-block h-2 w-2 rounded-full a-accent-bg"
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

function TextSlidePhase({ segment, onDone }: { segment: Segment; onDone: () => void }) {
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

  const cardBg = segment.overrideCardColor ?? undefined;
  const textColor = segment.overrideTextColor ?? undefined;

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-8 py-16 text-center a-bg">
      <div
        className="w-full max-w-3xl a-card-bg px-10 py-16"
        style={cardBg ? { backgroundColor: cardBg } : undefined}
      >
        <h1
          className="a-font-title a-text uppercase leading-[0.95]"
          style={{
            fontSize: "clamp(2.5rem, 8vw, 6rem)",
            letterSpacing: "0.02em",
            ...(textColor ? { color: textColor } : {}),
          }}
        >
          {segment.cueLabel}
        </h1>
        {segment.scriptText && (
          <p
            className="mt-8 max-w-2xl mx-auto a-font-body a-text leading-[1.3]"
            style={{
              fontSize: "clamp(1.125rem, 2.5vw, 1.75rem)",
              ...(textColor ? { color: textColor } : {}),
            }}
          >
            <em>{segment.scriptText}</em>
          </p>
        )}
        <button
          onClick={finish}
          className="mt-14 inline-flex items-center gap-3 border-2 a-border-accent a-accent a-font-body text-sm uppercase tracking-[0.28em] px-8 py-4 transition-transform hover:-translate-y-0.5"
        >
          <span>Continue</span>
          <span aria-hidden>→</span>
        </button>
      </div>
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
  const fields = segment.entryFields;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, ""])),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
  const submittedRef = useRef(false);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setStatus("saving");
    try {
      const res = await fetch("/api/save-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          segmentId: segment.id,
          sortOrder,
          values,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "save failed"));
      onDone();
    } catch (err) {
      console.error("text-entry save failed", err);
      submittedRef.current = false;
      setStatus("failed");
    }
  }, [values, sessionId, sessionToken, segment.id, sortOrder, onDone]);

  const allFilled =
    fields.length === 0 || fields.every((f) => (values[f.id] ?? "").trim().length > 0);
  const cardBg = segment.overrideCardColor ?? undefined;
  const textColor = segment.overrideTextColor ?? undefined;

  return (
    <section className="min-h-screen flex flex-col a-bg px-6 pt-20 pb-10">
      <div
        className="mx-auto w-full max-w-3xl flex-1 flex flex-col a-card-bg p-10"
        style={cardBg ? { backgroundColor: cardBg } : undefined}
      >
        <h1
          className="a-font-title a-text uppercase leading-[0.95]"
          style={{
            fontSize: "clamp(1.75rem, 4.5vw, 3rem)",
            letterSpacing: "0.02em",
            ...(textColor ? { color: textColor } : {}),
          }}
        >
          {segment.cueLabel}
        </h1>
        {segment.scriptText && (
          <p
            className="mt-3 a-font-body a-text text-lg leading-snug"
            style={textColor ? { color: textColor, opacity: 0.85 } : { opacity: 0.85 }}
          >
            <em>{segment.scriptText}</em>
          </p>
        )}

        <div className="mt-8 flex-1 space-y-6">
          {fields.length === 0 ? (
            <p
              className="a-font-body text-sm a-text"
              style={textColor ? { color: textColor, opacity: 0.7 } : { opacity: 0.7 }}
            >
              No fields configured for this step.
            </p>
          ) : (
            fields.map((f) => (
              <label key={f.id} className="block">
                <span
                  className="a-font-body text-[11px] uppercase tracking-[0.28em]"
                  style={textColor ? { color: textColor, opacity: 0.7 } : { opacity: 0.7 }}
                >
                  {f.label}
                </span>
                <input
                  type="text"
                  value={values[f.id] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                  }
                  disabled={status === "saving"}
                  maxLength={4000}
                  className="mt-2 w-full bg-transparent border-b-2 a-border-muted focus:a-border-accent py-2 a-font-body text-lg a-text focus:outline-none disabled:opacity-60"
                  style={textColor ? { color: textColor } : undefined}
                />
              </label>
            ))
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="a-font-body text-[11px] uppercase tracking-[0.24em] a-muted">
            {status === "failed" ? (
              <span className="a-accent">Save failed — try again</span>
            ) : (
              <span>Take your time</span>
            )}
          </div>
          <button
            onClick={() => void submit()}
            disabled={status === "saving" || !allFilled}
            className="inline-flex items-center gap-3 a-accent-bg a-font-body text-sm uppercase tracking-[0.28em] px-8 py-4 transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
            style={{ color: "var(--a-bg)" }}
          >
            <span>{status === "saving" ? "Saving…" : "Continue"}</span>
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

  // Improv cue flashes fullscreen in the theme accent (its distinctive color).
  // Other cues use the theme background with accent text.
  return (
    <section
      className={
        isImprov
          ? "min-h-screen flex items-center justify-center px-6 a-accent-bg"
          : "min-h-screen flex items-center justify-center px-6 a-bg"
      }
    >
      <h1
        className="text-center a-font-title leading-[0.9] uppercase"
        style={{
          fontSize: "clamp(3rem, 10vw, 8rem)",
          letterSpacing: "0.02em",
          color: isImprov ? "var(--a-bg)" : "var(--a-accent)",
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
  const cardBg = segment.overrideCardColor ?? undefined;
  const textColor = segment.overrideTextColor ?? undefined;

  return (
    <section className="min-h-screen flex flex-col a-bg relative">
      {recording && (
        <div className="pointer-events-none absolute left-6 top-6 z-40 flex items-center gap-2 a-font-body text-[11px] uppercase tracking-[0.28em] a-accent">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full a-accent-bg opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full a-accent-bg" />
          </span>
          REC
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        {segment.scriptText ? (
          <div
            className="max-w-3xl w-full a-card-bg p-10"
            style={cardBg ? { backgroundColor: cardBg } : undefined}
          >
            <p
              className="text-center a-font-body a-text leading-[1.15]"
              style={{
                fontSize: "clamp(2rem, 5.5vw, 4rem)",
                ...(textColor ? { color: textColor } : {}),
              }}
            >
              <em>{segment.scriptText}</em>
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="a-font-body text-xs uppercase tracking-[0.28em] a-muted">
              Speak freely
            </p>
          </div>
        )}
      </div>

      <div className="px-6 pb-10">
        {hasCountdown ? (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-baseline justify-between a-font-body text-[11px] uppercase tracking-[0.24em] a-muted">
              <span>Time remaining</span>
              <span className="a-accent tabular-nums">
                {String(secondsDisplay ?? 0).padStart(2, "0")}s
              </span>
            </div>
            <div
              className="mt-2 h-2 w-full"
              style={{ backgroundColor: "color-mix(in srgb, var(--a-muted) 25%, transparent)" }}
            >
              <div
                className="h-full a-accent-bg transition-[width] duration-100 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={stopAndFinish}
              className="inline-flex items-center gap-3 a-accent-bg a-font-body text-sm uppercase tracking-[0.28em] px-8 py-4 transition-transform hover:-translate-y-0.5"
              style={{ color: "var(--a-bg)" }}
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
    <section className="min-h-screen flex items-center justify-center a-bg px-6">
      {status === "saving" ? (
        <div className="text-center">
          <p className="a-font-body text-xs uppercase tracking-[0.32em] a-muted">
            Saving…
          </p>
          <div
            className="mt-6 mx-auto h-px w-24 overflow-hidden"
            style={{ backgroundColor: "color-mix(in srgb, var(--a-muted) 40%, transparent)" }}
          >
            <div className="h-full w-1/2 a-accent-bg animate-[slide_1.2s_ease-in-out_infinite]" />
          </div>
          <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }`}</style>
        </div>
      ) : (
        <div className="max-w-md text-center border a-border-text a-card-bg p-8">
          <p className="a-font-title text-4xl a-text">Couldn't save</p>
          <p className="mt-3 a-font-body text-lg a-text" style={{ opacity: 0.85 }}>
            <em>Your recording is still here. Try again.</em>
          </p>
          <button
            onClick={() => {
              attemptedRef.current = true;
              void run();
            }}
            className="mt-6 inline-flex items-center gap-3 a-accent-bg a-font-body text-xs uppercase tracking-[0.24em] px-6 py-3"
            style={{ color: "var(--a-bg)" }}
          >
            <span>Retry</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </section>
  );
}
