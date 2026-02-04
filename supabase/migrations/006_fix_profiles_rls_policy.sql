-- Fix profiles UPDATE RLS policy to prevent users from modifying sensitive fields
-- (tier, storage_limit_bytes, storage_used_bytes, free_message_used)
-- These fields should only be modified by Edge Functions using service role key.

-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create new policy that only allows updating safe fields
-- Uses WITH CHECK to verify sensitive fields remain unchanged
CREATE POLICY "Users can update own profile safe fields"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Ensure sensitive fields haven't been modified by comparing OLD values
    -- Note: We verify these via trigger since WITH CHECK can't access OLD values
  );

-- Create trigger function to enforce sensitive field protection
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Block changes to sensitive fields unless performed by service role
  -- Service role operations bypass RLS, so this trigger catches client-side attempts
  IF (
    NEW.tier IS DISTINCT FROM OLD.tier OR
    NEW.storage_limit_bytes IS DISTINCT FROM OLD.storage_limit_bytes OR
    NEW.storage_used_bytes IS DISTINCT FROM OLD.storage_used_bytes OR
    NEW.free_message_used IS DISTINCT FROM OLD.free_message_used
  ) THEN
    -- Check if this is a service role operation (bypasses RLS)
    -- If we reached this trigger via RLS-enabled connection, block the change
    IF current_setting('role', true) != 'service_role' AND
       current_setting('request.jwt.claims', true) IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot modify protected profile fields (tier, storage_limit_bytes, storage_used_bytes, free_message_used)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (runs before the existing updated_at trigger)
DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE TRIGGER protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- Add indexes for foreign key columns to improve query performance
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_logs_message_id ON public.delivery_logs(message_id);
