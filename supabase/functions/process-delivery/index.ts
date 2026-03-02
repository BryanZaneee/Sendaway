import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Resend } from 'https://esm.sh/resend@2.1.0';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  buildDeliveryEmail,
  ValidationError,
} from '../_shared/email-utils.ts';
import type { DeliveryMessage } from '../_shared/email-utils.ts';
import {
  DELIVERY_BATCH_SIZE as BATCH_SIZE,
  DELIVERY_TIMEOUT_MS as TIMEOUT_MS,
  DELIVERY_RATE_LIMIT_MS as RATE_LIMIT_DELAY_MS,
  DELIVERY_MAX_ATTEMPTS,
  VIDEO_SIGNED_URL_EXPIRY_SECONDS,
} from '../_shared/constants.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

interface BatchResult {
  processed: number;
  delivered: number;
  failed: number;
  stoppedEarly: boolean;
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
  message: DeliveryMessage,
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
  message: DeliveryMessage
): Promise<ComposedEmail> {
  let videoUrl: string | null = null;
  if (message.video_storage_path) {
    const { data: signedUrlData } = await supabase.storage
      .from('message-videos')
      .createSignedUrl(message.video_storage_path, VIDEO_SIGNED_URL_EXPIRY_SECONDS);
    videoUrl = signedUrlData?.signedUrl ?? null;
  }

  const appUrl = Deno.env.get('APP_URL') || 'https://ftrmsg.com';
  return buildDeliveryEmail(message, videoUrl, appUrl);
}

/**
 * Sends email via Resend, updates delivery_logs and messages tables.
 * Logs error if messages.status update fails but delivery succeeded.
 */
async function executeDelivery(
  supabase: ReturnType<typeof createClient>,
  message: DeliveryMessage,
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
  message: DeliveryMessage,
  fromEmail: string
): Promise<ProcessMessageResult> {
  let attemptNumber: number | null = null;

  try {
    const prep = await prepareDelivery(supabase, message.id);
    if (prep.skip) {
      return { status: 'skipped' };
    }
    attemptNumber = prep.attemptNumber;

    const composed = await composeDelivery(supabase, message);
    await executeDelivery(supabase, message, composed, attemptNumber, fromEmail);

    return { status: 'delivered' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isValidationError = error instanceof ValidationError;
    const exceededMaxAttempts = attemptNumber !== null && attemptNumber >= DELIVERY_MAX_ATTEMPTS;
    const shouldMarkPermanentlyFailed = isValidationError || exceededMaxAttempts;

    if (attemptNumber !== null) {
      await supabase
        .from('delivery_logs')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('message_id', message.id)
        .eq('attempt_number', attemptNumber);
    }

    if (shouldMarkPermanentlyFailed) {
      await supabase
        .from('messages')
        .update({ status: 'failed' })
        .eq('id', message.id);
    }

    return { status: 'failed' };
  }
}

/**
 * Orchestrates sequential message processing with early termination on timeout.
 * Aggregates delivered/failed counts and applies rate limiting between sends.
 */
async function processMessageBatch(
  supabase: ReturnType<typeof createClient>,
  messages: DeliveryMessage[],
  startTime: number
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    delivered: 0,
    failed: 0,
    stoppedEarly: false,
  };

  const fromEmail = Deno.env.get('FROM_EMAIL') || 'FtrMsg <noreply@ftrmsg.com>';

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
