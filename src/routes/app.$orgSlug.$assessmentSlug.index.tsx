import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/session-context";
import * as mic from "@/lib/mic";
import { unlockPromptPlayer } from "@/lib/promptPlayer";
import { themedAssessmentQueryOptions } from "@/lib/assessment-theme";

export const Route = createFileRoute("/app/$orgSlug/$assessmentSlug/")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      themedAssessmentQueryOptions(params.orgSlug, params.assessmentSlug),
    ),
  component: Landing,
});

type MicState = "idle" | "requesting" | "denied" | "error";

function isChrome() {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
}

function Landing() {
  const navigate = useNavigate();
  const { orgSlug, assessmentSlug } = Route.useParams();
  const { data } = useSuspenseQuery(
    themedAssessmentQueryOptions(orgSlug, assessmentSlug),
  );
  const { org, assessment } = data;
  const { setSession } = useSession();
  const [micState, setMicState] = useState<MicState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [chromeOk, setChromeOk] = useState(true);

  useEffect(() => {
    setChromeOk(isChrome());
  }, []);

  const createSessionAndGo = async () => {
    const id = crypto.randomUUID();
    const client_token = crypto.randomUUID();
    const { error } = await supabase
      .from("sessions")
      .insert({ id, client_token, org_id: org.id, assessment_id: assessment.id });
    if (error) throw error;
    setSession(id, client_token);
    navigate({
      to: "/app/$orgSlug/$assessmentSlug/screening",
      params: { orgSlug, assessmentSlug },
    });
  };

  const handleBegin = async () => {
    setMicState("requesting");
    setErrorMsg("");
    try {
      await mic.acquire();
      await unlockPromptPlayer();
    } catch (err) {
      const e = err as DOMException;
      console.error("[mic] acquire failed:", e.name, e.message);
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setMicState("denied");
      } else if (e.name === "NotFoundError") {
        setErrorMsg("No microphone found. Plug one in and retry.");
        setMicState("error");
      } else if (e.name === "NotReadableError") {
        setErrorMsg(
          "Your microphone is being held by another browser tab or app. Close other tabs and apps that use the mic (or fully quit and reopen Chrome), then retry.",
        );
        setMicState("error");
      } else {
        setErrorMsg(`${e.name || "Error"}: ${e.message || "Couldn't access mic."}`);
        setMicState("error");
      }
      return;
    }

    try {
      await createSessionAndGo();
    } catch (err) {
      console.error("[session] insert failed:", err);
      mic.release();
      const msg = err instanceof Error ? err.message : "Couldn't start session.";
      setErrorMsg(msg);
      setMicState("error");
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      {!chromeOk && (
        <div className="w-full border-b a-border-muted a-accent-bg">
          <div className="mx-auto max-w-3xl px-6 py-2.5 a-font-body text-xs uppercase tracking-[0.18em] a-bg" style={{ backgroundColor: "transparent", color: "var(--a-bg)" }}>
            Cold Read works best in Google Chrome.
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <div className="mb-10 flex items-center gap-3 a-font-body text-[11px] uppercase tracking-[0.28em] a-muted">
            <span className="h-px w-8" style={{ backgroundColor: "var(--a-muted)" }} />
            <span>
              {assessment.name} · {org.name}
            </span>
          </div>

          <h1 className="a-font-title a-text leading-[0.85]" style={{ fontSize: "clamp(4rem,14vw,9rem)" }}>
            Cold
            <br />
            Read
          </h1>

          <p className="mt-8 a-font-body text-2xl leading-snug a-text md:text-3xl" style={{ opacity: 0.9 }}>
            <em>A short voice screening. About 10 minutes.</em>
          </p>

          <section
            aria-labelledby="prep-title"
            className="mt-12 border a-border-muted a-card-bg"
          >
            <header className="flex items-center justify-between border-b a-border-muted px-5 py-3">
              <h2
                id="prep-title"
                className="a-font-body text-xs uppercase tracking-[0.22em] a-text"
              >
                Before you start
              </h2>
              <span className="a-font-body text-[10px] uppercase tracking-[0.22em] a-muted">
                04 items
              </span>
            </header>
            <ul className="a-font-body text-sm a-text" style={{ borderColor: "var(--a-muted)" }}>
              {[
                "Google Chrome",
                "A laptop (not a phone)",
                "A wired headset with mic",
                "A quiet room",
              ].map((item, i) => (
                <li
                  key={item}
                  className="flex items-baseline gap-4 px-5 py-3 border-t a-border-muted first:border-t-0"
                >
                  <span className="w-6 a-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="uppercase tracking-wider">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-10">
            {micState === "denied" || micState === "error" ? (
              <div role="alert" className="border a-border-text a-card-bg p-6">
                <p className="a-font-title text-2xl a-text">
                  {micState === "denied" ? "Microphone blocked" : "Couldn't start"}
                </p>
                <p className="mt-2 a-font-body text-lg a-text" style={{ opacity: 0.85 }}>
                  {micState === "denied"
                    ? "We need your microphone to continue. Enable it in Chrome and refresh."
                    : errorMsg}
                </p>
                <button
                  onClick={() => {
                    setMicState("idle");
                    handleBegin();
                  }}
                  className="mt-5 inline-flex items-center gap-3 border a-border-text a-text a-font-body text-xs uppercase tracking-[0.22em] px-6 py-3"
                  style={{ backgroundColor: "transparent" }}
                >
                  <span>Retry</span>
                  <span aria-hidden>→</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleBegin}
                disabled={micState === "requesting"}
                className="group inline-flex items-center gap-4 a-accent-bg a-font-body text-sm uppercase tracking-[0.28em] px-8 py-4 transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
                style={{ color: "var(--a-bg)" }}
              >
                <span>{micState === "requesting" ? "Requesting mic…" : "Begin"}</span>
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </button>
            )}
            <p className="mt-4 a-font-body text-[11px] uppercase tracking-[0.22em] a-muted">
              By continuing you consent to being recorded.
            </p>
          </div>
        </div>
      </div>

      <footer className="border-t a-border-muted px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between a-font-body text-[10px] uppercase tracking-[0.28em] a-muted">
          <span>Cold Read</span>
          <span>Audio only · No video</span>
        </div>
      </footer>
    </main>
  );
}
