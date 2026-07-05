
-- 1. themes table
CREATE TABLE public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bg_color text,
  card_color text,
  text_color text,
  accent_color text,
  muted_color text,
  is_preset boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX themes_preset_name_key
  ON public.themes (name) WHERE is_preset = true;

GRANT SELECT ON public.themes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;

ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

-- Anon + authenticated: read everything
CREATE POLICY "Anyone can view themes"
  ON public.themes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only superadmins can insert custom themes (presets are seeded here)
CREATE POLICY "Superadmins insert custom themes"
  ON public.themes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    AND is_preset = false
  );

-- Only superadmins can update; never presets
CREATE POLICY "Superadmins update custom themes"
  ON public.themes FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    AND is_preset = false
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    AND is_preset = false
  );

-- Only superadmins can delete; never presets
CREATE POLICY "Superadmins delete custom themes"
  ON public.themes FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    AND is_preset = false
  );

CREATE TRIGGER update_themes_updated_at
  BEFORE UPDATE ON public.themes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed presets
INSERT INTO public.themes (name, bg_color, card_color, text_color, accent_color, muted_color, is_preset) VALUES
  ('Cannery Dusk',        '#0C1A22', '#1B3A32', '#EDF2EE', '#E8B84B', '#9DB0B2', true),
  ('Deep Harbor',         '#12232B', '#1A333C', '#E4EBEA', '#5FB3B3', '#8AA1A6', true),
  ('Morning Fog',         '#E9EBE6', '#DDE2DA', '#2A3138', '#3A6B63', '#5E6B66', true),
  ('Midnight Terminal',   '#0D1B2A', '#16283C', '#E6ECF2', '#48CAE4', '#8FA3B5', true),
  ('Synthwave Dusk',      '#1A1327', '#251B38', '#EDE4F5', '#FF5FC4', '#9B87B0', true),
  ('Forest Console',      '#0E1E19', '#173029', '#DEEAE3', '#F2A65A', '#85A093', true),
  ('Graphite Ember',      '#1B1E24', '#262B33', '#E5E7EB', '#FF7A45', '#949AA5', true),
  ('Deep Ocean',          '#0F2129', '#17323C', '#DBE9EF', '#2EC4B6', '#7F9BA6', true),
  ('Daylight',            '#F3F0E9', '#E7E2D6', '#23272E', '#2563EB', '#6B7178', true);

-- 3. assessments.theme_id fk + backfill + default
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_theme_id_fkey
  FOREIGN KEY (theme_id) REFERENCES public.themes(id) ON DELETE SET NULL;

UPDATE public.assessments
  SET theme_id = (SELECT id FROM public.themes WHERE name = 'Cannery Dusk' AND is_preset = true LIMIT 1)
  WHERE theme_id IS NULL;

-- 4. Per-segment overrides
ALTER TABLE public.segments
  ADD COLUMN override_card_color text,
  ADD COLUMN override_text_color text;
