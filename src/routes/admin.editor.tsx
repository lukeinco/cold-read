import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import * as mic from "@/lib/mic";
import { loadAdminOrgs, type Org, type Assessment } from "@/lib/org-queries";
import { PresentationPanel } from "@/components/admin/PresentationPanel";
import {
  DEFAULT_BODY_FONT,
  DEFAULT_TITLE_FONT,
  fontStack,
} from "@/config/fonts";
import {
  type Theme,
  contrastRatio,
  eqColor,
  inPalette,
  themeSwatches,
} from "@/lib/themes";
import {
  AI_PRIMER,
  buildExport,
  downloadJson,
  parseImport,
  slugifyFilename,
  type ExportedStep,
} from "@/lib/assessment-io";

export const Route = createFileRoute("/admin/editor")({
  head: () => ({
    meta: [
      { title: "Segment editor — Cold Read Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditorPage,
});

type SegmentType =
  | "audio"
  | "text"
  | "text_entry"
  | "warmup"
  | "question"
  | "scripted"
  | "improv";

type EntryField = { id: string; label: string };

type Segment = {
  id: string;
  org_id: string | null;
  assessment_id: string;
  sort_order: number;
  type: SegmentType;
  prompt_audio_path: string | null;
  script_text: string | null;
  countdown_seconds: number | null;
  is_active: boolean;
  cue_color: string;
  cue_label: string;
  override_card_color: string | null;
  override_text_color: string | null;
  entry_fields: EntryField[];
  created_at: string;
  updated_at: string;
};

const PALETTE = ["#3D5E4A", "#2B2B28", "#C44A18", "#F5F0E8"];

const ADD_OPTIONS: { key: SegmentType; label: string }[] = [
  { key: "text", label: "Text card" },
  { key: "text_entry", label: "Text response" },
  { key: "audio", label: "Prospect audio" },
  { key: "question", label: "Question" },
  { key: "scripted", label: "Scripted read" },
  { key: "improv", label: "Improv" },
];

function typeLabel(t: SegmentType): string {
  switch (t) {
    case "audio": return "Prospect audio";
    case "text": return "Text card";
    case "text_entry": return "Text response";
    case "warmup": return "Warm-up";
    case "question": return "Question";
    case "scripted": return "Scripted read";
    case "improv": return "Improv";
  }
}

function readableOn(bg: string): string {
  // Simple luminance check for #RRGGBB — returns parchment on dark, charcoal on light.
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#F5F0E8";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#2B2B28" : "#F5F0E8";
}

function normalizeSegment(row: Record<string, unknown>): Segment {
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
  return { ...(row as unknown as Segment), entry_fields };
}


function EditorPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);
        const rs = roles?.map((r) => r.role) ?? [];
        setIsSuperadmin(rs.includes("superadmin"));
        setIsAdmin(rs.includes("admin") || rs.includes("superadmin"));
      }
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setIsAdmin(false);
        setIsSuperadmin(false);
      }
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
            <em>Only admins can edit segments.</em>
          </p>
        </div>
      </main>
    );
  }

  return <EditorDashboard userId={session.user.id} isSuperadmin={isSuperadmin} />;
}

function EditorDashboard({
  userId,
  isSuperadmin,
}: {
  userId: string;
  isSuperadmin: boolean;
}) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [askCopied, setAskCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("themes")
      .select(
        "id, name, bg_color, card_color, text_color, accent_color, muted_color, is_preset, created_by",
      )
      .then(({ data }) => {
        if (alive) setThemes((data ?? []) as Theme[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    loadAdminOrgs({ userId, isSuperadmin })
      .then((list) => {
        setOrgs(list);
        setOrgId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load orgs"));
  }, [userId, isSuperadmin]);

  // Load assessments for selected org
  useEffect(() => {
    if (!orgId) {
      setAssessments(null);
      setAssessmentId(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
        .eq("org_id", orgId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });
      if (!alive) return;
      if (error) {
        setError(error.message);
        return;
      }
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

  const load = useCallback(async () => {
    if (!assessmentId) {
      setSegments([]);
      return;
    }
    const { data, error } = await supabase
      .from("segments")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("sort_order", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    const list = ((data as Record<string, unknown>[]) ?? []).map(normalizeSegment);
    setSegments(list);
    setSelectedId((prev) =>
      prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? null,
    );
  }, [assessmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(kind: SegmentType) {
    if (!orgId || !assessmentId) return;
    const nextOrder =
      (segments?.reduce((m, s) => Math.max(m, s.sort_order), 0) ?? 0) + 1;
    const defaults: Partial<Segment> = (() => {
      switch (kind) {
        case "audio":
          return { cue_color: "#2B2B28", cue_label: "Prospect audio" };
        case "text":
          return { cue_color: "#2B2B28", cue_label: "New title" };
        case "text_entry":
          return { cue_color: "#3D5E4A", cue_label: "Your response" };
        default:
          return { cue_color: "#3D5E4A", cue_label: "New segment" };
      }
    })();
    const { data, error } = await supabase
      .from("segments")
      .insert({
        org_id: orgId,
        assessment_id: assessmentId,
        sort_order: nextOrder,
        type: kind,
        cue_color: defaults.cue_color!,
        cue_label: defaults.cue_label!,
        is_active: true,
      })
      .select("*")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    const created = normalizeSegment(data as Record<string, unknown>);
    setSegments((prev) => [...(prev ?? []), created]);
    setSelectedId(created.id);
  }


  function handleExport() {
    if (!currentAssessment || !segments) return;
    const payload = buildExport(currentAssessment.name, segments);
    downloadJson(`${slugifyFilename(currentAssessment.name)}.json`, payload);
  }

  async function handleAsk() {
    try {
      await navigator.clipboard.writeText(AI_PRIMER);
      setAskCopied(true);
      setTimeout(() => setAskCopied(false), 2500);
    } catch {
      window.prompt("Copy the Cold Read primer:", AI_PRIMER);
    }
  }

  async function handleImportSteps(
    steps: ExportedStep[],
    mode: "replace" | "append",
  ): Promise<void> {
    if (!orgId || !assessmentId) throw new Error("Pick an assessment first.");
    if (mode === "replace") {
      const { error: delErr } = await supabase
        .from("segments")
        .delete()
        .eq("assessment_id", assessmentId);
      if (delErr) throw delErr;
    }
    const baseOrder =
      mode === "append"
        ? (segments?.reduce((m, s) => Math.max(m, s.sort_order), 0) ?? 0) + 1
        : 1;
    const rows = [...steps]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s, i) => ({
        org_id: orgId,
        assessment_id: assessmentId,
        sort_order: baseOrder + i,
        type: s.type,
        cue_color: s.cue_color,
        cue_label: s.cue_label,
        script_text: s.script_text,
        countdown_seconds: s.countdown_seconds,
        override_card_color: s.override_card_color,
        override_text_color: s.override_text_color,
        entry_fields: s.entry_fields,
        is_active: true,
        prompt_audio_path: null,
      }));
    if (rows.length) {
      const { error: insErr } = await supabase
        .from("segments")
        .insert(rows as never);
      if (insErr) throw insErr;
    }
    await load();
    const hasAudio = steps.some((s) => s.type === "audio");
    setNotice(
      hasAudio
        ? "Imported. Add your prompt audio to each call step in the editor."
        : "Imported.",
    );
    setTimeout(() => setNotice(null), 6000);
  }

  async function handleDropReorder(targetId: string) {
    if (!dragId || !segments || dragId === targetId) {
      setDragId(null);
      return;
    }
    const list = [...segments];
    const fromIdx = list.findIndex((s) => s.id === dragId);
    const toIdx = list.findIndex((s) => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDragId(null);
      return;
    }
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const renumbered = list.map((s, i) => ({ ...s, sort_order: i + 1 }));
    setSegments(renumbered);
    setDragId(null);
    // Persist
    const updates = renumbered.map((s) =>
      supabase.from("segments").update({ sort_order: s.sort_order }).eq("id", s.id),
    );
    const results = await Promise.all(updates);
    const errs = results.map((r) => r.error).filter(Boolean);
    if (errs.length) setError(errs[0]!.message);
  }

  const selected = useMemo(
    () => segments?.find((s) => s.id === selectedId) ?? null,
    [segments, selectedId],
  );

  const currentAssessment = useMemo(
    () => assessments?.find((a) => a.id === assessmentId) ?? null,
    [assessments, assessmentId],
  );

  const activeTheme = useMemo(
    () => themes?.find((t) => t.id === currentAssessment?.theme_id) ?? null,
    [themes, currentAssessment],
  );

  const activePalette = useMemo(
    () => (activeTheme ? themeSwatches(activeTheme) : []),
    [activeTheme],
  );

  function handleAssessmentChange(next: Assessment) {
    setAssessments((prev) =>
      (prev ?? []).map((a) => (a.id === next.id ? next : a)),
    );
  }

  function onSegmentSaved(updated: Segment) {
    setSegments((prev) =>
      (prev ?? []).map((s) => (s.id === updated.id ? updated : s)),
    );
  }

  function onSegmentDeleted(id: string) {
    setSegments((prev) => (prev ?? []).filter((s) => s.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  return (
    <main className="min-h-screen bg-parchment lg:pr-11">
      <div className="px-6 py-12">

        <div className="max-w-6xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — EDITOR
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleAsk}
              disabled={!assessmentId}
              className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-1.5 text-charcoal hover:border-primary hover:text-primary disabled:opacity-40"
              title="Copy a Cold Read primer to paste into Claude or ChatGPT"
            >
              {askCopied ? "Primer copied ✓" : "Ask Claude / GPT"}
            </button>
            <button
              onClick={handleExport}
              disabled={!segments || segments.length === 0}
              className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-1.5 text-charcoal hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Export JSON
            </button>
            <button
              onClick={() => setImportOpen(true)}
              disabled={!assessmentId}
              className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-1.5 text-charcoal hover:border-primary hover:text-primary disabled:opacity-40"
            >
              Import JSON
            </button>
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

        {orgs && orgs.length > 1 && (
          <div className="mt-4 flex items-center gap-3">
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
          </div>
        )}
        {orgs && orgs.length === 1 && (
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/55">
            Editing {orgs[0].name}
          </p>
        )}

        {assessments && orgId && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal/80">
              Assessment
            </span>
            <select
              value={assessmentId ?? ""}
              onChange={async (e) => {
                if (e.target.value !== "__new__") {
                  setAssessmentId(e.target.value);
                  return;
                }
                const name = window.prompt("New assessment name?")?.trim();
                // Reset select to previous value before doing async work
                e.target.value = assessmentId ?? "";
                if (!name) return;
                const baseSlug =
                  name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "") || "assessment";
                let slug = baseSlug;
                let n = 2;
                while ((assessments ?? []).some((a) => a.slug === slug)) {
                  slug = `${baseSlug}-${n++}`;
                }
                const { data, error: err } = await supabase
                  .from("assessments")
                  .insert({ org_id: orgId, name, slug, is_active: true })
                  .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
                  .single();
                if (err) {
                  setError(err.message);
                  return;
                }
                const created = data as Assessment;
                setAssessments((prev) => [...(prev ?? []), created]);
                setAssessmentId(created.id);
              }}
              className="bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 pr-6 font-mono text-base text-charcoal focus:outline-none"
            >
              {assessments.length === 0 && (
                <option value="" disabled>
                  No assessments yet
                </option>
              )}
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.is_active ? "" : "· archived"}
                </option>
              ))}
              <option value="__new__">+ New assessment…</option>
            </select>
          </div>
        )}




        {error && (
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-juniper">
            {notice}
          </p>
        )}


        <div className="mt-8 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8">
          <aside className="border border-charcoal/25 bg-parchment">
            <div className="border-b border-charcoal/20 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal">
              Segments
            </div>
            {segments === null ? (
              <p className="p-4 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
                Loading…
              </p>
            ) : segments.length === 0 ? (
              <p className="p-4 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
                No segments yet.
              </p>
            ) : (
              <ul>
                {segments.map((s) => (
                  <SegmentCard
                    key={s.id}
                    segment={s}
                    selected={selectedId === s.id}
                    dragging={dragId === s.id}
                    activePalette={activePalette}
                    onSelect={() => setSelectedId(s.id)}
                    onDragStart={() => setDragId(s.id)}
                    onDrop={() => handleDropReorder(s.id)}
                  />
                ))}
              </ul>
            )}
            <div className="p-4">
              <AddSegmentMenu onAdd={(k) => handleAdd(k)} />
            </div>
          </aside>

          <section className="min-w-0">
            {selected ? (
              <SegmentEditor
                key={selected.id}
                segment={selected}
                theme={activeTheme}
                titleFont={currentAssessment?.title_font ?? DEFAULT_TITLE_FONT}
                bodyFont={currentAssessment?.body_font ?? DEFAULT_BODY_FONT}
                onSaved={onSegmentSaved}
                onDeleted={onSegmentDeleted}
                onError={setError}
              />
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60">
                Select a segment.
              </p>
            )}
          </section>
        </div>
        </div>
      </div>
      {currentAssessment && (
        <PresentationPanel
          assessment={currentAssessment}
          onAssessmentChange={handleAssessmentChange}
        />
      )}
    </main>
  );
}

function SegmentEditor({
  segment,
  theme,
  titleFont,
  bodyFont,
  onSaved,
  onDeleted,
  onError,
}: {
  segment: Segment;
  theme: Theme | null;
  titleFont: string;
  bodyFont: string;
  onSaved: (s: Segment) => void;
  onDeleted: (id: string) => void;
  onError: (m: string) => void;
}) {
  const [type, setType] = useState<SegmentType>(segment.type);
  const [cueLabel, setCueLabel] = useState(segment.cue_label);
  const [cueColor, setCueColor] = useState(segment.cue_color);
  const [scriptText, setScriptText] = useState(segment.script_text ?? "");
  const [countdown, setCountdown] = useState<string>(
    segment.countdown_seconds != null ? String(segment.countdown_seconds) : "",
  );
  
  const [overrideCard, setOverrideCard] = useState<string | null>(
    segment.override_card_color,
  );
  const [overrideText, setOverrideText] = useState<string | null>(
    segment.override_text_color,
  );
  const [entryFields, setEntryFields] = useState<EntryField[]>(segment.entry_fields);
  const [saving, setSaving] = useState(false);

  const initial = useRef({
    type: segment.type,
    cueLabel: segment.cue_label,
    cueColor: segment.cue_color,
    scriptText: segment.script_text ?? "",
    countdown:
      segment.countdown_seconds != null ? String(segment.countdown_seconds) : "",
    overrideCard: segment.override_card_color,
    overrideText: segment.override_text_color,
    entryFieldsJson: JSON.stringify(segment.entry_fields),
  });

  const dirty =
    type !== initial.current.type ||
    cueLabel !== initial.current.cueLabel ||
    cueColor !== initial.current.cueColor ||
    scriptText !== initial.current.scriptText ||
    countdown !== initial.current.countdown ||
    overrideCard !== initial.current.overrideCard ||
    overrideText !== initial.current.overrideText ||
    JSON.stringify(entryFields) !== initial.current.entryFieldsJson;

  const isAudio = type === "audio";
  const isText = type === "text";
  const isTextEntry = type === "text_entry";
  const hasScript = type === "scripted" || isText || isTextEntry;
  const hasCountdown = true;
  const hasColor = !isAudio && !isText && !isTextEntry;

  function handleTypeChange(next: SegmentType) {
    setType(next);
    if (next === "improv" || next === "audio" || next === "text") setCountdown("");
  }

  async function handleSave() {
    setSaving(true);
    const parsedCountdown =
      countdown.trim() === "" ? null : Math.max(0, Math.floor(Number(countdown)));
    if (parsedCountdown !== null && Number.isNaN(parsedCountdown)) {
      onError("Countdown must be a number.");
      setSaving(false);
      return;
    }
    const payload = {
      type,
      cue_label: cueLabel.trim() || "Untitled",
      cue_color: isAudio ? "#2B2B28" : cueColor,
      script_text: hasScript ? scriptText : null,
      countdown_seconds: hasCountdown ? parsedCountdown : null,
      is_active: true,
      override_card_color: overrideCard,
      override_text_color: overrideText,
      entry_fields: isTextEntry
        ? entryFields
            .map((f) => ({ id: f.id, label: f.label.trim() }))
            .filter((f) => f.label.length > 0)
        : [],
    };
    const { data, error } = await supabase
      .from("segments")
      .update(payload)
      .eq("id", segment.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }
    const updated = normalizeSegment(data as Record<string, unknown>);
    initial.current = {
      type: updated.type,
      cueLabel: updated.cue_label,
      cueColor: updated.cue_color,
      scriptText: updated.script_text ?? "",
      countdown:
        updated.countdown_seconds != null ? String(updated.countdown_seconds) : "",
      
      overrideCard: updated.override_card_color,
      overrideText: updated.override_text_color,
      entryFieldsJson: JSON.stringify(updated.entry_fields),
    };
    setEntryFields(updated.entry_fields);
    onSaved(updated);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${segment.cue_label}"? This cannot be undone.`)) return;
    if (segment.prompt_audio_path) {
      await supabase.storage.from("prompts").remove([segment.prompt_audio_path]);
    }
    const { error } = await supabase.from("segments").delete().eq("id", segment.id);
    if (error) {
      onError(error.message);
      return;
    }
    onDeleted(segment.id);
  }

  return (
    <div className="border border-charcoal/25 bg-parchment p-6 md:p-8">
      <div className="flex items-baseline justify-between border-b border-charcoal/15 pb-4">
        <h2 className="font-display text-2xl text-charcoal">Edit segment</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/50">
          #{segment.sort_order} · {segment.id.slice(0, 8)}
        </span>
      </div>

      <div className="mt-6 grid gap-6">
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {ADD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleTypeChange(opt.key)}
                className={`font-mono text-[11px] uppercase tracking-[0.24em] px-3 py-2 border transition-colors ${
                  type === opt.key
                    ? "bg-charcoal text-parchment border-charcoal"
                    : "border-charcoal/30 text-charcoal hover:border-charcoal"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={
            isAudio
              ? "Admin label (internal only)"
              : isText || isTextEntry
                ? "Title"
                : "Cue label"
          }
        >
          <input
            value={cueLabel}
            onChange={(e) => setCueLabel(e.target.value)}
            placeholder={
              isAudio
                ? "e.g. Gatekeeper opener"
                : isText
                  ? "Slide title"
                  : isTextEntry
                    ? "Heading shown above the fields"
                    : ""
            }
            className="w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-serif text-lg text-charcoal focus:outline-none"
          />
          {isAudio && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55">
              Never shown to candidates.
            </p>
          )}
        </Field>

        {hasColor && (
          <Field label={isText ? "Background color" : "Cue color"}>
            <div className="flex items-center gap-3 flex-wrap">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setCueColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    cueColor.toLowerCase() === c.toLowerCase()
                      ? "border-charcoal scale-110"
                      : "border-charcoal/20"
                  }`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <input
                value={cueColor}
                onChange={(e) => setCueColor(e.target.value)}
                placeholder="#RRGGBB"
                className="ml-2 w-28 bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 font-mono text-sm text-charcoal focus:outline-none"
              />
              <span
                className="ml-2 inline-block h-6 w-6 border border-charcoal/20"
                style={{ background: cueColor }}
                aria-hidden
              />
            </div>
          </Field>
        )}

        {hasScript && (
          <Field
            label={
              isText ? "Body text" : isTextEntry ? "Context (optional)" : "Script text"
            }
          >
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              rows={isText ? 4 : 5}
              placeholder={
                isText
                  ? "Optional body text below the title"
                  : isTextEntry
                    ? "Optional instructions shown above the text box"
                    : ""
              }
              className="w-full bg-transparent border border-charcoal/25 focus:border-primary p-3 font-serif text-base text-charcoal focus:outline-none"
            />
          </Field>
        )}

        {isTextEntry && (
          <Field label="Fields">
            <EntryFieldsEditor value={entryFields} onChange={setEntryFields} />
          </Field>
        )}

        {isText && theme && (
          <Field label="Slide preview">
            <div
              className="w-full aspect-[16/9] flex flex-col items-center justify-center p-8 text-center overflow-hidden"
              style={{
                background: theme.bg_color ?? "#0C1A22",
                color: theme.text_color ?? "#EDF2EE",
              }}
            >
              <div
                className="uppercase leading-[0.95]"
                style={{
                  fontFamily: fontStack(titleFont, DEFAULT_TITLE_FONT),
                  fontWeight: 600,
                  fontSize: "clamp(1.5rem, 4vw, 3rem)",
                  letterSpacing: "0.02em",
                }}
              >
                {cueLabel || "Slide title"}
              </div>
              {scriptText.trim() && (
                <div
                  className="mt-4 max-w-[80%] leading-[1.3]"
                  style={{
                    fontFamily: fontStack(bodyFont, DEFAULT_BODY_FONT),
                    fontSize: "clamp(0.875rem, 1.4vw, 1.25rem)",
                  }}
                >
                  {scriptText}
                </div>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55">
              Candidates see this full-screen, then tap Continue.
            </p>
          </Field>
        )}

        {!isAudio && !isText && theme && (
          <ResponseStepPreview
            theme={theme}
            titleFont={titleFont}
            bodyFont={bodyFont}
            cueLabel={cueLabel}
            scriptText={scriptText}
            overrideCard={overrideCard}
            overrideText={overrideText}
            isTextEntry={isTextEntry}
            entryFields={entryFields}
          />
        )}

        {!isAudio && !isText && (
          <ColorsOverrideField
            theme={theme}
            overrideCard={overrideCard}
            overrideText={overrideText}
            onCard={setOverrideCard}
            onText={setOverrideText}
          />
        )}

        {hasCountdown && (
          <Field label="Countdown (seconds)">
            <input
              type="number"
              min={0}
              value={countdown}
              onChange={(e) => setCountdown(e.target.value)}
              className="w-32 bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-mono text-sm text-charcoal focus:outline-none"
            />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55">
              {isAudio
                ? "Optional cap — auto-advances after this many seconds even if audio is still playing."
                : isText
                  ? "Optional auto-advance — leave empty to require Continue tap."
                  : isTextEntry
                    ? "Optional writing timer — leave empty for no timer."
                    : "Leave empty for no timer."}
            </p>
          </Field>
        )}


        {isAudio && (
          <PromptAudioSection segment={segment} onSaved={onSaved} onError={onError} />
        )}

        <div className="flex items-center justify-between border-t border-charcoal/15 pt-6">
          <button
            onClick={handleDelete}
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-primary hover:underline"
          >
            Delete segment
          </button>
          <div className="flex items-center gap-4">
            {dirty && (
              <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
                ● Unsaved
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="font-mono text-xs uppercase tracking-[0.28em] bg-iron text-on-accent px-6 py-3 disabled:opacity-40 hover:bg-iron/90 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function PromptAudioSection({
  segment,
  onSaved,
  onError,
}: {
  segment: Segment;
  onSaved: (s: Segment) => void;
  onError: (m: string) => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const path = segment.prompt_audio_path;

  useEffect(() => {
    let alive = true;
    setSignedUrl(null);
    if (!path) return;
    supabase.storage
      .from("prompts")
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (alive) setSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  async function persistNewPath(newPath: string) {
    const { data, error } = await supabase
      .from("segments")
      .update({ prompt_audio_path: newPath })
      .eq("id", segment.id)
      .select("*")
      .single();
    if (error) {
      onError(error.message);
      return;
    }
    // Delete previous file if any
    if (segment.prompt_audio_path && segment.prompt_audio_path !== newPath) {
      await supabase.storage.from("prompts").remove([segment.prompt_audio_path]);
    }
    onSaved(normalizeSegment(data as Record<string, unknown>));
  }

  async function uploadBlob(blob: Blob, ext: string) {
    setBusy(true);
    const newPath = `${segment.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("prompts")
      .upload(newPath, blob, { contentType: blob.type || "audio/webm" });
    if (error) {
      setBusy(false);
      onError(error.message);
      return;
    }
    await persistNewPath(newPath);
    setBusy(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext =
      file.name.split(".").pop()?.toLowerCase() ||
      (file.type.includes("webm") ? "webm" : "mp3");
    await uploadBlob(file, ext);
    e.target.value = "";
  }

  async function handleRemove() {
    if (!path) return;
    if (!confirm("Remove prompt audio?")) return;
    setBusy(true);
    await supabase.storage.from("prompts").remove([path]);
    const { data, error } = await supabase
      .from("segments")
      .update({ prompt_audio_path: null })
      .eq("id", segment.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    onSaved(normalizeSegment(data as Record<string, unknown>));
  }

  return (
    <div className="border border-charcoal/30 bg-juniper/40 p-5">
      <div className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal mb-4">
        Prompt audio
      </div>
      {path ? (
        <div className="space-y-3">
          {signedUrl ? (
            <audio
              controls
              src={signedUrl}
              className="w-full [color-scheme:dark] rounded-sm"
            />
          ) : (
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-charcoal/80">
              Loading…
            </p>
          )}
          <div className="font-mono text-xs text-charcoal/70 break-all">{path}</div>
          <button
            onClick={handleRemove}
            disabled={busy}
            className="font-mono text-xs uppercase tracking-[0.24em] text-primary hover:underline disabled:opacity-40"
          >
            Remove audio
          </button>
        </div>
      ) : (
        <p className="font-mono text-sm text-charcoal/80">
          No audio yet — candidates will see the "audio pending" fallback.
        </p>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.24em] text-charcoal/80 mb-2">
            Upload file
          </div>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            disabled={busy}
            className="block w-full text-sm text-charcoal file:mr-3 file:border file:border-charcoal/40 file:bg-transparent file:px-3 file:py-2 file:font-mono file:text-xs file:uppercase file:tracking-[0.24em] file:text-charcoal hover:file:bg-charcoal/10 hover:file:border-charcoal"
          />
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.24em] text-charcoal/80 mb-2">
            Record in browser
          </div>
          <BrowserRecorder
            disabled={busy}
            onSave={(blob) => uploadBlob(blob, "webm")}
          />
        </div>
      </div>
    </div>
  );
}


function BrowserRecorder({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: (blob: Blob) => void | Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "recording" | "preview">("idle");
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      mic.release();
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setErr(null);
    try {
      const stream = await mic.acquire();
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setLevel(peak);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      let mimeType = "audio/webm;codecs=opus";
      if (
        typeof MediaRecorder !== "undefined" &&
        !MediaRecorder.isTypeSupported(mimeType)
      ) {
        mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      }
      chunksRef.current = [];
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        setBlob(b);
        const url = URL.createObjectURL(b);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setState("preview");
        cleanup();
      };
      rec.start();
      setState("recording");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Microphone unavailable");
      cleanup();
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setState("idle");
    setLevel(0);
  }

  async function save() {
    if (!blob) return;
    await onSave(blob);
    discard();
  }

  return (
    <div className="space-y-3">
      {state === "recording" && (
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-primary opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <div className="flex-1 h-2 bg-charcoal/10 overflow-hidden">
            <div
              className="h-full bg-iron transition-[width] duration-75 ease-linear"
              style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
            />
          </div>
        </div>
      )}
      {state === "preview" && previewUrl && (
        <audio controls src={previewUrl} className="w-full" />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" && (
          <button
            onClick={start}
            disabled={disabled}
            className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-2 text-charcoal hover:border-charcoal disabled:opacity-40"
          >
            ● Record
          </button>
        )}
        {state === "recording" && (
          <button
            onClick={stop}
            className="font-mono text-[11px] uppercase tracking-[0.24em] bg-primary text-on-accent px-3 py-2"
          >
            ■ Stop
          </button>
        )}
        {state === "preview" && (
          <>
            <button
              onClick={save}
              disabled={disabled}
              className="font-mono text-[11px] uppercase tracking-[0.24em] bg-iron text-on-accent px-3 py-2 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={discard}
              disabled={disabled}
              className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-2 text-charcoal"
            >
              Discard
            </button>
            <button
              onClick={() => {
                discard();
                void start();
              }}
              disabled={disabled}
              className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-2 text-charcoal"
            >
              Re-record
            </button>
          </>
        )}
      </div>
      {err && (
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
          {err}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ Sidebar cards ----------------------------- */

function SegmentCard({
  segment,
  selected,
  dragging,
  activePalette,
  onSelect,
  onDragStart,
  onDrop,
}: {
  segment: Segment;
  selected: boolean;
  dragging: boolean;
  activePalette: string[];
  onSelect: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const overrideOutOfPalette =
    (segment.override_card_color != null &&
      !inPalette(segment.override_card_color, activePalette)) ||
    (segment.override_text_color != null &&
      !inPalette(segment.override_text_color, activePalette));
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isAudio = segment.type === "audio";
  const path = segment.prompt_audio_path;

  useEffect(() => {
    let alive = true;
    setSignedUrl(null);
    if (!isAudio || !path) return;
    supabase.storage
      .from("prompts")
      .createSignedUrl(path, 60 * 10)
      .then(({ data }) => {
        if (alive) setSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [isAudio, path]);

  const commonProps = {
    draggable: true,
    onDragStart,
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop,
    onClick: onSelect,
    className: `cursor-pointer border-b border-charcoal/10 transition-colors ${
      dragging ? "opacity-40" : ""
    }`,
  };

  if (isAudio) {
    return (
      <li
        {...commonProps}
        className={`${commonProps.className} ${
          selected ? "ring-2 ring-inset ring-iron/70" : ""
        }`}
        style={{ background: "#12241E" }}
      >
        <div className="px-4 py-3 text-charcoal">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-mono text-xs uppercase tracking-[0.24em] font-semibold"
              style={{ color: "#8FCBB0" }}
            >
              ● Call
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-charcoal/80">
              Prospect audio
            </span>
            <span
              className="ml-auto font-mono text-xs uppercase tracking-[0.22em] font-semibold"
              style={{ color: path ? "#8FCBB0" : "#F0866E" }}
              title={path ? "Audio attached" : "No audio"}
            >
              {path ? "♪ audio" : "no audio"}
            </span>
          </div>
          <div className="mt-1.5 font-serif text-base leading-snug text-charcoal">
            {segment.cue_label}
          </div>
          {signedUrl && (
            <audio
              controls
              src={signedUrl}
              className="mt-2 w-full h-9 [color-scheme:dark]"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      </li>
    );
  }


  const isText = segment.type === "text";
  const isTextEntry = segment.type === "text_entry";

  if (isText) {
    const fg = readableOn(segment.cue_color);
    return (
      <li
        {...commonProps}
        className={`${commonProps.className} ${
          selected ? "ring-2 ring-inset ring-parchment/40" : ""
        }`}
        style={{ background: segment.cue_color, color: fg }}
      >
        <div className="px-4 py-3">
          <div className="flex items-center gap-2" style={{ opacity: 0.7 }}>
            <span className="font-mono text-[10px] uppercase tracking-[0.28em]">
              ▤ Slide
            </span>
          </div>
          <div className="mt-1 font-display uppercase text-sm tracking-wide truncate">
            {segment.cue_label || "Untitled slide"}
          </div>
          {segment.script_text && (
            <div className="mt-1 font-serif text-[11px] line-clamp-2" style={{ opacity: 0.85 }}>
              <em>{segment.script_text}</em>
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <li
      {...commonProps}
      className={`${commonProps.className} px-4 py-3 ${
        selected ? "bg-charcoal/[0.06]" : "hover:bg-charcoal/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: segment.cue_color }}
          aria-hidden
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/60">
          {isTextEntry ? "✎ Text response" : typeLabel(segment.type)}
        </span>
        {segment.countdown_seconds != null && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/60">
            {segment.countdown_seconds}s
          </span>
        )}
        {overrideOutOfPalette && (
          <span
            className={`${segment.countdown_seconds != null ? "ml-2" : "ml-auto"} inline-block h-2 w-2 rounded-full bg-primary`}
            title="Override color is outside the current theme palette"
            aria-label="Override color outside theme"
          />
        )}
      </div>
      <div className="mt-1 font-serif text-sm text-charcoal">
        {segment.cue_label}
      </div>
      {segment.script_text && (
        <div className="mt-1 font-mono text-[10px] text-charcoal/60 line-clamp-2">
          {segment.script_text}
        </div>
      )}
    </li>
  );
}

/* ------------------------------ Add step menu ----------------------------- */

function AddSegmentMenu({ onAdd }: { onAdd: (kind: SegmentType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full font-mono text-xs uppercase tracking-[0.28em] bg-iron text-on-accent px-4 py-3 hover:bg-iron/90 transition-colors"
      >
        + Add step
      </button>
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-2 border border-charcoal/25 bg-parchment shadow-lg z-10">
          {ADD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setOpen(false);
                onAdd(opt.key);
              }}
              className="w-full text-left px-4 py-3 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal hover:bg-charcoal/[0.06] border-b border-charcoal/10 last:border-b-0"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Response step preview + overrides --------------------------- */

function ResponseStepPreview({
  theme,
  titleFont,
  bodyFont,
  cueLabel,
  scriptText,
  overrideCard,
  overrideText,
  isTextEntry = false,
  entryFields = [],
}: {
  theme: Theme;
  titleFont: string;
  bodyFont: string;
  cueLabel: string;
  scriptText: string;
  overrideCard: string | null;
  overrideText: string | null;
  isTextEntry?: boolean;
  entryFields?: EntryField[];
}) {
  const bg = theme.bg_color ?? "#0C1A22";
  const card = overrideCard ?? theme.card_color ?? "#1B3A32";
  const text = overrideText ?? theme.text_color ?? "#EDF2EE";
  const accent = theme.accent_color ?? "#E8B84B";
  const muted = theme.muted_color ?? "#9DB0B2";
  const titleStack = fontStack(titleFont, DEFAULT_TITLE_FONT);
  const bodyStack = fontStack(bodyFont, DEFAULT_BODY_FONT);
  return (
    <Field label="Candidate preview">
      <div
        className="w-full p-6 flex flex-col items-center"
        style={{ background: bg, fontFamily: bodyStack }}
      >
        <div
          className="w-full max-w-md p-6 rounded-md"
          style={{ background: card, color: text }}
        >
          <div
            className="uppercase text-xs tracking-[0.28em] mb-3"
            style={{ fontFamily: titleStack, color: accent }}
          >
            {cueLabel || "Cue label"}
          </div>
          {scriptText.trim() && (
            <div
              className="text-base leading-relaxed"
              style={{ fontFamily: bodyStack, color: text }}
            >
              {scriptText}
            </div>
          )}
          {isTextEntry && (
            <div className="mt-5 space-y-4">
              {(entryFields.length > 0
                ? entryFields
                : [{ id: "_ph", label: "Field label" }]
              ).map((f) => (
                <div key={f.id}>
                  <div
                    className="text-[10px] uppercase tracking-[0.24em] mb-1"
                    style={{ fontFamily: bodyStack, color: muted }}
                  >
                    {f.label.trim() || "Field label"}
                  </div>
                  <div
                    className="h-8 border-b-2"
                    style={{ borderColor: muted }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Field>
  );
}

function ColorsOverrideField({
  theme,
  overrideCard,
  overrideText,
  onCard,
  onText,
}: {
  theme: Theme | null;
  overrideCard: string | null;
  overrideText: string | null;
  onCard: (c: string | null) => void;
  onText: (c: string | null) => void;
}) {
  if (!theme) {
    return (
      <Field label="Colors">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
          Loading theme…
        </p>
      </Field>
    );
  }
  const palette = themeSwatches(theme);
  const resolvedCard = overrideCard ?? theme.card_color ?? "#1B3A32";
  const resolvedText = overrideText ?? theme.text_color ?? "#EDF2EE";
  const ratio = contrastRatio(resolvedCard, resolvedText);
  const lowContrast = ratio != null && ratio < 4.5;

  return (
    <Field label="Colors">
      <div className="space-y-4">
        <ColorRow
          label="Card"
          palette={palette}
          value={overrideCard}
          inherited={theme.card_color ?? null}
          onChange={onCard}
        />
        <ColorRow
          label="Text"
          palette={palette}
          value={overrideText}
          inherited={theme.text_color ?? null}
          onChange={onText}
        />
        {lowContrast && (
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
            <span aria-hidden>⚠</span>
            Low contrast — {ratio!.toFixed(2)}:1 (WCAG AA needs 4.5:1)
          </p>
        )}
      </div>
    </Field>
  );
}

function ColorRow({
  label,
  palette,
  value,
  inherited,
  onChange,
}: {
  label: string;
  palette: string[];
  value: string | null;
  inherited: string | null;
  onChange: (c: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/70 w-12">
        {label}
      </span>
      <button
        onClick={() => onChange(null)}
        className={`px-2 py-1 border font-mono text-[10px] uppercase tracking-[0.24em] transition-colors ${
          value == null
            ? "border-charcoal bg-charcoal/[0.06] text-charcoal"
            : "border-charcoal/30 text-charcoal/70 hover:border-charcoal"
        }`}
        title={inherited ? `Inherit theme (${inherited})` : "Inherit theme"}
      >
        Inherit
      </button>
      {palette.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`h-7 w-7 border-2 transition-all ${
            value && eqColor(value, c)
              ? "border-charcoal scale-110"
              : "border-charcoal/20"
          }`}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function EntryFieldsEditor({
  value,
  onChange,
}: {
  value: EntryField[];
  onChange: (next: EntryField[]) => void;
}) {
  function newId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  useEffect(() => {
    if (value.length === 0) onChange([{ id: newId(), label: "" }]);
  }, [value, onChange]);

  function updateAt(idx: number, label: string) {
    onChange(value.map((f, i) => (i === idx ? { ...f, label } : f)));
  }
  function removeAt(idx: number) {
    if (value.length <= 1) return;
    onChange(value.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...value, { id: newId(), label: "" }]);
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {value.map((f, idx) => (
          <li
            key={f.id}
            className="flex items-center gap-2 border border-charcoal/25 bg-parchment px-3 py-2"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50 w-6 tabular-nums">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <input
              value={f.label}
              onChange={(e) => updateAt(idx, e.target.value)}
              placeholder="Field label (e.g. Name)"
              maxLength={128}
              className="flex-1 bg-transparent border-b border-charcoal/25 focus:border-primary py-1 font-serif text-base text-charcoal focus:outline-none"
            />
            <button
              onClick={() => removeAt(idx)}
              disabled={value.length <= 1}
              className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary hover:underline px-1 disabled:opacity-30 disabled:hover:no-underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={add}
        className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/40 text-charcoal px-3 py-2 hover:bg-charcoal/5"
      >
        + Add field
      </button>
    </div>
  );
}
