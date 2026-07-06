
ALTER TABLE public.segments
  ADD COLUMN IF NOT EXISTS entry_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS response_type text NOT NULL DEFAULT 'audio',
  ADD COLUMN IF NOT EXISTS text_value jsonb NULL,
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.responses
  DROP CONSTRAINT IF EXISTS responses_response_type_check;
ALTER TABLE public.responses
  ADD CONSTRAINT responses_response_type_check
  CHECK (response_type IN ('audio','text'));
