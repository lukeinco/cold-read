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
  onAssessmentChange: (a: Assessment) => void;
};

/**
 * Fixed-position, always-visible presentation panel (>=1024px).
 * Collapsed: 44px vertical strip of active theme swatches + expand chevron.
 * Expanded: ~25% width (min 300px) with swatch-only theme picker and font pickers.
 * Uses dark chrome so text is always readable on either state.
 */
export function PresentationPanel({ assessment, onAssessmentChange }: Props) {
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
  }, []);

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
      {/* Desktop (>=lg): fixed right rail, always present */}
      <aside
        className={`hidden lg:flex flex-col fixed right-0 top-0 h-screen z-40 bg-charcoal text-parchment shadow-[-2px_0_8px_rgba(0,0,0,0.25)] transition-[width] duration-200 ${
          open ? "w-[max(300px,25vw)]" : "w-11"
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
      <div className="lg:hidden -mt-4 mb-4 border border-charcoal bg-charcoal text-parchment">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3"
          aria-expanded={open}
        >
          <div className="flex items-center gap-1">
            {activeSwatches.map((c, i) => (
              <span
                key={i}
                className="h-4 w-4 border border-parchment/25"
                style={{ background: c }}
                aria-hidden
              />
            ))}
          </div>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.24em] text-parchment/80">
            {open ? "Hide" : "Theme"}
          </span>
        </button>
        {open && (
          <div className="border-t border-parchment/15 p-4">
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
      className="flex flex-col items-center justify-between py-3 h-full w-full hover:bg-parchment/[0.06] transition-colors"
    >
      <span className="text-parchment/70 text-sm leading-none">‹</span>
      <div className="flex flex-col items-center gap-1.5">
        {swatches.map((c, i) => (
          <span
            key={i}
            className="h-5 w-5 border border-parchment/25"
            style={{ background: c }}
            aria-hidden
          />
        ))}
      </div>
      <span aria-hidden className="w-2" />
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
        <div className="flex items-center justify-between border-b border-parchment/15 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-parchment">
            Presentation
          </span>
          <button
            onClick={onCollapse}
            className="font-mono text-lg leading-none text-parchment/80 hover:text-parchment"
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

      {/* THEME — swatches only, no names */}
      <section className="px-4 py-4 border-b border-parchment/10">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-parchment/70 mb-3">
          Theme
        </div>
        {themes === null ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-parchment/60">
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
                    aria-label={t.name}
                    title={t.name}
                    className={`w-full flex items-center gap-1 px-2 py-2 border transition-colors ${
                      active
                        ? "border-parchment bg-parchment/[0.08]"
                        : "border-transparent hover:border-parchment/25"
                    }`}
                  >
                    {themeSwatches(t).map((c, i) => (
                      <span
                        key={i}
                        className="h-6 flex-1 border border-parchment/20"
                        style={{ background: c }}
                        aria-hidden
                      />
                    ))}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* TITLE FONT */}
      <section className="px-4 py-4 border-b border-parchment/10">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-parchment/70 mb-3">
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
                      ? "border-parchment bg-parchment/[0.08]"
                      : "border-transparent hover:border-parchment/25"
                  }`}
                  style={{
                    fontFamily: f.stack,
                    fontWeight: f.displayWeight ?? 500,
                  }}
                >
                  <span className="text-xl text-parchment">{f.family}</span>
                  {active && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.24em] text-parchment/70 align-middle">
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
          className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-parchment/75 hover:text-primary underline underline-offset-4"
        >
          Same as body
        </button>
      </section>

      {/* BODY FONT */}
      <section className="px-4 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-parchment/70 mb-3">
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
                      ? "border-parchment bg-parchment/[0.08]"
                      : "border-transparent hover:border-parchment/25"
                  }`}
                  style={{ fontFamily: f.stack }}
                >
                  <span className="text-sm text-parchment">
                    The quick prospect answers on the first ring.
                  </span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-parchment/60">
                      {f.family}
                    </span>
                    {active && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-parchment/80">
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

/** Public: font family lookup used by the editor preview. */
export { fontStack };
