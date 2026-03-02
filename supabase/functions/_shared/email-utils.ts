// Pure functions and types extracted from process-notifications and process-delivery Edge Functions.
// No Deno APIs — all environment-dependent values are passed as parameters.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface MessageSummary {
  id: string;
  message_text: string;
  scheduled_date: string;
  delivery_email: string;
}

export interface NotificationRow {
  id: string;
  message_id: string;
  notification_type: 'scheduled_confirmation';
  recipient_email: string;
  attempt_count: number;
  max_attempts: number;
  messages: MessageSummary | MessageSummary[] | null;
}

export interface DeliveryMessage {
  id: string;
  user_id: string;
  message_text: string;
  video_storage_path: string | null;
  delivery_email: string;
  scheduled_date: string;
  delivery_token: string;
}

export function validateEmail(email: string): boolean {
  if (!email) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,10}$/;
  return emailPattern.test(email);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatScheduledDate(dateString: string): string {
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

export function getRetryTime(attemptCount: number): string {
  const backoffMinutes = Math.min(5 * (2 ** Math.max(attemptCount - 1, 0)), 720);
  return new Date(Date.now() + backoffMinutes * 60_000).toISOString();
}

export function getMessage(notification: NotificationRow): MessageSummary {
  if (Array.isArray(notification.messages)) {
    const first = notification.messages[0];
    if (first) return first;
  } else if (notification.messages) {
    return notification.messages;
  }

  throw new Error(`Missing message relation for notification ${notification.id}`);
}

export function buildScheduledConfirmationEmail(
  message: MessageSummary,
  appUrl: string = 'https://ftrmsg.com',
): { subject: string; html: string } {
  const subject = 'Your FtrMsg message has been scheduled!';
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

export function buildDeliveryEmail(
  message: DeliveryMessage,
  videoUrl?: string | null,
  appUrl: string = 'https://ftrmsg.com',
): { subject: string; html: string } {
  if (!validateEmail(message.delivery_email)) {
    throw new ValidationError(`Invalid delivery email: ${message.delivery_email}`);
  }

  const messageText = message.message_text ?? '';
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
