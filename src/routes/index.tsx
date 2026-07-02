import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/session-context";

export const Route = createFileRoute("/")({
  component: Landing,
});

type MicState = "idle" | "requesting" | "denied";

function isChrome() {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  // Chrome, not Edge or Opera or Brave-reporting-as-Chromium is fine — this is a soft warning
  return /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
}

function Landing() {
  const navigate = useNavigate();
  const { setSession } = useSession();
  const [micState, setMicState] = useState<MicState>("idle");
  const [chromeOk, setChromeOk] = useState(true);

  useEffect(() => {
    setChromeOk(isChrome());
  }, []);

  const handleBegin = async () => {
    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data, error } = await supabase
        .from("sessions")
        .insert({})
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Failed to create session");
      setSession(data.id, stream);
      navigate({ to: "/screening" });
    } catch (err) {
      console.error(err);
      setMicState("denied");
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
          {/* Eyebrow */}
          <div className="mb-10 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-iron">
            <span className="h-px w-8 bg-iron" />
            <span>Voice screening · v1</span>
          </div>

          {/* Title */}
          <h1 className="font-display text-[clamp(4rem,14vw,9rem)] leading-[0.85] text-charcoal">
            Cold
            <br />
            Read
          </h1>

          {/* Cormorant sub */}
          <p className="mt-8 font-serif text-2xl leading-snug text-charcoal/90 md:text-3xl">
            <em>A short voice screening for the outbound role. About 10 minutes.</em>
          </p>

          {/* Instruction card */}
          <section
            aria-labelledby="prep-title"
            className="mt-12 border border-charcoal/25 bg-parchment"
          >
            <header className="flex items-center justify-between border-b border-charcoal/25 px-5 py-3">
              <h2
                id="prep-title"
                className="font-mono text-xs uppercase tracking-[0.22em] text-charcoal"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.22em" }}
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

          {/* Action */}
          <div className="mt-10">
            {micState === "denied" ? (
              <div
                role="alert"
                className="border border-charcoal bg-parchment p-6"
              >
                <p className="font-display text-2xl tracking-wide text-charcoal">
                  Microphone blocked
                </p>
                <p className="mt-2 font-serif text-lg text-charcoal/85">
                  We need your microphone to continue. Enable it in Chrome and refresh.
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
