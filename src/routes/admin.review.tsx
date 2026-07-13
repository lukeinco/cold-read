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
  name: string | null;
  email: string | null;
  linkedin_url: string | null;
  submitted_at: string;
  overall_rating: number | null;
  archived_at: string | null;
  read_at: string | null;
};


type ResponseRow = {
  id: string;
  segment_id: string;
  sort_order: number;
  storage_path: string | null;
  response_type: "audio" | "text";
  text_value: Record<string, string> | null;
};

type EntryField = { id: string; label: string };

type SegmentMeta = {
  id: string;
  type: string;
  cue_label: string;
  is_active: boolean;
  sort_order: number;
  entry_fields: EntryField[];
};

type ReviewRow = {
  id: string;
  response_id: string;
  rating: number | null;
  notes: string | null;
};

function coerceSegmentMeta(row: Record<string, unknown>): SegmentMeta {
  const rawFields = Array.isArray(row.entry_fields) ? row.entry_fields : [];
  const entry_fields: EntryField[] = rawFields
    .filter(
      (f): f is { id: string; label: string } =>
        !!f &&
        typeof f === "object" &&
        typeof (f as { id?: unknown }).id === "string" &&
        typeof (f as { label?: unknown }).label === "string",
    )
    .map((f) => ({ id: f.id, label: f.label }));
  return {
    id: row.id as string,
    type: row.type as string,
    cue_label: row.cue_label as string,
    is_active: row.is_active as boolean,
    sort_order: row.sort_order as number,
    entry_fields,
  };
}

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
  const [nameFallbacks, setNameFallbacks] = useState<Record<string, string>>({});
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");

  function patchRow(id: string, patch: Partial<SessionRow>) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }


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
      setNameFallbacks({});
      return;
    }
    let alive = true;
    (async () => {
      const { data: sess } = await supabase
        .from("sessions")
        .select("id,name,email,linkedin_url,submitted_at,overall_rating,archived_at,read_at")
        .eq("assessment_id", assessmentId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });
      if (!alive) return;
      const sessList = (sess as SessionRow[]) ?? [];
      setRows(sessList);

      // Resolve name fallback for sessions without a stored name.
      const needing = sessList.filter((s) => !s.name?.trim());
      if (needing.length) {
        const { data: resps } = await supabase
          .from("responses")
          .select("session_id,text_value,segments!inner(entry_fields)")
          .eq("response_type", "text")
          .in(
            "session_id",
            needing.map((s) => s.id),
          );
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const r of (resps as Array<{
          session_id: string;
          text_value: Record<string, string> | null;
          segments: { entry_fields: Array<{ id: string; label: string }> | null } | null;
        }> | null) ?? []) {
          if (map[r.session_id]) continue;
          const fields = r.segments?.entry_fields ?? [];
          const nameField = fields.find((f) => /name/i.test(f.label));
          if (nameField && r.text_value && r.text_value[nameField.id]?.trim()) {
            map[r.session_id] = r.text_value[nameField.id].trim();
          }
        }
        setNameFallbacks(map);
      } else {
        setNameFallbacks({});
      }
    })();
    return () => {
      alive = false;
    };
  }, [assessmentId]);

  void isSuperadmin;

  const displayName = useCallback(
    (r: SessionRow) => r.name?.trim() || nameFallbacks[r.id] || r.email || "—",
    [nameFallbacks],
  );

  async function setArchived(id: string, archived: boolean) {
    const value = archived ? new Date().toISOString() : null;
    patchRow(id, { archived_at: value });
    await supabase.from("sessions").update({ archived_at: value }).eq("id", id);
  }
  async function setRead(id: string, read: boolean) {
    const value = read ? new Date().toISOString() : null;
    patchRow(id, { read_at: value });
    await supabase.from("sessions").update({ read_at: value }).eq("id", id);
  }

  if (selected) {
    return (
      <Detail
        session={selected}
        userId={userId}
        displayName={displayName(selected)}
        onBack={() => setSelected(null)}
        onPatch={patchRow}
      />
    );
  }

  const visibleRows = (rows ?? []).filter((r) =>
    view === "active" ? r.archived_at === null : r.archived_at !== null,
  );



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

        <div className="mt-4 flex flex-wrap items-center gap-6">
          {orgs && orgs.length > 1 && (
            <label className="flex items-center gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
                Org
              </span>
              <select
                value={orgId ?? ""}
                onChange={(e) => setOrgId(e.target.value)}
                className="bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 pr-6 font-mono text-sm text-charcoal focus:outline-none"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {assessments && assessments.length > 0 && (
            <label className="flex items-center gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
                Assessment
              </span>
              <select
                value={assessmentId ?? ""}
                onChange={(e) => setAssessmentId(e.target.value)}
                className="bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 pr-6 font-mono text-sm text-charcoal focus:outline-none"
              >
                {assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.is_active ? "" : "· archived"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>


        <div className="mt-6 flex gap-2">
          {(["active", "archived"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`font-mono text-[11px] uppercase tracking-[0.24em] px-3 py-1.5 border transition-colors ${
                view === v
                  ? "border-primary text-primary bg-primary/5"
                  : "border-charcoal/25 text-charcoal/60 hover:text-charcoal"
              }`}
            >
              {v === "active" ? "Active" : "Archived"}
            </button>
          ))}
        </div>

        {rows === null ? (
          <p className="mt-10 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
            Loading…
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="mt-16 font-mono text-sm uppercase tracking-[0.24em] text-charcoal/60">
            {view === "active" ? "No submissions yet." : "No archived submissions."}
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-charcoal/15">
            {visibleRows.map((r) => {
              const unread = r.read_at === null && r.archived_at === null;
              return (
                <li key={r.id}>
                  <div
                    className={`grid grid-cols-1 md:grid-cols-[1.4fr_1.2fr_auto_auto_auto] gap-2 md:gap-5 items-center py-4 px-3 hover:bg-charcoal/[0.04] transition-colors ${
                      unread ? "bg-blue-400/10" : ""
                    }`}
                  >
                    <button
                      onClick={() => setSelected(r)}
                      className="text-left font-serif text-base text-charcoal truncate hover:text-primary"
                    >
                      {displayName(r)}
                    </button>
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
                    <MiniStars value={r.overall_rating} />
                    <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
                      {formatDate(r.submitted_at)}
                    </span>
                    <div className="flex items-center gap-2 justify-self-start md:justify-self-end">
                      <button
                        onClick={() => void setRead(r.id, r.read_at === null)}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-charcoal/25 text-charcoal/70 hover:text-primary hover:border-primary"
                      >
                        {r.read_at === null ? "Mark read" : "Mark unread"}
                      </button>
                      <button
                        onClick={() => void setArchived(r.id, r.archived_at === null)}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-charcoal/25 text-charcoal/70 hover:text-primary hover:border-primary"
                      >
                        {r.archived_at === null ? "Archive" : "Unarchive"}
                      </button>
                    </div>
                  </div>
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
  displayName,
  onBack,
  onPatch,
}: {
  session: SessionRow;
  userId: string;
  displayName: string;
  onBack: () => void;
  onPatch: (id: string, patch: Partial<SessionRow>) => void;
}) {

  const [responses, setResponses] = useState<ResponseRow[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [segments, setSegments] = useState<Record<string, SegmentMeta>>({});
  const [reviews, setReviews] = useState<Record<string, ReviewRow>>({});
  const [playlist, setPlaylist] = useState<Array<{ url: string; label: string }>>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("responses")
        .select("id,segment_id,sort_order,storage_path,response_type,text_value")
        .eq("session_id", session.id)
        .order("sort_order", { ascending: true });
      const rows = ((data as Record<string, unknown>[]) ?? []).map((r) => ({
        id: r.id as string,
        segment_id: r.segment_id as string,
        sort_order: r.sort_order as number,
        storage_path: (r.storage_path as string | null) ?? null,
        response_type: ((r.response_type as string) === "text" ? "text" : "audio") as
          | "audio"
          | "text",
        text_value:
          r.text_value && typeof r.text_value === "object" && !Array.isArray(r.text_value)
            ? (r.text_value as Record<string, string>)
            : null,
      }));
      setResponses(rows);

      const { data: sessRow } = await supabase
        .from("sessions")
        .select("assessment_id")
        .eq("id", session.id)
        .maybeSingle();
      const assessmentId = (sessRow as { assessment_id?: string } | null)?.assessment_id;

      type SegFull = SegmentMeta & { prompt_audio_path: string | null };
      let allSegs: SegFull[] = [];
      if (assessmentId) {
        const { data: segs } = await supabase
          .from("segments")
          .select("id,type,cue_label,is_active,sort_order,entry_fields,prompt_audio_path")
          .eq("assessment_id", assessmentId)
          .order("sort_order", { ascending: true });
        allSegs = ((segs as Record<string, unknown>[]) ?? []).map((s) => ({
          ...coerceSegmentMeta(s),
          prompt_audio_path: (s.prompt_audio_path as string | null) ?? null,
        }));
      } else {
        const segIds = Array.from(new Set(rows.map((r) => r.segment_id)));
        if (segIds.length) {
          const { data: segs } = await supabase
            .from("segments")
            .select("id,type,cue_label,is_active,sort_order,entry_fields,prompt_audio_path")
            .in("id", segIds);
          allSegs = ((segs as Record<string, unknown>[]) ?? []).map((s) => ({
            ...coerceSegmentMeta(s),
            prompt_audio_path: (s.prompt_audio_path as string | null) ?? null,
          }));
        }
      }
      const segMap: Record<string, SegmentMeta> = {};
      for (const s of allSegs) segMap[s.id] = s;
      setSegments(segMap);

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

      const audioRows = rows.filter(
        (r) => r.response_type === "audio" && r.storage_path,
      );
      const signed: Record<string, string> = {};
      await Promise.all(
        audioRows.map(async (r) => {
          const { data: s } = await supabase.storage
            .from("recordings")
            .createSignedUrl(r.storage_path as string, 60 * 60);
          if (s?.signedUrl) signed[r.id] = s.signedUrl;
        }),
      );
      setUrls(signed);

      // Build interleaved playlist across the whole assessment in sort_order.
      const respBySeg = new Map<string, ResponseRow>();
      for (const r of rows) respBySeg.set(r.segment_id, r);
      const items: Array<{ url: string; label: string; sort: number }> = [];
      await Promise.all(
        allSegs.map(async (seg) => {
          if (seg.type === "audio" && seg.prompt_audio_path) {
            const { data: sig } = await supabase.storage
              .from("prompts")
              .createSignedUrl(seg.prompt_audio_path, 60 * 60);
            if (sig?.signedUrl) {
              items.push({
                url: sig.signedUrl,
                label: seg.cue_label || "Prospect",
                sort: seg.sort_order,
              });
            }
            return;
          }
          const resp = respBySeg.get(seg.id);
          if (resp && resp.response_type === "audio" && signed[resp.id]) {
            items.push({
              url: signed[resp.id],
              label: seg.cue_label || "Candidate",
              sort: seg.sort_order,
            });
          }
        }),
      );
      items.sort((a, b) => a.sort - b.sort);
      setPlaylist(items.map(({ url, label }) => ({ url, label })));
    })();
  }, [session.id, userId]);

  // Auto mark-as-read when opening
  useEffect(() => {
    if (session.read_at !== null) return;
    const now = new Date().toISOString();
    onPatch(session.id, { read_at: now });
    void supabase.from("sessions").update({ read_at: now }).eq("id", session.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function setOverallRating(v: number | null) {
    onPatch(session.id, { overall_rating: v });
    await supabase.from("sessions").update({ overall_rating: v }).eq("id", session.id);
  }
  async function toggleArchived() {
    const value = session.archived_at === null ? new Date().toISOString() : null;
    onPatch(session.id, { archived_at: value });
    await supabase.from("sessions").update({ archived_at: value }).eq("id", session.id);
  }
  async function toggleRead() {
    const value = session.read_at === null ? new Date().toISOString() : null;
    onPatch(session.id, { read_at: value });
    await supabase.from("sessions").update({ read_at: value }).eq("id", session.id);
  }

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
            {displayName}
          </h1>
          <div className="mt-3 space-y-1 font-mono text-xs uppercase tracking-[0.2em] text-charcoal/70">
            {session.email && <div>{session.email}</div>}
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

          <div className="mt-5 flex flex-wrap items-center gap-6">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/60 mb-1">
                Overall rating
              </div>
              <StarRating
                value={session.overall_rating}
                onChange={(v) => void setOverallRating(v)}
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => void toggleRead()}
                className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 border border-charcoal/25 text-charcoal/70 hover:text-primary hover:border-primary"
              >
                {session.read_at === null ? "Mark as read" : "Mark as unread"}
              </button>
              <button
                onClick={() => void toggleArchived()}
                className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 border border-charcoal/25 text-charcoal/70 hover:text-primary hover:border-primary"
              >
                {session.archived_at === null ? "Archive" : "Unarchive"}
              </button>
            </div>
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
                  {r.response_type === "text" ? (
                    <TextResponseView
                      segment={seg}
                      values={r.text_value ?? {}}
                    />
                  ) : urls[r.id] ? (
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

function TextResponseView({
  segment,
  values,
}: {
  segment: SegmentMeta | undefined;
  values: Record<string, string>;
}) {
  const fields = segment?.entry_fields ?? [];
  const known = new Set(fields.map((f) => f.id));
  const extras = Object.entries(values).filter(([id]) => !known.has(id));

  if (fields.length === 0 && extras.length === 0) {
    return (
      <p className="mt-3 font-mono text-xs uppercase tracking-[0.24em] text-charcoal/60">
        No text entered.
      </p>
    );
  }

  return (
    <dl className="mt-3 space-y-3">
      {fields.map((f) => {
        const v = values[f.id] ?? "";
        return (
          <div key={f.id} className="border border-charcoal/15 bg-parchment px-4 py-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/60">
              {f.label}
            </dt>
            <dd className="mt-1 font-serif text-base text-charcoal whitespace-pre-wrap break-words">
              {v.trim() ? v : <span className="text-charcoal/40">—</span>}
            </dd>
          </div>
        );
      })}
      {extras.map(([id, v]) => (
        <div key={id} className="border border-charcoal/15 bg-parchment px-4 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/40">
            {id} (removed)
          </dt>
          <dd className="mt-1 font-serif text-base text-charcoal whitespace-pre-wrap break-words">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MiniStars({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/30">—</span>;
  }
  return (
    <span className="text-iron text-sm leading-none tracking-tight" aria-label={`${value} of 5`}>
      {"★".repeat(value)}
      <span className="text-charcoal/20">{"★".repeat(5 - value)}</span>
    </span>
  );
}
