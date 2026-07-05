
-- 1. assessments table
CREATE TABLE public.assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  theme_id uuid NULL,
  title_font text NULL,
  body_font text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessments_org_slug_unique UNIQUE (org_id, slug),
  CONSTRAINT assessments_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

GRANT SELECT ON public.assessments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active assessments"
  ON public.assessments FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins read assessments in their orgs"
  ON public.assessments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid() AND m.org_id = assessments.org_id
    )
  );

CREATE POLICY "Admins insert assessments in their orgs"
  ON public.assessments FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
    AND (
      has_role(auth.uid(), 'superadmin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.org_members m
        WHERE m.user_id = auth.uid() AND m.org_id = assessments.org_id
      )
    )
  );

CREATE POLICY "Admins update assessments in their orgs"
  ON public.assessments FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid() AND m.org_id = assessments.org_id
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid() AND m.org_id = assessments.org_id
    )
  );

CREATE POLICY "Admins delete assessments in their orgs"
  ON public.assessments FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.user_id = auth.uid() AND m.org_id = assessments.org_id
    )
  );

CREATE TRIGGER update_assessments_updated_at
  BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Backfill one assessment per existing org
INSERT INTO public.assessments (org_id, slug, name, is_active)
SELECT o.id, 'sdr', 'SDR Screen', true FROM public.orgs o;

-- 3. Add assessment_id to segments and sessions; backfill
ALTER TABLE public.segments  ADD COLUMN assessment_id uuid NULL REFERENCES public.assessments(id) ON DELETE CASCADE;
ALTER TABLE public.sessions  ADD COLUMN assessment_id uuid NULL REFERENCES public.assessments(id) ON DELETE CASCADE;

UPDATE public.segments s
   SET assessment_id = a.id
  FROM public.assessments a
 WHERE a.org_id = s.org_id AND a.slug = 'sdr' AND s.assessment_id IS NULL;

UPDATE public.sessions s
   SET assessment_id = a.id
  FROM public.assessments a
 WHERE a.org_id = s.org_id AND a.slug = 'sdr' AND s.assessment_id IS NULL;

ALTER TABLE public.segments  ALTER COLUMN assessment_id SET NOT NULL;
ALTER TABLE public.sessions  ALTER COLUMN assessment_id SET NOT NULL;

CREATE INDEX segments_assessment_id_idx ON public.segments (assessment_id);
CREATE INDEX sessions_assessment_id_idx ON public.sessions (assessment_id);

-- 4. Rewrite segments/sessions policies to route through assessment.org_id
DROP POLICY IF EXISTS "Anyone can read active segments" ON public.segments;
DROP POLICY IF EXISTS "Admins read segments in their orgs" ON public.segments;
DROP POLICY IF EXISTS "Admins insert segments in their orgs" ON public.segments;
DROP POLICY IF EXISTS "Admins update segments in their orgs" ON public.segments;
DROP POLICY IF EXISTS "Admins delete segments in their orgs" ON public.segments;

CREATE POLICY "Anyone can read active segments"
  ON public.segments FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = segments.assessment_id AND a.is_active = true
    )
  );

CREATE POLICY "Admins read segments in their assessments"
  ON public.segments FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.org_members m ON m.org_id = a.org_id
      WHERE a.id = segments.assessment_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins insert segments in their assessments"
  ON public.segments FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
    AND (
      has_role(auth.uid(), 'superadmin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.assessments a
        JOIN public.org_members m ON m.org_id = a.org_id
        WHERE a.id = segments.assessment_id AND m.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admins update segments in their assessments"
  ON public.segments FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.org_members m ON m.org_id = a.org_id
      WHERE a.id = segments.assessment_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.org_members m ON m.org_id = a.org_id
      WHERE a.id = segments.assessment_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins delete segments in their assessments"
  ON public.segments FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.org_members m ON m.org_id = a.org_id
      WHERE a.id = segments.assessment_id AND m.user_id = auth.uid()
    )
  );

-- sessions
DROP POLICY IF EXISTS "Anyone can create a session" ON public.sessions;
DROP POLICY IF EXISTS "Admins read sessions in their orgs" ON public.sessions;

CREATE POLICY "Anyone can create a session"
  ON public.sessions FOR INSERT TO anon, authenticated
  WITH CHECK (
    submitted_at IS NULL
    AND assessment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = sessions.assessment_id AND a.is_active = true
    )
  );

CREATE POLICY "Admins read sessions in their assessments"
  ON public.sessions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'superadmin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.org_members m ON m.org_id = a.org_id
      WHERE a.id = sessions.assessment_id AND m.user_id = auth.uid()
    )
  );
