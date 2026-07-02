
-- 1) Per-session secret token
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS client_token uuid NOT NULL DEFAULT gen_random_uuid();

-- 2) Helpers: read the token supplied by the caller, and verify it against a session row
CREATE OR REPLACE FUNCTION public.current_session_token()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT nullif(current_setting('request.headers', true), '')::json ->> 'x-session-token';
$$;

CREATE OR REPLACE FUNCTION public.session_matches_token(_session_id uuid, _token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = _session_id
      AND _token IS NOT NULL
      AND s.client_token::text = _token
  );
$$;

REVOKE ALL ON FUNCTION public.session_matches_token(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_matches_token(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_session_token() TO anon, authenticated;

-- 3) sessions INSERT: keep open (candidates start anonymously) but add a non-trivial CHECK
DROP POLICY "Anyone can create a session" ON public.sessions;
CREATE POLICY "Anyone can create a session"
  ON public.sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (submitted_at IS NULL);

-- 4) sessions UPDATE: only the session owner can submit their own row
DROP POLICY "Unsubmitted sessions can be updated" ON public.sessions;
CREATE POLICY "Owner can submit their session"
  ON public.sessions FOR UPDATE
  TO anon, authenticated
  USING (
    submitted_at IS NULL
    AND client_token::text = public.current_session_token()
  )
  WITH CHECK (
    submitted_at IS NOT NULL
    AND client_token::text = public.current_session_token()
  );

-- 5) responses INSERT: must belong to a session the caller owns
DROP POLICY "Anyone can create a response" ON public.responses;
CREATE POLICY "Owner can create a response"
  ON public.responses FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.session_matches_token(session_id, public.current_session_token())
  );

-- 6) recordings upload: path must live inside the caller's session folder
DROP POLICY "Anyone can upload to recordings" ON storage.objects;
CREATE POLICY "Owner can upload to their session folder"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'recordings'
    AND position('/' in name) > 0
    AND public.session_matches_token(
      (split_part(name, '/', 1))::uuid,
      public.current_session_token()
    )
  );
