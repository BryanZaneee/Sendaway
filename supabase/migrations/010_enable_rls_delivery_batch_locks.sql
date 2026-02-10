-- Lint fix: table is in public schema, so RLS must be enabled
ALTER TABLE public.delivery_batch_locks ENABLE ROW LEVEL SECURITY;
