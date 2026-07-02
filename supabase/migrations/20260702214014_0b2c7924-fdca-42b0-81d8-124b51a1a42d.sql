
-- Allow authenticated reviewers to read submissions and their responses
CREATE POLICY "Authenticated can read sessions"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can read responses"
  ON public.responses FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.sessions TO authenticated;
GRANT SELECT ON public.responses TO authenticated;

-- Allow authenticated reviewers to read recordings from storage
CREATE POLICY "Authenticated can read recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'recordings');
