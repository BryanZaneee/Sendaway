-- Fix RPCs that modify protected profile fields.
--
-- The protect_profile_sensitive_fields trigger blocks our SECURITY DEFINER
-- RPCs because it checks the session-level role GUC (which stays
-- 'authenticated' even inside SECURITY DEFINER functions), and Supabase
-- doesn't allow SET role or custom GUCs inside functions.
--
-- Simplest fix: drop the trigger and protect sensitive fields via RLS
-- WITH CHECK instead. SECURITY DEFINER functions run as the superuser
-- owner and bypass RLS, so our RPCs work without any special flags.

-- Step 1: Drop the trigger (the root cause of the bug)
DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_sensitive_fields();

-- Step 2: Replace with RLS policy that blocks client-side changes to
-- sensitive fields by comparing NEW values against current row values.
-- If any sensitive field differs, WITH CHECK fails → UPDATE is denied.
DROP POLICY IF EXISTS "Users can update own profile safe fields" ON public.profiles;
CREATE POLICY "Users can update own profile safe fields"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND tier = (SELECT p.tier FROM public.profiles p WHERE p.id = auth.uid())
    AND storage_limit_bytes = (SELECT p.storage_limit_bytes FROM public.profiles p WHERE p.id = auth.uid())
    AND storage_used_bytes = (SELECT p.storage_used_bytes FROM public.profiles p WHERE p.id = auth.uid())
    AND free_message_used = (SELECT p.free_message_used FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Step 3: Recreate mark_free_message_used (clean, no GUC hacks needed)
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

-- Step 4: Recreate update_storage_used (clean)
CREATE OR REPLACE FUNCTION public.update_storage_used(
  p_user_id UUID,
  p_delta_bytes BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    storage_used_bytes = GREATEST(0, storage_used_bytes + p_delta_bytes),
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- Step 5: New RPC to reset free_message_used when a free user deletes their message.
CREATE OR REPLACE FUNCTION public.reset_free_message_used(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg_count INT;
BEGIN
  SELECT count(*) INTO msg_count
  FROM public.messages
  WHERE user_id = p_user_id;

  IF msg_count = 0 THEN
    UPDATE public.profiles
    SET
      free_message_used = false,
      updated_at = NOW()
    WHERE id = p_user_id
      AND free_message_used = true;

    RETURN FOUND;
  END IF;

  RETURN false;
END;
$$;
