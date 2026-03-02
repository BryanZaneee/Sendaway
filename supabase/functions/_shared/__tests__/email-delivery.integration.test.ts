import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildScheduledConfirmationEmail, buildDeliveryEmail } from '../email-utils.ts';
import type { MessageSummary, DeliveryMessage } from '../email-utils.ts';

const RECIPIENT = 'bzane09@gmail.com';

let resendModule: typeof import('resend');
let resend: InstanceType<typeof import('resend').Resend>;
let fromEmail: string;
let envLoaded = false;

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeAll(async () => {
  try {
    const env = loadEnv();
    const apiKey = env.RESEND_API_KEY;
    const rawFrom = env.FROM_EMAIL || 'noreply@ftrmsg.com';
    fromEmail = rawFrom.includes('<') ? rawFrom : `FtrMsg <${rawFrom}>`;
    if (!apiKey) {
      console.warn('RESEND_API_KEY not found in .env.local — skipping integration tests');
      return;
    }
    resendModule = await import('resend');
    resend = new resendModule.Resend(apiKey);
    envLoaded = true;
  } catch {
    console.warn('.env.local not found — skipping integration tests');
  }
});

afterEach(async () => {
  // Respect Resend rate limit: 1 email/second
  await sleep(1500);
});

describe('email delivery integration', () => {
  it('sends sign-up confirmation email', async () => {
    if (!envLoaded) return;

    const templatePath = resolve(process.cwd(), 'supabase/templates/confirmation.html');
    const html = readFileSync(templatePath, 'utf-8')
      .replace('{{ .ConfirmationURL }}', 'https://ftrmsg.com/auth/confirm?token=test-token-123')
      .replace('{{ .SiteURL }}', 'https://ftrmsg.com');

    const subject = '[TEST] Confirm Your FtrMsg Account';
    const response = await resend.emails.send({
      from: fromEmail,
      to: RECIPIENT,
      subject,
      html,
    });

    expect(response.error, `Resend API error: ${response.error?.message}`).toBeNull();
    expect(response.data?.id).toBeTruthy();
  }, 15_000);

  it('sends password reset email', async () => {
    if (!envLoaded) return;

    const templatePath = resolve(process.cwd(), 'supabase/templates/recovery.html');
    const html = readFileSync(templatePath, 'utf-8')
      .replace('{{ .ConfirmationURL }}', 'https://ftrmsg.com/auth/reset?token=test-token-456')
      .replace('{{ .SiteURL }}', 'https://ftrmsg.com');

    const subject = '[TEST] Reset Your FtrMsg Password';
    const response = await resend.emails.send({
      from: fromEmail,
      to: RECIPIENT,
      subject,
      html,
    });

    expect(response.error, `Resend API error: ${response.error?.message}`).toBeNull();
    expect(response.data?.id).toBeTruthy();
  }, 15_000);

  it('sends message scheduled confirmation email', async () => {
    if (!envLoaded) return;

    const testMessage: MessageSummary = {
      id: 'test-msg-001',
      message_text:
        "Hey future me! Remember that time we went skydiving? I hope by now you've done it again. Life is short — keep jumping.",
      scheduled_date: '2026-12-25',
      delivery_email: RECIPIENT,
    };

    const { subject, html } = buildScheduledConfirmationEmail(testMessage, 'https://ftrmsg.com');
    const response = await resend.emails.send({
      from: fromEmail,
      to: RECIPIENT,
      subject: `[TEST] ${subject}`,
      html,
    });

    expect(response.error, `Resend API error: ${response.error?.message}`).toBeNull();
    expect(response.data?.id).toBeTruthy();
    expect(subject).toBe('Your FtrMsg message has been scheduled!');
  }, 15_000);

  it('sends message delivery email (text only)', async () => {
    if (!envLoaded) return;

    const testMessage: DeliveryMessage = {
      id: 'test-msg-002',
      user_id: 'test-user-001',
      message_text:
        "Dear future self,\n\nIf you're reading this, you made it. I'm proud of you.\n\nWith love,\nYour past self",
      video_storage_path: null,
      delivery_email: RECIPIENT,
      scheduled_date: '2026-03-02',
      delivery_token: 'test-token-789',
    };

    const { subject, html } = buildDeliveryEmail(testMessage, null, 'https://ftrmsg.com');
    const response = await resend.emails.send({
      from: fromEmail,
      to: RECIPIENT,
      subject: `[TEST] ${subject}`,
      html,
    });

    expect(response.error, `Resend API error: ${response.error?.message}`).toBeNull();
    expect(response.data?.id).toBeTruthy();
    expect(subject).toBe('Your FtrMsg message has arrived!');
  }, 15_000);

  it('sends message delivery email (with video link)', async () => {
    if (!envLoaded) return;

    const testMessage: DeliveryMessage = {
      id: 'test-msg-003',
      user_id: 'test-user-001',
      message_text:
        'I recorded this video just for you. Watch it and remember where you came from.',
      video_storage_path: 'test-user-001/test-video.mp4',
      delivery_email: RECIPIENT,
      scheduled_date: '2026-03-02',
      delivery_token: 'test-token-abc',
    };

    const fakeVideoUrl = 'https://ftrmsg.com/test-video-link?token=signed-url-example';
    const { subject, html } = buildDeliveryEmail(testMessage, fakeVideoUrl, 'https://ftrmsg.com');
    const response = await resend.emails.send({
      from: fromEmail,
      to: RECIPIENT,
      subject: `[TEST] ${subject}`,
      html,
    });

    expect(response.error, `Resend API error: ${response.error?.message}`).toBeNull();
    expect(response.data?.id).toBeTruthy();
    expect(subject).toBe('Your FtrMsg message has arrived!');
  }, 15_000);
});
