-- Add error_message column to payments table
-- Enables recording failure reasons for debugging failed tier upgrades

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS error_message TEXT;
