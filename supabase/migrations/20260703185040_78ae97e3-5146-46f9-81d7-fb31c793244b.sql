
-- segments table
CREATE TABLE public.segments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid,
  sort_order integer NOT NULL,
  type text NOT NULL CHECK (type IN ('warmup','question','scripted','improv')),
  prompt_audio_path text,
  script_text text,
  countdown_seconds integer,
  cue_color text NOT NULL,
  cue_label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.segments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT ALL ON public.segments TO service_role;

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active segments"
  ON public.segments FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can read all segments"
  ON public.segments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins can insert segments"
  ON public.segments FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins can update segments"
  ON public.segments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins can delete segments"
  ON public.segments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_segments_updated_at
  BEFORE UPDATE ON public.segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.segments (sort_order, type, script_text, countdown_seconds, cue_color, cue_label) VALUES
  (0, 'warmup',   NULL, 30, '#3D5E4A', 'Warm up'),
  (1, 'question', NULL, 60, '#3D5E4A', 'Answer out loud'),
  (2, 'question', NULL, 60, '#3D5E4A', 'Answer out loud'),
  (3, 'scripted', 'Placeholder scripted line one. Read this exactly as written.',   45, '#2B2B28', 'Read aloud'),
  (4, 'scripted', 'Placeholder scripted line two. Read this exactly as written.',   45, '#2B2B28', 'Read aloud'),
  (5, 'scripted', 'Placeholder scripted line three. Read this exactly as written.', 45, '#2B2B28', 'Read aloud'),
  (6, 'improv',   NULL, NULL, '#C44A18', 'Improvise');

-- Storage RLS for prompts bucket
CREATE POLICY "Anyone can read prompt audio"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'prompts');

CREATE POLICY "Admins can upload prompt audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'prompts'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  );

CREATE POLICY "Admins can update prompt audio"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'prompts'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  );

CREATE POLICY "Admins can delete prompt audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'prompts'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  );
