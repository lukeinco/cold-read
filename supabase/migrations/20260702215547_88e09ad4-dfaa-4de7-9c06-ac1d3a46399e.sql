
-- 1. Admin role infrastructure
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 2. Tighten sessions SELECT: admins only
DROP POLICY IF EXISTS "Authenticated can read sessions" ON public.sessions;

CREATE POLICY "Admins can read sessions"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Block DELETE on sessions explicitly (defense in depth)
CREATE POLICY "No one can delete sessions"
  ON public.sessions FOR DELETE
  TO anon, authenticated
  USING (false);

-- 4. Tighten responses SELECT: admins only
DROP POLICY IF EXISTS "Authenticated can read responses" ON public.responses;

CREATE POLICY "Admins can read responses"
  ON public.responses FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Tighten recordings bucket SELECT: admins only
DROP POLICY IF EXISTS "Authenticated can read recordings" ON storage.objects;

CREATE POLICY "Admins can read recordings"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recordings'
    AND public.has_role(auth.uid(), 'admin')
  );
