
DROP POLICY IF EXISTS "Anyone can update their session row" ON public.sessions;

CREATE POLICY "Unsubmitted sessions can be updated"
  ON public.sessions
  FOR UPDATE
  TO anon, authenticated
  USING (submitted_at IS NULL)
  WITH CHECK (submitted_at IS NOT NULL);
