/**
 * Curated Google Font list for Cold Read assessments.
 * Assessments store the family name in `title_font` / `body_font`;
 * the candidate flow builds a single <link> from only the fonts in use.
 */

export type FontOption = {
  /** Family name as stored on assessments and used in CSS `font-family`. */
  family: string;
  /** Google Fonts `family=` spec fragment (with weights/styles). */
  googleSpec: string;
  /** Full CSS font-family stack including fallbacks. */
  stack: string;
  /** For title fonts: preferred display weight. */
  displayWeight?: number;
};

export const TITLE_FONTS: FontOption[] = [
  {
    family: "Cormorant Garamond",
    googleSpec: "Cormorant+Garamond:wght@500;600;700",
    stack: `"Cormorant Garamond", Georgia, "Times New Roman", serif`,
    displayWeight: 600,
  },
  {
    family: "Bebas Neue",
    googleSpec: "Bebas+Neue",
    stack: `"Bebas Neue", Impact, "Arial Narrow", sans-serif`,
  },
  {
    family: "Space Grotesk",
    googleSpec: "Space+Grotesk:wght@400;500;600;700",
    stack: `"Space Grotesk", "Helvetica Neue", Arial, sans-serif`,
  },
  {
    family: "Fraunces",
    googleSpec: "Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700",
    stack: `"Fraunces", Georgia, "Times New Roman", serif`,
  },
];

export const BODY_FONTS: FontOption[] = [
  {
    family: "IBM Plex Mono",
    googleSpec: "IBM+Plex+Mono:wght@400;500;600",
    stack: `"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace`,
  },
  {
    family: "Inter",
    googleSpec: "Inter:wght@400;500;600;700",
    stack: `"Inter", "Helvetica Neue", Arial, sans-serif`,
  },
  {
    family: "Source Sans 3",
    googleSpec: "Source+Sans+3:wght@400;500;600;700",
    stack: `"Source Sans 3", "Helvetica Neue", Arial, sans-serif`,
  },
  {
    family: "Lora",
    googleSpec: "Lora:ital,wght@0,400;0,500;0,600;1,400",
    stack: `"Lora", Georgia, "Times New Roman", serif`,
  },
];

export const DEFAULT_TITLE_FONT = "Cormorant Garamond";
export const DEFAULT_BODY_FONT = "IBM Plex Mono";

const ALL_FONTS: FontOption[] = [...TITLE_FONTS, ...BODY_FONTS];

export function findFont(family: string | null | undefined): FontOption | undefined {
  if (!family) return undefined;
  return ALL_FONTS.find((f) => f.family === family);
}

export function fontStack(family: string | null | undefined, fallback: string): string {
  return findFont(family)?.stack ?? findFont(fallback)?.stack ?? fallback;
}

/**
 * Build a single Google Fonts stylesheet URL for the given families.
 * Returns null if no known families are supplied.
 */
export function googleFontsHref(families: Array<string | null | undefined>): string | null {
  const specs = Array.from(
    new Set(
      families
        .map((f) => findFont(f)?.googleSpec)
        .filter((s): s is string => Boolean(s)),
    ),
  );
  if (specs.length === 0) return null;
  const params = specs.map((s) => `family=${s}`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
