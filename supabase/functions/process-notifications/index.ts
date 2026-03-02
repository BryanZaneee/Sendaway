import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Resend } from 'https://esm.sh/resend@2.1.0';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  validateEmail,
  getMessage,
  buildScheduledConfirmationEmail,
  getRetryTime,
  ValidationError,
} from '../_shared/email-utils.ts';
import type { NotificationRow } from '../_shared/email-utils.ts';
import {
  NOTIFICATION_BATCH_SIZE as BATCH_SIZE,
  NOTIFICATION_TIMEOUT_MS as TIMEOUT_MS,
  NOTIFICATION_RATE_LIMIT_MS as RATE_LIMIT_DELAY_MS,
  NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
} from '../_shared/constants.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

interface BatchResult {
  processed: number;
  delivered: number;
  retryScheduled: number;
  failed: number;
  stoppedEarly: boolean;
}

interface ProcessResult {
  status: 'delivered' | 'retry_scheduled' | 'failed';
}

interface SendResult {
  success: boolean;
  emailProviderId?: string;
  error?: string;
}

function delayForRateLimit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
}

async function sendEmail(
  recipientEmail: string,
  subject: string,
  html: string,
  fromEmail: string,
): Promise<SendResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject,
      html,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, emailProviderId: data?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function markNotificationSuccess(
  supabase: ReturnType<typeof createClient>,
  notification: NotificationRow,
  emailProviderId?: string,
): Promise<void> {
  await supabase
    .from('notification_queue')
    .update({
      status: 'delivered',
      attempt_count: notification.attempt_count + 1,
      email_provider_id: emailProviderId ?? null,
      last_error: null,
      delivered_at: new Date().toISOString(),
    })
    .eq('id', notification.id);
}

async function markNotificationFailure(
  supabase: ReturnType<typeof createClient>,
  notification: NotificationRow,
  errorMessage: string,
  permanentlyFailed: boolean,
): Promise<void> {
  const nextAttemptCount = notification.attempt_count + 1;

  await supabase
    .from('notification_queue')
    .update({
      status: permanentlyFailed ? 'failed' : 'pending',
      attempt_count: nextAttemptCount,
      last_error: errorMessage,
      next_attempt_at: permanentlyFailed ? new Date().toISOString() : getRetryTime(nextAttemptCount),
    })
    .eq('id', notification.id);
}

async function processNotification(
  supabase: ReturnType<typeof createClient>,
  notification: NotificationRow,
  fromEmail: string,
  appUrl: string,
): Promise<ProcessResult> {
  try {
    if (!validateEmail(notification.recipient_email)) {
      throw new ValidationError(`Invalid recipient email: ${notification.recipient_email}`);
    }

    const message = getMessage(notification);
    const composed = buildScheduledConfirmationEmail(message, appUrl);
    const sendResult = await sendEmail(notification.recipient_email, composed.subject, composed.html, fromEmail);

    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to send email');
    }

    await markNotificationSuccess(supabase, notification, sendResult.emailProviderId);
    return { status: 'delivered' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const nextAttemptCount = notification.attempt_count + 1;
    const maxAttempts = notification.max_attempts || NOTIFICATION_DEFAULT_MAX_ATTEMPTS;
    const permanentlyFailed = error instanceof ValidationError || nextAttemptCount >= maxAttempts;

    await markNotificationFailure(supabase, notification, message, permanentlyFailed);

    return { status: permanentlyFailed ? 'failed' : 'retry_scheduled' };
  }
}

async function processBatch(
  supabase: ReturnType<typeof createClient>,
  notifications: NotificationRow[],
  startTime: number,
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    delivered: 0,
    retryScheduled: 0,
    failed: 0,
    stoppedEarly: false,
  };

  const fromEmail = Deno.env.get('FROM_EMAIL') || 'FtrMsg <noreply@ftrmsg.com>';
  const appUrl = Deno.env.get('APP_URL') || 'https://ftrmsg.com';

  for (let i = 0; i < notifications.length; i++) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      result.stoppedEarly = true;
      break;
    }

    const notification = notifications[i];
    result.processed++;

    const notificationResult = await processNotification(supabase, notification, fromEmail, appUrl);

    if (notificationResult.status === 'delivered') {
      result.delivered++;
    } else if (notificationResult.status === 'failed') {
      result.failed++;
    } else {
      result.retryScheduled++;
    }

    if (i < notifications.length - 1) {
      await delayForRateLimit();
    }
  }

  return result;
}

serve(async (req: Request) => {
  if (!verifyCronSecret(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .from('notification_queue')
      .select(`
        id,
        message_id,
        notification_type,
        recipient_email,
        attempt_count,
        max_attempts,
        messages!inner (
          id,
          message_text,
          scheduled_date,
          delivery_email
        )
      `)
      .eq('status', 'pending')
      .eq('notification_type', 'scheduled_confirmation')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`Failed to query notification queue: ${error.message}`);
    }

    const notifications = (data || []) as NotificationRow[];
    if (notifications.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, delivered: 0, retryScheduled: 0, failed: 0, stoppedEarly: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const result = await processBatch(supabaseAdmin, notifications, Date.now());
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Process notifications error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
