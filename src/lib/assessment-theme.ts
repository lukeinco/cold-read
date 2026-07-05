import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Org, Assessment } from "@/lib/org-queries";
import type { Theme } from "@/lib/themes";
import {
  DEFAULT_BODY_FONT,
  DEFAULT_TITLE_FONT,
  fontStack,
  googleFontsHref,
} from "@/config/fonts";

/** Fallback tokens (Cannery Dusk) used when an assessment has no theme row. */
export const DEFAULT_THEME_TOKENS = {
  bg: "#0C1A22",
  card: "#1B3A32",
  text: "#EDF2EE",
  accent: "#E8B84B",
  muted: "#9DB0B2",
} as const;

export type ThemedAssessment = {
  org: Org;
  assessment: Assessment;
  theme: Theme | null;
};

export function themedAssessmentQueryOptions(orgSlug: string, assessmentSlug: string) {
  return queryOptions({
    queryKey: ["themed-assessment", orgSlug, assessmentSlug],
    queryFn: async (): Promise<ThemedAssessment> => {
      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("id, slug, name")
        .eq("slug", orgSlug)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) throw notFound();

      const { data: assessment, error: aErr } = await supabase
        .from("assessments")
        .select("id, org_id, slug, name, is_active, theme_id, title_font, body_font")
        .eq("org_id", org.id)
        .eq("slug", assessmentSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!assessment) throw notFound();

      let theme: Theme | null = null;
      if (assessment.theme_id) {
        const { data: t, error: tErr } = await supabase
          .from("themes")
          .select(
            "id, name, bg_color, card_color, text_color, accent_color, muted_color, is_preset, created_by",
          )
          .eq("id", assessment.theme_id)
          .maybeSingle();
        if (tErr) throw tErr;
        theme = (t ?? null) as Theme | null;
      }

      return { org, assessment, theme } as ThemedAssessment;
    },
    staleTime: 60 * 1000,
  });
}

export type ResolvedTokens = {
  bg: string;
  card: string;
  text: string;
  accent: string;
  muted: string;
  titleFont: string;
  bodyFont: string;
  titleStack: string;
  bodyStack: string;
};

export function resolveTokens(data: ThemedAssessment): ResolvedTokens {
  const t = data.theme;
  const titleFont = data.assessment.title_font ?? DEFAULT_TITLE_FONT;
  const bodyFont = data.assessment.body_font ?? DEFAULT_BODY_FONT;
  return {
    bg: t?.bg_color ?? DEFAULT_THEME_TOKENS.bg,
    card: t?.card_color ?? DEFAULT_THEME_TOKENS.card,
    text: t?.text_color ?? DEFAULT_THEME_TOKENS.text,
    accent: t?.accent_color ?? DEFAULT_THEME_TOKENS.accent,
    muted: t?.muted_color ?? DEFAULT_THEME_TOKENS.muted,
    titleFont,
    bodyFont,
    titleStack: fontStack(titleFont, DEFAULT_TITLE_FONT),
    bodyStack: fontStack(bodyFont, DEFAULT_BODY_FONT),
  };
}

/** CSS custom properties to attach to the flow's root element. */
export function tokensToCssVars(tokens: ResolvedTokens): CSSProperties {
  return {
    ["--a-bg" as string]: tokens.bg,
    ["--a-card" as string]: tokens.card,
    ["--a-text" as string]: tokens.text,
    ["--a-accent" as string]: tokens.accent,
    ["--a-muted" as string]: tokens.muted,
    ["--a-title-font" as string]: tokens.titleStack,
    ["--a-body-font" as string]: tokens.bodyStack,
    backgroundColor: "var(--a-bg)",
    color: "var(--a-text)",
    fontFamily: "var(--a-body-font)",
  } as CSSProperties;
}

/** Google Fonts stylesheet URL for just the two families this assessment uses. */
export function assessmentFontsHref(data: ThemedAssessment): string | null {
  return googleFontsHref([
    data.assessment.title_font ?? DEFAULT_TITLE_FONT,
    data.assessment.body_font ?? DEFAULT_BODY_FONT,
  ]);
}
