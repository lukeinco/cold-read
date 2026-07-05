import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/session-context";
import * as mic from "@/lib/mic";
import { unlockPromptPlayer } from "@/lib/promptPlayer";
import { orgBySlugQueryOptions } from "@/lib/org-queries";

export const Route = createFileRoute("/app/$orgSlug/$assessmentSlug/")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(orgBySlugQueryOptions(params.slug)),
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
  const { slug } = Route.useParams();
  const { data: org } = useSuspenseQuery(orgBySlugQueryOptions(slug));
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
      // org_id required by RLS + not-null
      .insert({ id, client_token, org_id: org.id });
    if (error) throw error;
    setSession(id, client_token);
    navigate({ to: "/app/$slug/screening", params: { slug } });
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
        <div className="w-full border-b border-charcoal/15 bg-juniper text-parchment">
          <div className="mx-auto max-w-3xl px-6 py-2.5 font-mono text-xs uppercase tracking-[0.18em]">
            Cold Read works best in Google Chrome.
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          <div className="mb-10 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-iron">
            <span className="h-px w-8 bg-iron" />
            <span>Voice screening · {org.name}</span>
          </div>

          <h1 className="font-display text-[clamp(4rem,14vw,9rem)] leading-[0.85] text-charcoal">
            Cold
            <br />
            Read
          </h1>

          <p className="mt-8 font-serif text-2xl leading-snug text-charcoal/90 md:text-3xl">
            <em>A short voice screening for the outbound role. About 10 minutes.</em>
          </p>

          <section
            aria-labelledby="prep-title"
            className="mt-12 border border-charcoal/25 bg-parchment"
          >
            <header className="flex items-center justify-between border-b border-charcoal/25 px-5 py-3">
              <h2
                id="prep-title"
                className="font-mono text-xs uppercase tracking-[0.22em] text-charcoal"
              >
                Before you start
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-charcoal/60">
                04 items
              </span>
            </header>
            <ul className="divide-y divide-charcoal/15 font-mono text-sm text-charcoal">
              {[
                "Google Chrome",
                "A laptop (not a phone)",
                "A wired headset with mic",
                "A quiet room",
              ].map((item, i) => (
                <li key={item} className="flex items-baseline gap-4 px-5 py-3">
                  <span className="w-6 text-iron tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="uppercase tracking-wider">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-10">
            {micState === "denied" || micState === "error" ? (
              <div role="alert" className="border border-charcoal bg-parchment p-6">
                <p className="font-display text-2xl tracking-wide text-charcoal">
                  {micState === "denied" ? "Microphone blocked" : "Couldn't start"}
                </p>
                <p className="mt-2 font-serif text-lg text-charcoal/85">
                  {micState === "denied"
                    ? "We need your microphone to continue. Enable it in Chrome and refresh."
                    : errorMsg}
                </p>
                <button
                  onClick={() => {
                    setMicState("idle");
                    handleBegin();
                  }}
                  className="mt-5 inline-flex items-center gap-3 border border-charcoal bg-transparent px-6 py-3 font-mono text-xs uppercase tracking-[0.22em] text-charcoal transition-colors hover:bg-charcoal hover:text-parchment"
                >
                  <span>Retry</span>
                  <span aria-hidden>→</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleBegin}
                disabled={micState === "requesting"}
                className="group inline-flex items-center gap-4 bg-iron px-8 py-4 font-mono text-sm uppercase tracking-[0.28em] text-parchment transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
              >
                <span>{micState === "requesting" ? "Requesting mic…" : "Begin"}</span>
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </button>
            )}
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-charcoal/60">
              By continuing you consent to being recorded.
            </p>
          </div>
        </div>
      </div>

      <footer className="border-t border-charcoal/15 px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/55">
          <span>Cold Read</span>
          <span>Audio only · No video</span>
        </div>
      </footer>
    </main>
  );
}
