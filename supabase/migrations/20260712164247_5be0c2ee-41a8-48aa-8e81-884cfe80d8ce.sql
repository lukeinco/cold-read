
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS overall_rating smallint,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_overall_rating_range
    CHECK (overall_rating IS NULL OR (overall_rating BETWEEN 1 AND 5));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Admins update sessions in their assessments" ON public.sessions;
CREATE POLICY "Admins update sessions in their assessments"
ON public.sessions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'superadmin'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.assessments a
    JOIN public.org_members m ON m.org_id = a.org_id
    WHERE a.id = sessions.assessment_id AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'superadmin'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.assessments a
    JOIN public.org_members m ON m.org_id = a.org_id
    WHERE a.id = sessions.assessment_id AND m.user_id = auth.uid()
  )
);
