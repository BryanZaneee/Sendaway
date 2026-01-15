-- Delivery Batch Locks Table
-- Serializes process-delivery execution via single-row constraint
-- Trigger rejects INSERT if row exists; DELETE releases lock

CREATE TABLE IF NOT EXISTS public.delivery_batch_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to ensure only one row exists
CREATE OR REPLACE FUNCTION public.enforce_single_batch_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.delivery_batch_locks) > 0 THEN
    RETURN NULL; -- Prevent insert
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_batch_lock_trigger
  BEFORE INSERT ON public.delivery_batch_locks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_batch_lock();
