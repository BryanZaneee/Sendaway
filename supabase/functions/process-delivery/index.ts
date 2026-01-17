import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Resend } from 'https://esm.sh/resend@2.1.0';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
const BATCH_SIZE = 30;
// 45s timeout with 15s buffer for 60s Edge Function limit.
// BATCH_SIZE=30 leaves margin for DB/API latency at 1 msg/s rate.
const TIMEOUT_MS = 45000;
const RATE_LIMIT_DELAY_MS = 1000;

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface Message {
  id: string;
  user_id: string;
  message_text: string;
  video_storage_path: string | null;
  delivery_email: string;
  scheduled_date: string;
  delivery_token: string;
}

interface BatchResult {
  processed: number;
  delivered: number;
  failed: number;
  stoppedEarly: boolean;
}

/**
 * Returns true if email contains '@' symbol
 */
function validateEmail(email: string): boolean {
  return email?.includes('@') ?? false;
}

/**
 * Build neo-brutalist HTML email.
 * Throws ValidationError if delivery_email lacks '@' symbol.
 * Null/undefined message_text defaults to empty string.
 */
function buildDeliveryEmail(
  message: Message,
  videoUrl?: string | null
): { subject: string; html: string } {
  if (!validateEmail(message.delivery_email)) {
    throw new ValidationError(`Invalid delivery email: ${message.delivery_email}`);
  }

  const messageText = message.message_text ?? '';
  const appUrl = Deno.env.get('APP_URL') || 'https://ftrmsg.app';

  const subject = 'Your FtrMsg message has arrived!';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your FtrMsg Message</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FFFDF7; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFFDF7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #FFFFFF; border: 3px solid #000000; border-radius: 8px; box-shadow: 8px 8px 0px 0px #000000;">
          <!-- Header -->
          <tr>
            <td style="background: #FDE68A; padding: 30px; border-bottom: 3px solid #000000; border-radius: 5px 5px 0 0;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #000000; text-transform: uppercase;">
                FTRMSG
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; color: #333333;">
                Your message from the past has arrived!
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <div style="background: #F9F9F9; border: 2px solid #000000; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #000000; white-space: pre-wrap;">${messageText}</p>
              </div>
              ${videoUrl ? `
              <div style="background: #BAE6FD; border: 2px solid #000000; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
                <p style="margin: 0 0 15px 0; font-weight: 700; color: #000000;">Video Message Attached</p>
                <a href="${videoUrl}" style="display: inline-block; background: #BBF7D0; color: #000000; text-decoration: none; padding: 12px 24px; border: 2px solid #000000; border-radius: 8px; font-weight: 700; box-shadow: 4px 4px 0px 0px #000000;">
                  Watch Video
                </a>
                <p style="margin: 15px 0 0 0; font-size: 12px; color: #555555;">
                  Video link expires in 7 days
                </p>
              </div>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #F5F5F5; padding: 20px 30px; border-top: 2px solid #000000; border-radius: 0 0 5px 5px;">
              <p style="margin: 0; font-size: 14px; color: #555555; text-align: center;">
                Sent with love from your past self via <a href="${appUrl}" style="color: #000000; font-weight: 700;">FtrMsg</a>
              </p>
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

/**
 * Returns true if delivery_logs contains 'delivered' status for message_id
 */
async function checkDeliveryIdempotency(
  supabase: ReturnType<typeof createClient>,
  messageId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('delivery_logs')
    .select('id')
    .eq('message_id', messageId)
    .eq('status', 'delivered')
    .single();

  return data !== null;
}

/**
 * Delays execution by RATE_LIMIT_DELAY_MS (1000ms) to respect Resend 1/s limit
 */
function delayForRateLimit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
}

interface SendMessageResult {
  success: boolean;
  emailProviderId?: string;
  error?: string;
}

/**
 * Send a single message via Resend.
 * Returns success status and email provider ID on success, or error message on failure.
 */
async function sendMessage(
  message: Message,
  subject: string,
  html: string,
  fromEmail: string
): Promise<SendMessageResult> {
  try {
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: message.delivery_email,
      subject,
      html,
    });

    if (emailError) {
      return { success: false, error: emailError.message };
    }

    return { success: true, emailProviderId: emailData?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface PrepareResult {
  skip: boolean;
  attemptNumber: number;
}

/**
 * Performs idempotency check, calculates attempt number, inserts pending log.
 * Returns skip=true if message already delivered, otherwise returns attempt number.
 */
async function prepareDelivery(
  supabase: ReturnType<typeof createClient>,
  messageId: string
): Promise<PrepareResult> {
  if (await checkDeliveryIdempotency(supabase, messageId)) {
    return { skip: true, attemptNumber: 0 };
  }

  const { count } = await supabase
    .from('delivery_logs')
    .select('*', { count: 'exact', head: true })
    .eq('message_id', messageId);

  const attemptNumber = (count || 0) + 1;

  const { error: insertError } = await supabase.from('delivery_logs').insert({
    message_id: messageId,
    attempt_number: attemptNumber,
    status: 'pending',
  });

  if (insertError) {
    throw new Error(`Failed to create delivery log: ${insertError.message}`);
  }

  return { skip: false, attemptNumber };
}

interface ComposedEmail {
  subject: string;
  html: string;
}

/**
 * Generates signed video URL (if video exists) and builds HTML email
 */
async function composeDelivery(
  supabase: ReturnType<typeof createClient>,
  message: Message
): Promise<ComposedEmail> {
  let videoUrl: string | null = null;
  if (message.video_storage_path) {
    const { data: signedUrlData } = await supabase.storage
      .from('message-videos')
      .createSignedUrl(message.video_storage_path, 604800);
    videoUrl = signedUrlData?.signedUrl ?? null;
  }

  return buildDeliveryEmail(message, videoUrl);
}

/**
 * Sends email via Resend, updates delivery_logs and messages tables.
 * Logs error if messages.status update fails but delivery succeeded.
 */
async function executeDelivery(
  supabase: ReturnType<typeof createClient>,
  message: Message,
  email: ComposedEmail,
  attemptNumber: number,
  fromEmail: string
): Promise<void> {
  const sendResult = await sendMessage(message, email.subject, email.html, fromEmail);

  if (!sendResult.success) {
    throw new Error(sendResult.error || 'Failed to send email');
  }

  await supabase
    .from('delivery_logs')
    .update({
      status: 'delivered',
      email_provider_id: sendResult.emailProviderId,
    })
    .eq('message_id', message.id)
    .eq('attempt_number', attemptNumber);

  const { error: msgError } = await supabase
    .from('messages')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', message.id);

  if (msgError) {
    console.error(JSON.stringify({
      event: 'MESSAGE_STATUS_UPDATE_FAILED',
      message_id: message.id,
      error: msgError.message,
    }));
  }
}

interface ProcessMessageResult {
  status: 'delivered' | 'failed' | 'skipped';
}

/**
 * Processes single message through prepare, compose, and execute phases.
 * Returns status for batch aggregation (delivered/failed/skipped).
 */
async function processMessage(
  supabase: ReturnType<typeof createClient>,
  message: Message,
  fromEmail: string
): Promise<ProcessMessageResult> {
  try {
    const prep = await prepareDelivery(supabase, message.id);
    if (prep.skip) {
      return { status: 'skipped' };
    }

    const composed = await composeDelivery(supabase, message);
    await executeDelivery(supabase, message, composed, prep.attemptNumber, fromEmail);

    return { status: 'delivered' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('delivery_logs')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('message_id', message.id)
      .order('created_at', { ascending: false })
      .limit(1);

    await supabase
      .from('messages')
      .update({ status: 'failed' })
      .eq('id', message.id);

    return { status: 'failed' };
  }
}

/**
 * Orchestrates sequential message processing with early termination on timeout.
 * Aggregates delivered/failed counts and applies rate limiting between sends.
 */
async function processMessageBatch(
  supabase: ReturnType<typeof createClient>,
  messages: Message[],
  startTime: number
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    delivered: 0,
    failed: 0,
    stoppedEarly: false,
  };

  const fromEmail = Deno.env.get('FROM_EMAIL') || 'FtrMsg <noreply@ftrmsg.app>';

  for (let i = 0; i < messages.length; i++) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      result.stoppedEarly = true;
      break;
    }

    const message = messages[i];
    result.processed++;

    const messageResult = await processMessage(supabase, message, fromEmail);

    if (messageResult.status === 'delivered') {
      result.delivered++;
    } else if (messageResult.status === 'failed') {
      result.failed++;
    }

    if (i < messages.length - 1) {
      await delayForRateLimit();
    }
  }

  return result;
}

serve(async (req: Request) => {
  if (!verifyCronSecret(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  let lockId: string | null = null;

  try {
    const { data: lockData } = await supabaseAdmin
      .from('delivery_batch_locks')
      .insert({ id: crypto.randomUUID() })
      .select('id')
      .single();

    if (!lockData) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'concurrent execution' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    lockId = lockData.id;

    const today = new Date().toISOString().split('T')[0];
    const { data: messages, error: queryError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .lte('scheduled_date', today)
      .eq('status', 'pending')
      .limit(BATCH_SIZE);

    if (queryError) {
      throw new Error(`Failed to query messages: ${queryError.message}`);
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, delivered: 0, failed: 0, stoppedEarly: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    const result = await processMessageBatch(supabaseAdmin, messages, startTime);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Process delivery error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    if (lockId) {
      try {
        await supabaseAdmin.from('delivery_batch_locks').delete().eq('id', lockId);
      } catch (error) {
        console.error(JSON.stringify({
          event: 'BATCH_LOCK_RELEASE_FAILED',
          lock_id: lockId,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }
  }
});
