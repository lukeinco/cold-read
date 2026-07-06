import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  loadAdminOrgs,
  slugify,
  type Org,
  type Assessment,
} from "@/lib/org-queries";


export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin — Cold Read" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminHub,
});

type OrgAssessments = { org: Org; assessments: Assessment[]; counts: Record<string, number> };

function AdminHub() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [data, setData] = useState<OrgAssessments[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);
        const superAdmin = !!roles?.some((r) => r.role === "superadmin");
        setIsSuperadmin(superAdmin);
        try {
          const list = await loadAdminOrgs({
            userId: data.session.user.id,
            isSuperadmin: superAdmin,
          });
          setOrgs(list);
        } catch (e) {
          console.error("loadAdminOrgs", e);
          setOrgs([]);
        }
      }
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setIsSuperadmin(false);
        setOrgs(null);
        setData(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checked && !session) navigate({ to: "/admin/login" });
  }, [checked, session, navigate]);

  // Load assessments + step counts for each org
  useEffect(() => {
    if (!orgs) return;
    let alive = true;
    (async () => {
      try {
        const results: OrgAssessments[] = [];
        for (const org of orgs) {
          const { data: aRows, error: aErr } = await supabase
            .from("assessments")
            .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
            .eq("org_id", org.id)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: true });
          if (aErr) throw aErr;
          const assessments = (aRows ?? []) as Assessment[];
          const counts: Record<string, number> = {};
          if (assessments.length) {
            const { data: segs, error: sErr } = await supabase
              .from("segments")
              .select("assessment_id")
              .in("assessment_id", assessments.map((a) => a.id));
            if (sErr) throw sErr;
            for (const a of assessments) counts[a.id] = 0;
            for (const s of (segs ?? []) as Array<{ assessment_id: string }>) {
              counts[s.assessment_id] = (counts[s.assessment_id] ?? 0) + 1;
            }
          }
          results.push({ org, assessments, counts });
        }
        if (alive) setData(results);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't load assessments");
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgs, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  if (!checked) return <main className="min-h-screen bg-parchment" />;
  if (!session) return null;

  const links: Array<{ to: string; label: string; desc: string }> = [
    { to: "/admin/review", label: "Review", desc: "Listen to submitted screenings" },
    { to: "/admin/editor", label: "Editor", desc: "Manage segments & prompts" },
  ];
  if (isSuperadmin) {
    links.push({ to: "/admin/codes", label: "Invite codes", desc: "Generate & revoke admin invites" });
    links.push({ to: "/admin/themes", label: "Themes", desc: "Build custom themes for every org" });
  }

  return (
    <main className="min-h-screen bg-parchment px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — ADMIN
          </h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
          >
            Sign out
          </button>
        </header>

        {error && (
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-primary">
            {error}
          </p>
        )}

        <div className="mt-8">
          {data === null ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/55">
              Loading…
            </p>
          ) : data.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/55">
              No orgs yet.
            </p>
          ) : (
            <div className="space-y-8">
              {data.map((row) => (
                <OrgAssessmentsBlock
                  key={row.org.id}
                  org={row.org}
                  assessments={row.assessments}
                  counts={row.counts}
                  onChange={refresh}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </div>


        <ul className="mt-12 divide-y divide-charcoal/15 border-y border-charcoal/15">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="group flex items-baseline justify-between py-6 hover:bg-charcoal/[0.03] px-2 -mx-2 transition-colors"
              >
                <span className="font-display text-2xl text-charcoal">{l.label}</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/60 group-hover:text-primary">
                  {l.desc} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function OrgAssessmentsBlock({
  org,
  assessments,
  counts,
  onChange,
  onError,
}: {
  org: Org;
  assessments: Assessment[];
  counts: Record<string, number>;
  onChange: () => void;
  onError: (msg: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let n = 2;
    while (assessments.some((a) => a.slug === slug)) {
      slug = `${baseSlug}-${n++}`;
    }
    const { error } = await supabase
      .from("assessments")
      .insert({ org_id: org.id, name, slug, is_active: true });
    if (error) {
      onError(error.message);
      return;
    }
    setCreating(false);
    setNewName("");
    onChange();
  }

  return (
    <section className="border border-charcoal/25 bg-parchment">
      <header className="flex items-center justify-between border-b border-charcoal/20 px-5 py-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal">
          {org.name}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
            {assessments.length} assessment{assessments.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => setCreating((v) => !v)}
            className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-1.5 text-charcoal hover:border-charcoal"
          >
            {creating ? "Cancel" : "+ Add new assessment"}
          </button>
        </div>
      </header>

      {creating && (
        <div className="border-b border-charcoal/15 px-5 py-4 flex items-center gap-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Assessment name (e.g. Account Exec Screen)"
            className="flex-1 bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 font-serif text-base text-charcoal focus:outline-none"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={!newName.trim()}
            className="font-mono text-[11px] uppercase tracking-[0.24em] bg-iron text-on-accent px-4 py-2 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      )}

      {assessments.length === 0 ? (
        <p className="p-5 font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/55">
          No assessments yet.
        </p>
      ) : (
        <ul className="divide-y divide-charcoal/15">
          {assessments.map((a) => (
            <AssessmentRow
              key={a.id}
              org={org}
              assessment={a}
              siblings={assessments}
              stepCount={counts[a.id] ?? 0}
              onChange={onChange}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AssessmentRow({
  org,
  assessment,
  siblings,
  stepCount,
  onChange,
  onError,
}: {
  org: Org;
  assessment: Assessment;
  siblings: Assessment[];
  stepCount: number;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nextName, setNextName] = useState(assessment.name);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const url = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/app/${org.slug}/${assessment.slug}`;
  }, [org.slug, assessment.slug]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy screening link", url);
    }
  }

  async function handleRename() {
    const name = nextName.trim();
    if (!name || name === assessment.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("assessments")
      .update({ name })
      .eq("id", assessment.id);
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRenaming(false);
    onChange();
  }

  async function handleArchiveToggle() {
    setBusy(true);
    const { error } = await supabase
      .from("assessments")
      .update({ is_active: !assessment.is_active })
      .eq("id", assessment.id);
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    onChange();
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const baseSlug = `${assessment.slug}-copy`;
      let slug = baseSlug;
      let n = 2;
      while (siblings.some((a) => a.slug === slug)) {
        slug = `${baseSlug}-${n++}`;
      }
      const { data: created, error: cErr } = await supabase
        .from("assessments")
        .insert({
          org_id: org.id,
          name: `${assessment.name} (copy)`,
          slug,
          is_active: false,
          theme_id: assessment.theme_id,
          title_font: assessment.title_font,
          body_font: assessment.body_font,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      const newId = (created as { id: string }).id;

      const { data: segs, error: sErr } = await supabase
        .from("segments")
        .select("*")
        .eq("assessment_id", assessment.id)
        .order("sort_order", { ascending: true });
      if (sErr) throw sErr;
      const rows = (segs ?? []) as Array<Record<string, unknown>>;
      if (rows.length) {
        const cleaned = rows.map((r) => ({
          org_id: org.id,
          assessment_id: newId,
          sort_order: r.sort_order,
          type: r.type,
          prompt_audio_path: r.prompt_audio_path,
          script_text: r.script_text,
          countdown_seconds: r.countdown_seconds,
          is_active: r.is_active,
          cue_color: r.cue_color,
          cue_label: r.cue_label,
        }));
        // Type assertion — Supabase types don't accept dynamic array via TS.
        const { error: iErr } = await supabase
          .from("segments")
          .insert(cleaned as never);
        if (iErr) throw iErr;
      }
      onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename();
                if (e.key === "Escape") {
                  setNextName(assessment.name);
                  setRenaming(false);
                }
              }}
              onBlur={() => void handleRename()}
              className="w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 font-serif text-lg text-charcoal focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setNextName(assessment.name);
                setRenaming(true);
              }}
              className="text-left font-serif text-lg text-charcoal hover:text-primary"
            >
              {assessment.name}
            </button>
          )}
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55 truncate">
            /{assessment.slug} · {stepCount} step{stepCount === 1 ? "" : "s"}
            {!assessment.is_active && " · archived"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopy}
            className="font-mono text-[11px] uppercase tracking-[0.24em] bg-iron text-on-accent px-3 py-2 hover:bg-iron/90"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button
            onClick={() => void handleDuplicate()}
            disabled={busy}
            className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-2 text-charcoal hover:border-charcoal disabled:opacity-40"
          >
            Duplicate
          </button>
          <button
            onClick={() => void handleArchiveToggle()}
            disabled={busy}
            className="font-mono text-[11px] uppercase tracking-[0.24em] border border-charcoal/30 px-3 py-2 text-charcoal hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {assessment.is_active ? "Archive" : "Restore"}
          </button>
        </div>
      </div>
    </li>
  );
}
