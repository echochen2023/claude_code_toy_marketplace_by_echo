-- Add an optional, user-editable nickname to profiles.
-- NULL means "not set"; the UI falls back to first_name + last_name.
-- handle_new_user() is intentionally left unchanged, so signup is unaffected.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname TEXT;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nickname_length CHECK (nickname IS NULL OR char_length(nickname) BETWEEN 1 AND 50);
