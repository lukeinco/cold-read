ALTER TABLE public.invite_codes DROP COLUMN IF EXISTS expires_at;
NOTIFY pgrst, 'reload schema';