-- Queue for transactional notifications that need retry semantics.
-- Currently used for scheduled message confirmation emails.

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('scheduled_confirmation')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_provider_id TEXT,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, notification_type, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status_due
  ON public.notification_queue(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_notification_queue_message_id
  ON public.notification_queue(message_id);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification queue" ON public.notification_queue;
CREATE POLICY "Users can view own notification queue"
  ON public.notification_queue
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.messages
      WHERE messages.id = notification_queue.message_id
      AND messages.user_id = auth.uid()
    )
  );

-- Keep updated_at in sync with row updates.
DROP TRIGGER IF EXISTS update_notification_queue_updated_at ON public.notification_queue;
CREATE TRIGGER update_notification_queue_updated_at
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enqueue account-owner confirmation email after each message creation.
CREATE OR REPLACE FUNCTION public.enqueue_scheduled_confirmation_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_email TEXT;
BEGIN
  SELECT email INTO v_recipient_email
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_recipient_email IS NULL OR char_length(trim(v_recipient_email)) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_queue (
    message_id,
    notification_type,
    recipient_email
  ) VALUES (
    NEW.id,
    'scheduled_confirmation',
    v_recipient_email
  )
  ON CONFLICT (message_id, notification_type, recipient_email) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_scheduled_confirmation_on_message_insert ON public.messages;
CREATE TRIGGER enqueue_scheduled_confirmation_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_scheduled_confirmation_notification();
