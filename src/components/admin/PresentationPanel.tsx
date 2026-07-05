import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Assessment } from "@/lib/org-queries";
import {
  BODY_FONTS,
  DEFAULT_BODY_FONT,
  DEFAULT_TITLE_FONT,
  TITLE_FONTS,
  fontStack,
} from "@/config/fonts";
import { type Theme, themeSwatches } from "@/lib/themes";

type Props = {
  assessment: Assessment;
  orgId: string;
  onAssessmentChange: (a: Assessment) => void;
};

export function PresentationPanel({ assessment, orgId, onAssessmentChange }: Props) {
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("themes")
        .select(
          "id, name, bg_color, card_color, text_color, accent_color, muted_color, is_preset, created_by",
        )
        .order("is_preset", { ascending: false })
        .order("name", { ascending: true });
      if (!alive) return;
      if (error) {
        setError(error.message);
        return;
      }
      setThemes((data ?? []) as Theme[]);
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  const activeTheme = useMemo(
    () => themes?.find((t) => t.id === assessment.theme_id) ?? null,
    [themes, assessment.theme_id],
  );

  const activeSwatches = activeTheme ? themeSwatches(activeTheme) : [];

  const titleFont = assessment.title_font ?? DEFAULT_TITLE_FONT;
  const bodyFont = assessment.body_font ?? DEFAULT_BODY_FONT;

  async function updateAssessment(patch: Partial<Assessment>) {
    const optimistic = { ...assessment, ...patch };
    onAssessmentChange(optimistic);
    const { data, error } = await supabase
      .from("assessments")
      .update(patch)
      .eq("id", assessment.id)
      .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    onAssessmentChange(data as Assessment);
  }

  return (
    <>
      {/* Desktop (>=lg): right-docked, expands the sidebar width */}
      <aside
        className={`hidden lg:flex flex-col border-l-2 border-charcoal/20 bg-parchment sticky top-0 self-start h-screen shrink-0 transition-[width] duration-200 overflow-hidden ${
          open ? "w-[max(300px,25vw)]" : "w-12"
        }`}
      >
        {open ? (
          <ExpandedPanel
            activeTheme={activeTheme}
            themes={themes}
            titleFont={titleFont}
            bodyFont={bodyFont}
            updateAssessment={updateAssessment}
            onCollapse={() => setOpen(false)}
            error={error}
          />
        ) : (
          <CollapsedRail
            swatches={activeSwatches}
            onExpand={() => setOpen(true)}
          />
        )}
      </aside>

      {/* Mobile (<lg): full-width bar, expands downward */}
      <div className="lg:hidden -mt-4 mb-4 border border-charcoal/25 bg-parchment">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3"
          aria-expanded={open}
        >
          <PaletteIcon />
          <div className="flex items-center gap-1.5">
            {activeSwatches.map((c, i) => (
              <span
                key={i}
                className="h-4 w-4 border border-charcoal/20"
                style={{ background: c }}
                aria-hidden
              />
            ))}
          </div>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/60">
            {activeTheme?.name ?? "Theme"} · {open ? "Hide" : "Edit"}
          </span>
        </button>
        {open && (
          <div className="border-t border-charcoal/15 p-4">
            <ExpandedPanel
              activeTheme={activeTheme}
              themes={themes}
              titleFont={titleFont}
              bodyFont={bodyFont}
              updateAssessment={updateAssessment}
              onCollapse={() => setOpen(false)}
              error={error}
              compact
            />
          </div>
        )}
      </div>
    </>
  );
}

function CollapsedRail({
  swatches,
  onExpand,
}: {
  swatches: string[];
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      aria-label="Open presentation panel"
      className="flex flex-col items-center gap-3 py-4 hover:bg-charcoal/[0.04] h-full w-full"
    >
      <PaletteIcon />
      <div className="flex flex-col items-center gap-1.5">
        {swatches.map((c, i) => (
          <span
            key={i}
            className="h-5 w-5 border border-charcoal/20"
            style={{ background: c }}
            aria-hidden
          />
        ))}
      </div>
      <TypeIcon />
    </button>
  );
}

function ExpandedPanel({
  activeTheme,
  themes,
  titleFont,
  bodyFont,
  updateAssessment,
  onCollapse,
  error,
  compact,
}: {
  activeTheme: Theme | null;
  themes: Theme[] | null;
  titleFont: string;
  bodyFont: string;
  updateAssessment: (patch: Partial<Assessment>) => void;
  onCollapse: () => void;
  error: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col overflow-y-auto ${compact ? "" : "h-full"}`}>
      {!compact && (
        <div className="flex items-center justify-between border-b border-charcoal/15 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-charcoal">
            Presentation
          </span>
          <button
            onClick={onCollapse}
            className="font-mono text-lg leading-none text-charcoal/70 hover:text-charcoal"
            aria-label="Collapse"
          >
            ›
          </button>
        </div>
      )}

      {error && (
        <p className="px-4 pt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
          {error}
        </p>
      )}

      {/* THEME */}
      <section className="px-4 py-4 border-b border-charcoal/10">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/70 mb-3">
          Theme
        </div>
        {themes === null ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/50">
            Loading…
          </p>
        ) : (
          <ul className="space-y-1.5">
            {themes.map((t) => {
              const active = t.id === activeTheme?.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => updateAssessment({ theme_id: t.id })}
                    className={`w-full flex items-center gap-2 px-2 py-2 border transition-colors text-left ${
                      active
                        ? "border-charcoal bg-charcoal/[0.05]"
                        : "border-transparent hover:border-charcoal/20"
                    }`}
                  >
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.24em] flex-1 truncate ${
                        active ? "text-charcoal" : "text-charcoal/75"
                      }`}
                    >
                      {active ? "● " : "  "}
                      {t.name}
                      {!t.is_preset && (
                        <span className="ml-1 text-charcoal/45">· custom</span>
                      )}
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
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* TITLE FONT */}
      <section className="px-4 py-4 border-b border-charcoal/10">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/70 mb-3">
          Title font
        </div>
        <ul className="space-y-1">
          {TITLE_FONTS.map((f) => {
            const active = titleFont === f.family;
            return (
              <li key={f.family}>
                <button
                  onClick={() => updateAssessment({ title_font: f.family })}
                  className={`w-full text-left px-2 py-2 border transition-colors ${
                    active
                      ? "border-charcoal bg-charcoal/[0.05]"
                      : "border-transparent hover:border-charcoal/20"
                  }`}
                  style={{
                    fontFamily: f.stack,
                    fontWeight: f.displayWeight ?? 500,
                  }}
                >
                  <span className="text-xl text-charcoal">{f.family}</span>
                  {active && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/60 align-middle">
                      ● active
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          onClick={() => updateAssessment({ title_font: bodyFont })}
          className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-charcoal/70 hover:text-primary underline underline-offset-4"
        >
          Same as body
        </button>
      </section>

      {/* BODY FONT */}
      <section className="px-4 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-charcoal/70 mb-3">
          Body font
        </div>
        <ul className="space-y-1">
          {BODY_FONTS.map((f) => {
            const active = bodyFont === f.family;
            return (
              <li key={f.family}>
                <button
                  onClick={() => updateAssessment({ body_font: f.family })}
                  className={`w-full text-left px-2 py-2 border transition-colors ${
                    active
                      ? "border-charcoal bg-charcoal/[0.05]"
                      : "border-transparent hover:border-charcoal/20"
                  }`}
                  style={{ fontFamily: f.stack }}
                >
                  <span className="text-sm text-charcoal">
                    The quick prospect answers on the first ring.
                  </span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-charcoal/50">
                      {f.family}
                    </span>
                    {active && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-charcoal/70">
                        ● active
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PaletteIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="text-charcoal/70"
      aria-hidden
    >
      <path d="M12 3a9 9 0 100 18 3 3 0 003-3v-1a2 2 0 012-2h1a3 3 0 003-3 9 9 0 00-9-9z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <span className="font-serif text-lg text-charcoal/70 leading-none">Aa</span>
  );
}

/** Public: font family lookup used by the editor preview. */
export { fontStack };
