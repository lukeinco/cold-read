import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { HexColorPicker } from "react-colorful";
import { supabase } from "@/integrations/supabase/client";
import { type Theme, contrastRatio, themeSwatches } from "@/lib/themes";

export const Route = createFileRoute("/admin/themes")({
  head: () => ({
    meta: [
      { title: "Themes — Cold Read Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThemesPage,
});

function ThemesPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);
        setIsSuperadmin(!!roles?.some((r) => r.role === "superadmin"));
      }
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setIsSuperadmin(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checked && !session) navigate({ to: "/admin/login" });
  }, [checked, session, navigate]);

  if (!checked) return <main className="min-h-screen bg-parchment" />;
  if (!session) return null;

  if (!isSuperadmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-parchment px-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-4xl text-charcoal">Restricted</h1>
          <p className="mt-3 font-serif text-lg text-charcoal/85">
            <em>Only superadmins can manage themes.</em>
          </p>
        </div>
      </main>
    );
  }

  return <ThemesDashboard userId={session.user.id} />;
}

type Draft = {
  name: string;
  bg_color: string;
  card_color: string;
  text_color: string;
  accent_color: string;
  muted_color: string;
};

function toDraft(t: Theme | null): Draft {
  return {
    name: t?.name ?? "New theme",
    bg_color: t?.bg_color ?? "#0C1A22",
    card_color: t?.card_color ?? "#1B3A32",
    text_color: t?.text_color ?? "#EDF2EE",
    accent_color: t?.accent_color ?? "#E8B84B",
    muted_color: t?.muted_color ?? "#9DB0B2",
  };
}

function ThemesDashboard({ userId }: { userId: string }) {
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [assessmentsByTheme, setAssessmentsByTheme] = useState<
    Record<string, string[]>
  >({});

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("themes")
      .select(
        "id, name, bg_color, card_color, text_color, accent_color, muted_color, is_preset, created_by",
      )
      .order("is_preset", { ascending: false })
      .order("name", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setThemes((data ?? []) as Theme[]);

    const { data: as } = await supabase
      .from("assessments")
      .select("id, name, theme_id");
    const map: Record<string, string[]> = {};
    (as ?? []).forEach((a) => {
      if (!a.theme_id) return;
      map[a.theme_id] = map[a.theme_id] ?? [];
      map[a.theme_id].push(a.name);
    });
    setAssessmentsByTheme(map);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editingTheme = useMemo(
    () => themes?.find((t) => t.id === editingId) ?? null,
    [themes, editingId],
  );

  function startFromDuplicate(source: Theme) {
    const d = toDraft(source);
    d.name = `${source.name} copy`;
    setDraft(d);
    setEditingId(null); // new
  }

  function startEdit(t: Theme) {
    if (t.is_preset) return;
    setEditingId(t.id);
    setDraft(toDraft(t));
  }

  function closeBuilder() {
    setDraft(null);
    setEditingId(null);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: draft.name.trim() || "Untitled theme",
      bg_color: draft.bg_color,
      card_color: draft.card_color,
      text_color: draft.text_color,
      accent_color: draft.accent_color,
      muted_color: draft.muted_color,
      is_preset: false,
    };
    let result;
    if (editingId) {
      result = await supabase
        .from("themes")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .single();
    } else {
      result = await supabase
        .from("themes")
        .insert({ ...payload, created_by: userId })
        .select("*")
        .single();
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await load();
    setEditingId((result.data as Theme).id);
  }

  async function handleDelete(t: Theme) {
    if (t.is_preset) return;
    const uses = assessmentsByTheme[t.id] ?? [];
    if (uses.length > 0) {
      alert(
        `Cannot delete "${t.name}" — in use by ${uses.length} assessment${
          uses.length === 1 ? "" : "s"
        }: ${uses.join(", ")}`,
      );
      return;
    }
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("themes").delete().eq("id", t.id);
    if (error) {
      setError(error.message);
      return;
    }
    if (editingId === t.id) closeBuilder();
    await load();
  }

  const presets = (themes ?? []).filter((t) => t.is_preset);
  const custom = (themes ?? []).filter((t) => !t.is_preset);

  return (
    <main className="min-h-screen bg-parchment px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-baseline justify-between border-b-2 border-charcoal/20 pb-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-wide text-charcoal leading-none">
            COLD READ — THEMES
          </h1>
          <div className="flex items-center gap-6">
            <Link
              to="/admin"
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              ← Admin
            </Link>
            <Link
              to="/admin/codes"
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              Codes
            </Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.24em] text-primary">
            {error}
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
          <aside className="border border-charcoal/25 bg-parchment">
            <div className="border-b border-charcoal/20 px-4 py-3 flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal">
                Themes
              </span>
              <button
                onClick={() =>
                  startFromDuplicate(
                    presets.find((p) => p.name === "Cannery Dusk") ?? presets[0],
                  )
                }
                disabled={presets.length === 0}
                className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary hover:underline disabled:opacity-40"
              >
                + New
              </button>
            </div>

            <ThemeGroup
              label="Presets · locked"
              themes={presets}
              editingId={editingId}
              usage={assessmentsByTheme}
              onView={(t) => {
                setEditingId(null);
                setDraft(toDraft(t));
              }}
              onDuplicate={startFromDuplicate}
              onEdit={null}
              onDelete={null}
            />
            <ThemeGroup
              label="Custom"
              themes={custom}
              editingId={editingId}
              usage={assessmentsByTheme}
              onView={(t) => startEdit(t)}
              onDuplicate={startFromDuplicate}
              onEdit={startEdit}
              onDelete={handleDelete}
              emptyLabel="No custom themes yet."
            />
          </aside>

          <section className="min-w-0">
            {draft ? (
              <Builder
                key={editingId ?? "new"}
                draft={draft}
                onDraftChange={setDraft}
                editing={editingTheme}
                saving={saving}
                onSave={handleSave}
                onCancel={closeBuilder}
              />
            ) : (
              <div className="border border-charcoal/25 bg-parchment p-8 text-center">
                <p className="font-serif text-lg text-charcoal/80">
                  Select a theme to view, or start a new one from a duplicate.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function ThemeGroup({
  label,
  themes,
  editingId,
  usage,
  onView,
  onDuplicate,
  onEdit,
  onDelete,
  emptyLabel,
}: {
  label: string;
  themes: Theme[];
  editingId: string | null;
  usage: Record<string, string[]>;
  onView: (t: Theme) => void;
  onDuplicate: (t: Theme) => void;
  onEdit: ((t: Theme) => void) | null;
  onDelete: ((t: Theme) => void) | null;
  emptyLabel?: string;
}) {
  return (
    <div>
      <div className="px-4 pt-4 pb-1 font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/60">
        {label}
      </div>
      {themes.length === 0 ? (
        <p className="px-4 pb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
          {emptyLabel ?? "None"}
        </p>
      ) : (
        <ul>
          {themes.map((t) => {
            const uses = usage[t.id]?.length ?? 0;
            const active = editingId === t.id;
            return (
              <li
                key={t.id}
                className={`border-b border-charcoal/10 last:border-b-0 ${
                  active ? "bg-charcoal/[0.05]" : ""
                }`}
              >
                <button
                  onClick={() => onView(t)}
                  className="w-full text-left px-4 py-3 hover:bg-charcoal/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm text-charcoal truncate flex-1">
                      {t.name}
                    </span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      {themeSwatches(t).map((c, i) => (
                        <span
                          key={i}
                          className="h-4 w-4 border border-charcoal/15"
                          style={{ background: c }}
                          aria-hidden
                        />
                      ))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55">
                    <span>{uses} in use</span>
                  </div>
                </button>
                <div className="px-4 pb-3 flex items-center gap-4">
                  <button
                    onClick={() => onDuplicate(t)}
                    className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
                  >
                    Duplicate
                  </button>
                  {onEdit && (
                    <button
                      onClick={() => onEdit(t)}
                      className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(t)}
                      className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Builder({
  draft,
  onDraftChange,
  editing,
  saving,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onDraftChange: (d: Draft) => void;
  editing: Theme | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const readOnly = editing?.is_preset ?? false;

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  const pairs = [
    { label: "Text on card", a: draft.text_color, b: draft.card_color },
    { label: "Text on bg", a: draft.text_color, b: draft.bg_color },
    { label: "Accent on bg", a: draft.accent_color, b: draft.bg_color },
  ];

  return (
    <div className="border border-charcoal/25 bg-parchment p-6 md:p-8">
      <div className="flex items-baseline justify-between border-b border-charcoal/15 pb-4">
        <h2 className="font-display text-2xl text-charcoal">
          {readOnly ? "View preset" : editing ? "Edit theme" : "New theme"}
        </h2>
        <div className="flex items-center gap-4">
          {readOnly && (
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/55">
              Preset · view only
            </span>
          )}
          <button
            onClick={onCancel}
            className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-5">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70 mb-2">
              Name
            </div>
            <input
              value={draft.name}
              onChange={(e) => setField("name", e.target.value)}
              readOnly={readOnly}
              className="w-full bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-2 font-serif text-lg text-charcoal focus:outline-none disabled:opacity-60"
            />
          </div>

          <TokenRow
            label="Background"
            hint="Page background — behind cards."
            value={draft.bg_color}
            onChange={(v) => setField("bg_color", v)}
            readOnly={readOnly}
          />
          <TokenRow
            label="Card"
            hint="Prompt card surface."
            value={draft.card_color}
            onChange={(v) => setField("card_color", v)}
            readOnly={readOnly}
          />
          <TokenRow
            label="Text"
            hint="Primary reading color."
            value={draft.text_color}
            onChange={(v) => setField("text_color", v)}
            readOnly={readOnly}
          />
          <TokenRow
            label="Accent"
            hint="Countdown numeral, timer bar, badges."
            value={draft.accent_color}
            onChange={(v) => setField("accent_color", v)}
            readOnly={readOnly}
          />
          <TokenRow
            label="Muted"
            hint="Secondary labels and dividers."
            value={draft.muted_color}
            onChange={(v) => setField("muted_color", v)}
            readOnly={readOnly}
          />

          <div className="border-t border-charcoal/15 pt-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70 mb-3">
              Readability
            </div>
            <ul className="space-y-1.5">
              {pairs.map((p) => {
                const ratio = contrastRatio(p.a, p.b);
                const passes = ratio != null && ratio >= 4.5;
                return (
                  <li
                    key={p.label}
                    className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em]"
                  >
                    <span className="flex items-center gap-1">
                      <span
                        className="h-4 w-4 border border-charcoal/20"
                        style={{ background: p.b }}
                      />
                      <span
                        className="h-4 w-4 border border-charcoal/20 -ml-2"
                        style={{ background: p.a }}
                      />
                    </span>
                    <span className="flex-1 text-charcoal/75">{p.label}</span>
                    <span className="text-charcoal">
                      {ratio != null ? `${ratio.toFixed(2)}:1` : "—"}
                    </span>
                    <span
                      className={
                        passes ? "text-iron" : "text-primary"
                      }
                    >
                      {passes ? "✓ Pass" : "⚠ Fail"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
              WCAG AA needs 4.5:1 for body text. Failures don't block save.
            </p>
          </div>

          {!readOnly && (
            <div className="flex items-center justify-end gap-4 border-t border-charcoal/15 pt-4">
              <button
                onClick={onCancel}
                className="font-mono text-xs uppercase tracking-[0.28em] text-charcoal/70 hover:text-primary"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="font-mono text-xs uppercase tracking-[0.28em] bg-iron text-on-accent px-6 py-3 disabled:opacity-40 hover:bg-iron/90 transition-colors"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create theme"}
              </button>
            </div>
          )}
        </div>

        <MiniPreview draft={draft} />
      </div>
    </div>
  );
}

function TokenRow({
  label,
  hint,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);

  function commitHex(v: string) {
    const trimmed = v.trim();
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (/^#[0-9a-f]{6}$/i.test(withHash)) onChange(withHash);
    else onChange(trimmed); // keep partial text so user can keep typing
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
          {label}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
          {hint}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => !readOnly && setOpen((v) => !v)}
          className="h-9 w-14 border-2 border-charcoal/25 disabled:opacity-70"
          style={{ background: value }}
          disabled={readOnly}
          aria-label={`${label} swatch — open picker`}
        />
        <input
          value={value}
          onChange={(e) => commitHex(e.target.value)}
          readOnly={readOnly}
          placeholder="#RRGGBB"
          className="w-32 bg-transparent border-b-2 border-charcoal/40 focus:border-primary py-1 font-mono text-sm text-charcoal focus:outline-none disabled:opacity-60"
        />
        {!readOnly && open && (
          <div className="w-full">
            <div className="inline-block p-3 border border-charcoal/25 bg-parchment">
              <HexColorPicker
                color={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
                onChange={onChange}
              />
              <div className="mt-2 text-right">
                <button
                  onClick={() => setOpen(false)}
                  className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniPreview({ draft }: { draft: Draft }) {
  return (
    <div className="space-y-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal/70">
        Live preview
      </div>

      {/* Call screen */}
      <div
        className="rounded-md p-6 flex flex-col items-center justify-center min-h-40"
        style={{ background: draft.bg_color, color: draft.text_color }}
      >
        <div
          className="font-mono text-[10px] uppercase tracking-[0.28em] mb-2 flex items-center gap-2"
          style={{ color: draft.accent_color }}
        >
          <span className="relative inline-flex h-2 w-2">
            <span
              className="absolute inset-0 rounded-full opacity-70 animate-ping"
              style={{ background: draft.accent_color }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: draft.accent_color }}
            />
          </span>
          Call in progress
        </div>
        <div
          className="font-mono text-3xl tabular-nums"
          style={{ color: draft.text_color }}
        >
          0:14
        </div>
        <div
          className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em]"
          style={{ color: draft.muted_color }}
        >
          Prospect audio
        </div>
      </div>

      {/* Script card */}
      <div
        className="rounded-md p-5"
        style={{ background: draft.bg_color }}
      >
        <div
          className="rounded-md p-4"
          style={{ background: draft.card_color, color: draft.text_color }}
        >
          <div
            className="font-mono text-[10px] uppercase tracking-[0.28em] mb-2"
            style={{ color: draft.accent_color }}
          >
            Scripted read
          </div>
          <p
            className="text-base leading-relaxed"
            style={{ color: draft.text_color }}
          >
            "Thanks for taking my call — I know you weren't expecting it.
            I'll be quick."
          </p>
          <div className="mt-4">
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: draft.muted_color, opacity: 0.35 }}
            >
              <div
                className="h-full"
                style={{ background: draft.accent_color, width: "62%" }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.24em]"
                style={{ color: draft.muted_color }}
              >
                Time remaining
              </span>
              <span
                className="font-mono text-lg tabular-nums"
                style={{ color: draft.accent_color }}
              >
                0:23
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
