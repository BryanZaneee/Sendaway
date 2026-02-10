-- Create RPC function to mark free message as used
-- Uses SECURITY DEFINER to bypass the protect_profile_sensitive_fields trigger
-- which blocks client-side updates to free_message_used.
-- Returns true if the flag was successfully flipped (optimistic lock succeeded),
-- false if it was already true (another request won the race).

CREATE OR REPLACE FUNCTION public.mark_free_message_used(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    free_message_used = true,
    updated_at = NOW()
  WHERE id = p_user_id
    AND free_message_used = false;

  RETURN FOUND;
END;
$$;
