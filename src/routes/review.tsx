import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewPage,
});

type SessionRow = {
  id: string;
  email: string | null;
  linkedin_url: string | null;
  submitted_at: string;
};

type ResponseRow = {
  id: string;
  segment_id: string;
  sort_order: number;
  storage_path: string;
};

function ReviewPage() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <main className="min-h-screen bg-background" />;
  if (!authSession) return <SignIn />;
  return <Dashboard onSignOut={() => supabase.auth.signOut()} />;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl md:text-6xl tracking-wide text-charcoal leading-none">
          COLD READ
          <br />
          <span className="text-primary">— REVIEW</span>
        </h1>
        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-base text-charcoal focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
              Password
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-base text-charcoal focus:outline-none"
            />
          </label>
          {error && (
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full font-mono text-sm uppercase tracking-[0.28em] bg-primary text-parchment py-4 disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [selected, setSelected] = useState<SessionRow | null>(null);

  useEffect(() => {
    supabase
      .from("sessions")
      .select("id,email,linkedin_url,submitted_at")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .then(({ data }) => setRows((data as SessionRow[]) ?? []));
  }, []);

  if (selected) {
    return <Detail session={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — REVIEW
          </h1>
          <button
            onClick={onSignOut}
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
          >
            Sign out
          </button>
        </header>

        {rows === null ? (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-16 font-mono text-sm uppercase tracking-[0.24em] text-charcoal/60">
            No submissions yet.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-charcoal/15">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r)}
                  className="w-full grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 md:gap-6 py-5 text-left font-mono text-sm text-charcoal hover:bg-charcoal/5 transition-colors px-2"
                >
                  <span className="truncate">{r.email ?? "—"}</span>
                  <span className="truncate text-charcoal/70">
                    {r.linkedin_url ?? "—"}
                  </span>
                  <span className="text-charcoal/60 text-xs uppercase tracking-[0.2em]">
                    {formatDate(r.submitted_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Detail({ session, onBack }: { session: SessionRow; onBack: () => void }) {
  const [responses, setResponses] = useState<ResponseRow[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [segmentTypes, setSegmentTypes] = useState<Record<string, string>>({});

  const segmentTypeById = useMemo(() => segmentTypes, [segmentTypes]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("responses")
        .select("id,segment_id,sort_order,storage_path")
        .eq("session_id", session.id)
        .order("sort_order", { ascending: true });
      const rows = (data as ResponseRow[]) ?? [];
      setResponses(rows);

      const ids = Array.from(new Set(rows.map((r) => r.segment_id)));
      if (ids.length) {
        const { data: segs } = await supabase
          .from("segments")
          .select("id,type")
          .in("id", ids);
        const map: Record<string, string> = {};
        for (const s of (segs as Array<{ id: string; type: string }> | null) ?? []) {
          map[s.id] = s.type;
        }
        setSegmentTypes(map);
      }

      const signed: Record<string, string> = {};
      await Promise.all(
        rows.map(async (r) => {
          const { data: s } = await supabase.storage
            .from("recordings")
            .createSignedUrl(r.storage_path, 60 * 60);
          if (s?.signedUrl) signed[r.id] = s.signedUrl;
        }),
      );
      setUrls(signed);
    })();
  }, [session.id]);


  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onBack}
          className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
        >
          ← Back
        </button>

        <header className="mt-6 border-b-2 border-charcoal/20 pb-6">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            {session.email ?? "—"}
          </h1>
          <div className="mt-3 space-y-1 font-mono text-xs uppercase tracking-[0.2em] text-charcoal/70">
            {session.linkedin_url && (
              <div>
                <a
                  href={session.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary underline underline-offset-4"
                >
                  {session.linkedin_url}
                </a>
              </div>
            )}
            <div>Submitted {formatDate(session.submitted_at)}</div>
          </div>
        </header>

        {responses === null ? (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
            Loading…
          </p>
        ) : responses.length === 0 ? (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
            No responses.
          </p>
        ) : (
          <ol className="mt-8 space-y-8">
            {responses.map((r) => (
              <li key={r.id}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">
                    {typeLabel(segmentTypeById[r.segment_id])}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/50">
                    {String(r.sort_order + 1).padStart(2, "0")}
                  </span>
                </div>
                {urls[r.id] ? (
                  <audio
                    controls
                    src={urls[r.id]}
                    className="mt-3 w-full"
                    preload="none"
                  />
                ) : (
                  <p className="mt-3 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
                    Loading audio…
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function typeLabel(t: string | undefined) {
  if (t === "warmup") return "Warm-up";
  if (t === "question") return "Question";
  if (t === "scripted") return "Scripted";
  if (t === "improv") return "Improv";
  return t ?? "—";
}

