-- RPC function to ensure a profile exists for the authenticated user.
-- Handles cases where the handle_new_user trigger didn't fire:
--   - Google OAuth identity linking (no INSERT into auth.users)
--   - Trigger not deployed or failed silently
-- Uses SECURITY DEFINER to bypass RLS (profiles has no INSERT policy).
-- ON CONFLICT DO NOTHING makes it safe to call repeatedly.

CREATE OR REPLACE FUNCTION public.ensure_profile_exists(p_user_id UUID, p_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (p_user_id, p_email)
  ON CONFLICT (id) DO NOTHING;
END;
$$;
