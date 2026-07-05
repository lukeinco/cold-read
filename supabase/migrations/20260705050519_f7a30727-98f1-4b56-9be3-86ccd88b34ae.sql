
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orgs' AND column_name='slug') THEN
    ALTER TABLE public.orgs ADD COLUMN slug text;
  END IF;
END $$;

UPDATE public.orgs SET slug = 'tekmybiz' WHERE name = 'TekMyBiz Screening' AND (slug IS NULL OR slug = '');
UPDATE public.orgs SET slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g') WHERE slug IS NULL OR slug = '';
UPDATE public.orgs SET slug = trim(both '-' from slug);
ALTER TABLE public.orgs ALTER COLUMN slug SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orgs_slug_key') THEN
    ALTER TABLE public.orgs ADD CONSTRAINT orgs_slug_key UNIQUE (slug);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orgs_slug_format') THEN
    ALTER TABLE public.orgs ADD CONSTRAINT orgs_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60);
  END IF;
END $$;

GRANT SELECT ON public.orgs TO anon;
DROP POLICY IF EXISTS "Anyone can read orgs" ON public.orgs;
CREATE POLICY "Anyone can read orgs" ON public.orgs
  FOR SELECT TO anon USING (true);

-- segments.org_id already exists per schema; backfill + enforce
UPDATE public.segments SET org_id = (SELECT id FROM public.orgs WHERE slug = 'tekmybiz') WHERE org_id IS NULL;
ALTER TABLE public.segments ALTER COLUMN org_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='segments_org_id_fkey') THEN
    ALTER TABLE public.segments ADD CONSTRAINT segments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS segments_org_id_idx ON public.segments(org_id);

-- sessions: add org_id if missing, backfill, enforce
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='org_id') THEN
    ALTER TABLE public.sessions ADD COLUMN org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE;
  END IF;
END $$;
UPDATE public.sessions SET org_id = (SELECT id FROM public.orgs WHERE slug = 'tekmybiz') WHERE org_id IS NULL;
ALTER TABLE public.sessions ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_org_id_idx ON public.sessions(org_id);

-- segments RLS: scope by org
DROP POLICY IF EXISTS "Admins can read all segments" ON public.segments;
DROP POLICY IF EXISTS "Admins can insert segments" ON public.segments;
DROP POLICY IF EXISTS "Admins can update segments" ON public.segments;
DROP POLICY IF EXISTS "Admins can delete segments" ON public.segments;
DROP POLICY IF EXISTS "Admins read segments in their orgs" ON public.segments;
DROP POLICY IF EXISTS "Admins insert segments in their orgs" ON public.segments;
DROP POLICY IF EXISTS "Admins update segments in their orgs" ON public.segments;
DROP POLICY IF EXISTS "Admins delete segments in their orgs" ON public.segments;

CREATE POLICY "Admins read segments in their orgs" ON public.segments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = segments.org_id)
  );
CREATE POLICY "Admins insert segments in their orgs" ON public.segments
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
    AND (
      public.has_role(auth.uid(), 'superadmin')
      OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = segments.org_id)
    )
  );
CREATE POLICY "Admins update segments in their orgs" ON public.segments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = segments.org_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'superadmin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = segments.org_id)
  );
CREATE POLICY "Admins delete segments in their orgs" ON public.segments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = segments.org_id)
  );

-- sessions RLS
DROP POLICY IF EXISTS "Anyone can create a session" ON public.sessions;
CREATE POLICY "Anyone can create a session" ON public.sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (submitted_at IS NULL AND org_id IS NOT NULL);

DROP POLICY IF EXISTS "Admins can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Admins read sessions in their orgs" ON public.sessions;
CREATE POLICY "Admins read sessions in their orgs" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.user_id = auth.uid() AND m.org_id = sessions.org_id)
  );

-- responses RLS
DROP POLICY IF EXISTS "Admins can read responses" ON public.responses;
DROP POLICY IF EXISTS "Admins read responses in their orgs" ON public.responses;
CREATE POLICY "Admins read responses in their orgs" ON public.responses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.org_members m ON m.org_id = s.org_id
      WHERE s.id = responses.session_id AND m.user_id = auth.uid()
    )
  );
