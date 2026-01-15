-- Sendaway Row Level Security Policies
-- Ensures users can only access their own data

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but not tier - that's handled by webhooks)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- MESSAGES POLICIES
-- ============================================

-- Users can view their own messages
CREATE POLICY "Users can view own messages"
  ON public.messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own messages
CREATE POLICY "Users can insert own messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending messages
CREATE POLICY "Users can update own pending messages"
  ON public.messages
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own pending messages
CREATE POLICY "Users can delete own pending messages"
  ON public.messages
  FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

-- ============================================
-- PAYMENTS POLICIES
-- ============================================

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON public.payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- DELIVERY LOGS POLICIES
-- ============================================

-- Users can view delivery logs for their own messages
CREATE POLICY "Users can view own delivery logs"
  ON public.delivery_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages
      WHERE messages.id = delivery_logs.message_id
      AND messages.user_id = auth.uid()
    )
  );
