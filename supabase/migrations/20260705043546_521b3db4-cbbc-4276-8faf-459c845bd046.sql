ALTER TABLE public.segments DROP CONSTRAINT IF EXISTS segments_type_check;
ALTER TABLE public.segments ADD CONSTRAINT segments_type_check
  CHECK (type IN ('audio','warmup','question','scripted','improv','text','text_entry'));