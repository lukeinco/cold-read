
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text,
  linkedin_url text,
  submitted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.sessions TO anon;
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create a session" ON public.sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update their session row" ON public.sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  segment_id text NOT NULL,
  sort_order int NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.responses TO anon;
GRANT SELECT, INSERT ON public.responses TO authenticated;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create a response" ON public.responses FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Anyone can upload to recordings" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'recordings');
