/**
 * Theme + contrast helpers for Cold Read.
 */

export type Theme = {
  id: string;
  name: string;
  bg_color: string | null;
  card_color: string | null;
  text_color: string | null;
  accent_color: string | null;
  muted_color: string | null;
  is_preset: boolean;
  created_by?: string | null;
};

export function themeSwatches(t: Theme): string[] {
  return [t.bg_color, t.card_color, t.text_color, t.accent_color, t.muted_color]
    .filter((c): c is string => Boolean(c));
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio 1..21 for two #RRGGBB colors. Returns null on parse fail. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const la = relLuminance(ra);
  const lb = relLuminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function eqColor(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function inPalette(color: string | null | undefined, palette: string[]): boolean {
  if (!color) return true;
  return palette.some((c) => eqColor(c, color));
}
