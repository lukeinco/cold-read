
-- =========================
-- orgs
-- =========================
CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orgs TO authenticated;
GRANT ALL ON public.orgs TO service_role;
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read orgs"
  ON public.orgs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Superadmins can insert orgs"
  ON public.orgs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins can update orgs"
  ON public.orgs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins can delete orgs"
  ON public.orgs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

-- Seed
INSERT INTO public.orgs (name) VALUES ('TekMyBiz Screening');

-- =========================
-- org_members
-- =========================
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
GRANT SELECT ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own memberships"
  ON public.org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Superadmins read all memberships"
  ON public.org_members FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins insert memberships"
  ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins update memberships"
  ON public.org_members FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins delete memberships"
  ON public.org_members FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

-- =========================
-- invite_codes
-- =========================
CREATE TABLE public.invite_codes (
  code text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_codes TO authenticated;
GRANT ALL ON public.invite_codes TO service_role;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins read codes"
  ON public.invite_codes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins insert codes"
  ON public.invite_codes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin') AND created_by = auth.uid());
CREATE POLICY "Superadmins update codes"
  ON public.invite_codes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins delete codes"
  ON public.invite_codes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

-- =========================
-- Superadmin bootstrap trigger on new auth users
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user_superadmin_bootstrap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
BEGIN
  IF lower(NEW.email) = 'lukeinco@gmail.com' THEN
    SELECT id INTO _org_id FROM public.orgs WHERE name = 'TekMyBiz Screening' LIMIT 1;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'superadmin')
      ON CONFLICT (user_id, role) DO NOTHING;
    IF _org_id IS NOT NULL THEN
      INSERT INTO public.org_members (user_id, org_id, role)
        VALUES (NEW.id, _org_id, 'superadmin')
        ON CONFLICT (user_id, org_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_superadmin_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_superadmin_bootstrap();
