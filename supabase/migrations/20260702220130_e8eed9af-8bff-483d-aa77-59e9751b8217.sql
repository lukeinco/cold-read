
DROP POLICY IF EXISTS "Owner can upload their recording" ON storage.objects;

CREATE POLICY "Owner can upload their recording"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'recordings'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.submitted_at IS NULL
    )
  );
