import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Resend } from 'https://esm.sh/resend@2.1.0';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  NOTIFICATION_BATCH_SIZE as BATCH_SIZE,
  NOTIFICATION_TIMEOUT_MS as TIMEOUT_MS,
  NOTIFICATION_RATE_LIMIT_MS as RATE_LIMIT_DELAY_MS,
  NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
} from '../_shared/constants.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface MessageSummary {
  id: string;
  message_text: string;
  scheduled_date: string;
  delivery_email: string;
}

interface NotificationRow {
  id: string;
  message_id: string;
  notification_type: 'scheduled_confirmation';
  recipient_email: string;
  attempt_count: number;
  max_attempts: number;
  messages: MessageSummary | MessageSummary[] | null;
}

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

function validateEmail(email: string): boolean {
  if (!email) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,10}$/;
  return emailPattern.test(email);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatScheduledDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildScheduledConfirmationEmail(message: MessageSummary): { subject: string; html: string } {
  const subject = 'Your FtrMsg message has been scheduled!';
  const appUrl = Deno.env.get('APP_URL') || 'https://ftrmsg.com';
  const scheduledDate = formatScheduledDate(message.scheduled_date);
  const preview = escapeHtml(message.message_text.slice(0, 240));

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Message Scheduled</title>
</head>
<body style="margin:0;padding:0;background:#FFFDF7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background:#FFFDF7;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:3px solid #000;border-radius:8px;box-shadow:8px 8px 0 0 #000;">
          <tr>
            <td style="padding:28px;background:#BBF7D0;border-bottom:3px solid #000;border-radius:5px 5px 0 0;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#000;text-transform:uppercase;">FTRMSG</h1>
              <p style="margin:10px 0 0 0;color:#333;font-size:16px;">Your message is safely scheduled.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 14px 0;font-size:16px;color:#000;">Delivery date: <strong>${scheduledDate}</strong></p>
              <p style="margin:0 0 14px 0;font-size:16px;color:#000;">Delivery destination: <strong>${escapeHtml(message.delivery_email)}</strong></p>
              <div style="border:2px solid #000;border-radius:8px;background:#F9F9F9;padding:18px;">
                <p style="margin:0;font-size:14px;line-height:1.5;color:#111;white-space:pre-wrap;">${preview}${message.message_text.length > 240 ? '...' : ''}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:#F5F5F5;border-top:2px solid #000;border-radius:0 0 5px 5px;text-align:center;">
              <a href="${appUrl}" style="color:#000;font-weight:700;">Manage your scheduled messages</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { subject, html };
}

function getMessage(notification: NotificationRow): MessageSummary {
  if (Array.isArray(notification.messages)) {
    const first = notification.messages[0];
    if (first) return first;
  } else if (notification.messages) {
    return notification.messages;
  }

  throw new Error(`Missing message relation for notification ${notification.id}`);
}

function delayForRateLimit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
}

function getRetryTime(attemptCount: number): string {
  const backoffMinutes = Math.min(5 * (2 ** Math.max(attemptCount - 1, 0)), 720);
  return new Date(Date.now() + backoffMinutes * 60_000).toISOString();
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
): Promise<ProcessResult> {
  try {
    if (!validateEmail(notification.recipient_email)) {
      throw new ValidationError(`Invalid recipient email: ${notification.recipient_email}`);
    }

    const message = getMessage(notification);
    const composed = buildScheduledConfirmationEmail(message);
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

  for (let i = 0; i < notifications.length; i++) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      result.stoppedEarly = true;
      break;
    }

    const notification = notifications[i];
    result.processed++;

    const notificationResult = await processNotification(supabase, notification, fromEmail);

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
