import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminOrgs, type Org, type Assessment } from "@/lib/org-queries";

export const Route = createFileRoute("/admin/review")({
  head: () => ({
    meta: [
      { title: "Review — Cold Read Admin" },
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

type SegmentMeta = {
  id: string;
  type: string;
  cue_label: string;
  is_active: boolean;
  sort_order: number;
};

type ReviewRow = {
  id: string;
  response_id: string;
  rating: number | null;
  notes: string | null;
};

function ReviewPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);
        setIsAdmin(
          !!roles?.some((r) => r.role === "admin" || r.role === "superadmin"),
        );
      }
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setIsAdmin(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checked && !session) navigate({ to: "/admin/login" });
  }, [checked, session, navigate]);

  if (!checked) return <main className="min-h-screen bg-parchment" />;
  if (!session) return null;
  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-4xl text-charcoal">Restricted</h1>
          <p className="mt-3 font-serif text-lg text-charcoal/85">
            <em>Only admins can review submissions.</em>
          </p>
        </div>
      </main>
    );
  }

  return <Dashboard userId={session.user.id} isSuperadmin={false} />;
}

function Dashboard({ userId, isSuperadmin }: { userId: string; isSuperadmin: boolean }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [activeSegments, setActiveSegments] = useState<SegmentMeta[]>([]);
  const [respCounts, setRespCounts] = useState<Record<string, { total: number; activeCovered: number }>>({});
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Detect superadmin from user_roles for full org visibility
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const sa = !!roles?.some((r) => r.role === "superadmin");
      const list = await loadAdminOrgs({ userId, isSuperadmin: sa });
      setOrgs(list);
      setOrgId((prev) => prev ?? list[0]?.id ?? null);
    })();
  }, [userId]);

  useEffect(() => {
    if (!orgId) {
      setAssessments(null);
      setAssessmentId(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("assessments")
        .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
        .eq("org_id", orgId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });
      if (!alive) return;
      const list = (data ?? []) as Assessment[];
      setAssessments(list);
      setAssessmentId((prev) =>
        prev && list.some((a) => a.id === prev) ? prev : list[0]?.id ?? null,
      );
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!assessmentId) {
      setRows([]);
      setActiveSegments([]);
      setRespCounts({});
      return;
    }
    let alive = true;
    (async () => {
      const { data: segs } = await supabase
        .from("segments")
        .select("id,type,cue_label,is_active,sort_order")
        .eq("assessment_id", assessmentId)
        .order("sort_order", { ascending: true });
      if (!alive) return;
      const segList = (segs as SegmentMeta[]) ?? [];
      setActiveSegments(segList.filter((s) => s.is_active));

      const { data: sess } = await supabase
        .from("sessions")
        .select("id,email,linkedin_url,submitted_at")
        .eq("assessment_id", assessmentId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });
      if (!alive) return;
      const sessList = (sess as SessionRow[]) ?? [];
      setRows(sessList);

      if (sessList.length) {
        const { data: resps } = await supabase
          .from("responses")
          .select("session_id,segment_id")
          .in(
            "session_id",
            sessList.map((s) => s.id),
          );
        if (!alive) return;
        const activeIds = new Set(segList.filter((s) => s.is_active).map((s) => s.id));
        const counts: Record<string, { total: number; activeCovered: number }> = {};
        for (const s of sessList) counts[s.id] = { total: 0, activeCovered: 0 };
        const covered: Record<string, Set<string>> = {};
        for (const r of (resps as Array<{ session_id: string; segment_id: string }> | null) ?? []) {
          counts[r.session_id].total += 1;
          if (activeIds.has(r.segment_id)) {
            (covered[r.session_id] ??= new Set()).add(r.segment_id);
          }
        }
        for (const s of sessList) counts[s.id].activeCovered = covered[s.id]?.size ?? 0;
        setRespCounts(counts);
      } else {
        setRespCounts({});
      }
    })();
    return () => {
      alive = false;
    };
  }, [assessmentId]);

  void isSuperadmin;

  if (selected) {
    return (
      <Detail
        session={selected}
        userId={userId}
        onBack={() => setSelected(null)}
      />
    );
  }

  const activeTotal = activeSegments.length;

  return (
    <main className="min-h-screen bg-parchment px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — REVIEW
          </h1>
          <div className="flex items-center gap-6">
            <Link
              to="/admin"
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              ← Admin
            </Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              Sign out
            </button>
          </div>
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
            {rows.map((r) => {
              const c = respCounts[r.id] ?? { total: 0, activeCovered: 0 };
              const complete = activeTotal > 0 && c.activeCovered >= activeTotal;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    className="w-full grid grid-cols-1 md:grid-cols-[1.4fr_1.4fr_auto_auto_auto] gap-2 md:gap-6 items-baseline py-5 text-left hover:bg-charcoal/[0.04] transition-colors px-2"
                  >
                    <span className="font-serif text-base text-charcoal truncate">
                      {r.email ?? "—"}
                    </span>
                    <span className="font-mono text-xs text-charcoal/70 truncate">
                      {r.linkedin_url ? (
                        <a
                          href={r.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-primary underline underline-offset-4"
                        >
                          {r.linkedin_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
                      {formatDate(r.submitted_at)}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
                      {c.total} resp
                    </span>
                    <span
                      className={`justify-self-start md:justify-self-end font-mono text-[10px] uppercase tracking-[0.24em] px-2 py-1 border ${
                        complete
                          ? "border-juniper text-juniper"
                          : "border-primary text-primary"
                      }`}
                    >
                      {complete
                        ? "Complete"
                        : `Partial (${c.activeCovered}/${activeTotal})`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function Detail({
  session,
  userId,
  onBack,
}: {
  session: SessionRow;
  userId: string;
  onBack: () => void;
}) {
  const [responses, setResponses] = useState<ResponseRow[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [segments, setSegments] = useState<Record<string, SegmentMeta>>({});
  const [reviews, setReviews] = useState<Record<string, ReviewRow>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("responses")
        .select("id,segment_id,sort_order,storage_path")
        .eq("session_id", session.id)
        .order("sort_order", { ascending: true });
      const rows = (data as ResponseRow[]) ?? [];
      setResponses(rows);

      const segIds = Array.from(new Set(rows.map((r) => r.segment_id)));
      if (segIds.length) {
        const { data: segs } = await supabase
          .from("segments")
          .select("id,type,cue_label,is_active,sort_order")
          .in("id", segIds);
        const map: Record<string, SegmentMeta> = {};
        for (const s of (segs as SegmentMeta[] | null) ?? []) map[s.id] = s;
        setSegments(map);
      }

      const respIds = rows.map((r) => r.id);
      if (respIds.length) {
        const { data: revs } = await supabase
          .from("reviews")
          .select("id,response_id,rating,notes")
          .in("response_id", respIds)
          .eq("reviewer_user_id", userId);
        const revMap: Record<string, ReviewRow> = {};
        for (const r of (revs as ReviewRow[] | null) ?? []) revMap[r.response_id] = r;
        setReviews(revMap);
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
  }, [session.id, userId]);

  const upsertReview = useCallback(
    async (responseId: string, patch: { rating?: number | null; notes?: string | null }) => {
      const existing = reviews[responseId];
      const next: ReviewRow = {
        id: existing?.id ?? "",
        response_id: responseId,
        rating: patch.rating !== undefined ? patch.rating : (existing?.rating ?? null),
        notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
      };
      setReviews((prev) => ({ ...prev, [responseId]: next }));
      const { data, error } = await supabase
        .from("reviews")
        .upsert(
          {
            response_id: responseId,
            reviewer_user_id: userId,
            rating: next.rating,
            notes: next.notes,
          },
          { onConflict: "response_id,reviewer_user_id" },
        )
        .select("id,response_id,rating,notes")
        .single();
      if (!error && data) {
        setReviews((prev) => ({ ...prev, [responseId]: data as ReviewRow }));
      }
      return { error };
    },
    [reviews, userId],
  );

  return (
    <main className="min-h-screen bg-parchment px-6 py-12">
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
            <div>Submitted {formatDateTime(session.submitted_at)}</div>
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
          <ol className="mt-8 space-y-10">
            {responses.map((r) => {
              const seg = segments[r.segment_id];
              const rev = reviews[r.id];
              return (
                <li key={r.id} className="border-b border-charcoal/10 pb-8">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-primary">
                        {typeLabel(seg?.type)}
                      </div>
                      <div className="mt-1 font-serif text-lg text-charcoal">
                        {seg?.cue_label ?? "—"}
                      </div>
                    </div>
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

                  <div className="mt-4 grid gap-3">
                    <StarRating
                      value={rev?.rating ?? null}
                      onChange={(v) => void upsertReview(r.id, { rating: v })}
                    />
                    <NotesField
                      value={rev?.notes ?? ""}
                      onCommit={(v) => void upsertReview(r.id, { notes: v || null })}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value != null && n <= value;
        return (
          <button
            key={n}
            onClick={() => onChange(value === n ? null : n)}
            className={`text-2xl leading-none transition-colors ${
              filled ? "text-iron" : "text-charcoal/25 hover:text-charcoal/60"
            }`}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            ★
          </button>
        );
      })}
      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
        {value ? `${value}/5` : "unrated"}
      </span>
    </div>
  );
}

function NotesField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  function schedule(next: string) {
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onCommit(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }, 600);
  }

  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/60">
          Notes
        </span>
        {saved && (
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-juniper">
            Saved
          </span>
        )}
      </div>
      <textarea
        value={local}
        onChange={(e) => schedule(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          if (local !== value) onCommit(local);
        }}
        rows={3}
        placeholder="Private notes…"
        className="mt-1 w-full bg-transparent border border-charcoal/25 focus:border-primary p-3 font-serif text-sm text-charcoal focus:outline-none"
      />
    </label>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function typeLabel(t: string | undefined) {
  if (t === "warmup") return "Warm-up";
  if (t === "question") return "Question";
  if (t === "scripted") return "Scripted";
  if (t === "improv") return "Improv";
  return t ?? "—";
}
