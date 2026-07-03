
-- Allow 'audio' as a segment type
ALTER TABLE public.segments DROP CONSTRAINT IF EXISTS segments_type_check;
ALTER TABLE public.segments ADD CONSTRAINT segments_type_check
  CHECK (type = ANY (ARRAY['audio'::text, 'warmup'::text, 'question'::text, 'scripted'::text, 'improv'::text]));

-- For each segment that has prompt_audio_path, insert a new 'audio' step just before it
-- carrying that audio path, then null out the original's path.
-- We use fractional sort_order then resequence.
DO $$
DECLARE
  rec RECORD;
  new_id uuid;
BEGIN
  FOR rec IN
    SELECT id, sort_order, prompt_audio_path, cue_label, org_id
    FROM public.segments
    WHERE prompt_audio_path IS NOT NULL
    ORDER BY sort_order
  LOOP
    INSERT INTO public.segments (
      org_id, sort_order, type, prompt_audio_path,
      script_text, countdown_seconds, cue_color, cue_label, is_active
    ) VALUES (
      rec.org_id,
      rec.sort_order * 10 - 1,
      'audio',
      rec.prompt_audio_path,
      NULL,
      NULL,
      '#2B2B28',
      rec.cue_label || ' — audio',
      true
    );
    UPDATE public.segments SET prompt_audio_path = NULL, sort_order = sort_order * 10 WHERE id = rec.id;
  END LOOP;

  -- Resequence all sort_order values to be contiguous starting at 1
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, created_at) AS rn
    FROM public.segments
  )
  UPDATE public.segments s SET sort_order = ordered.rn
  FROM ordered WHERE s.id = ordered.id;
END $$;
