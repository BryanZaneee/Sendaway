import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateEmail,
  escapeHtml,
  formatScheduledDate,
  getRetryTime,
  getMessage,
  buildScheduledConfirmationEmail,
  buildDeliveryEmail,
  ValidationError,
} from '../email-utils.ts';
import type { MessageSummary, NotificationRow, DeliveryMessage } from '../email-utils.ts';

// ---------------------------------------------------------------------------
// validateEmail
// ---------------------------------------------------------------------------
describe('validateEmail', () => {
  it('accepts a standard email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(validateEmail('user@mail.example.com')).toBe(true);
  });

  it('accepts email with + in local part', () => {
    expect(validateEmail('user+tag@example.com')).toBe(true);
  });

  it('accepts email with dots in local part', () => {
    expect(validateEmail('first.last@example.com')).toBe(true);
  });

  it('accepts 2-char TLD', () => {
    expect(validateEmail('user@example.uk')).toBe(true);
  });

  it('accepts 10-char TLD', () => {
    expect(validateEmail('user@example.technology')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('rejects string without @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(validateEmail('user@')).toBe(false);
  });

  it('rejects missing TLD', () => {
    expect(validateEmail('user@example')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(validateEmail('user @example.com')).toBe(false);
  });

  it('rejects double @', () => {
    expect(validateEmail('user@@example.com')).toBe(false);
  });

  it('rejects 1-char TLD', () => {
    expect(validateEmail('user@example.a')).toBe(false);
  });

  it('rejects 11-char TLD', () => {
    expect(validateEmail('user@example.abcdefghijk')).toBe(false);
  });

  it('rejects TLD with numbers', () => {
    expect(validateEmail('user@example.c0m')).toBe(false);
  });

  it('rejects missing local part', () => {
    expect(validateEmail('@example.com')).toBe(false);
  });

  it('rejects just @', () => {
    expect(validateEmail('@')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });

  it('escapes double quote', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });

  it('escapes single quote', () => {
    expect(escapeHtml("a'b")).toBe('a&#39;b');
  });

  it('escapes all entities combined', () => {
    expect(escapeHtml('<script>alert("xss" & \'hi\')</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;hi&#39;)&lt;/script&gt;',
    );
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns plain string unchanged', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('handles XSS script injection', () => {
    const result = escapeHtml('<img src=x onerror="alert(1)">');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('double-escapes already escaped entities', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

// ---------------------------------------------------------------------------
// formatScheduledDate
// ---------------------------------------------------------------------------
describe('formatScheduledDate', () => {
  it('formats a standard date', () => {
    expect(formatScheduledDate('2025-06-15')).toBe('June 15, 2025');
  });

  it('formats January 1', () => {
    expect(formatScheduledDate('2025-01-01')).toBe('January 1, 2025');
  });

  it('formats December 31', () => {
    expect(formatScheduledDate('2025-12-31')).toBe('December 31, 2025');
  });

  it('formats leap day', () => {
    expect(formatScheduledDate('2024-02-29')).toBe('February 29, 2024');
  });

  it('returns original string for invalid date', () => {
    expect(formatScheduledDate('not-a-date')).toBe('not-a-date');
  });

  it('returns original string for empty input', () => {
    expect(formatScheduledDate('')).toBe('');
  });

  it('uses UTC (no timezone drift)', () => {
    // 2025-03-15 should always be March 15, regardless of local timezone
    expect(formatScheduledDate('2025-03-15')).toBe('March 15, 2025');
  });
});

// ---------------------------------------------------------------------------
// getRetryTime
// ---------------------------------------------------------------------------
describe('getRetryTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 5 minutes for attempt 1', () => {
    expect(getRetryTime(1)).toBe('2025-01-01T00:05:00.000Z');
  });

  it('returns 10 minutes for attempt 2', () => {
    expect(getRetryTime(2)).toBe('2025-01-01T00:10:00.000Z');
  });

  it('returns 20 minutes for attempt 3', () => {
    expect(getRetryTime(3)).toBe('2025-01-01T00:20:00.000Z');
  });

  it('returns 40 minutes for attempt 4', () => {
    expect(getRetryTime(4)).toBe('2025-01-01T00:40:00.000Z');
  });

  it('caps at 720 minutes for high attempt counts', () => {
    // attempt 10: 5 * 2^9 = 2560, capped to 720 min = 12 hours
    expect(getRetryTime(10)).toBe('2025-01-01T12:00:00.000Z');
  });

  it('returns 5 minutes for attempt 0 (edge case)', () => {
    // Math.max(0-1, 0) = 0, 5 * 2^0 = 5
    expect(getRetryTime(0)).toBe('2025-01-01T00:05:00.000Z');
  });

  it('returns valid ISO 8601 string', () => {
    const result = getRetryTime(1);
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// getMessage
// ---------------------------------------------------------------------------
describe('getMessage', () => {
  const baseSummary: MessageSummary = {
    id: 'msg-1',
    message_text: 'Hello',
    scheduled_date: '2025-06-15',
    delivery_email: 'test@example.com',
  };

  const baseNotification: NotificationRow = {
    id: 'notif-1',
    message_id: 'msg-1',
    notification_type: 'scheduled_confirmation',
    recipient_email: 'user@example.com',
    attempt_count: 0,
    max_attempts: 5,
    messages: baseSummary,
  };

  it('returns message when messages is a single object', () => {
    expect(getMessage(baseNotification)).toEqual(baseSummary);
  });

  it('returns first element when messages is an array', () => {
    const notification = { ...baseNotification, messages: [baseSummary] };
    expect(getMessage(notification)).toEqual(baseSummary);
  });

  it('returns first element when messages array has multiple items', () => {
    const second = { ...baseSummary, id: 'msg-2' };
    const notification = { ...baseNotification, messages: [baseSummary, second] };
    expect(getMessage(notification)).toEqual(baseSummary);
  });

  it('throws on empty array', () => {
    const notification = { ...baseNotification, messages: [] };
    expect(() => getMessage(notification)).toThrow('Missing message relation');
  });

  it('throws on null', () => {
    const notification = { ...baseNotification, messages: null };
    expect(() => getMessage(notification)).toThrow('Missing message relation');
  });
});

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------
describe('ValidationError', () => {
  it('is an instance of Error', () => {
    expect(new ValidationError('test')).toBeInstanceOf(Error);
  });

  it('has name "ValidationError"', () => {
    expect(new ValidationError('test').name).toBe('ValidationError');
  });

  it('preserves the message', () => {
    expect(new ValidationError('something went wrong').message).toBe('something went wrong');
  });
});

// ---------------------------------------------------------------------------
// buildScheduledConfirmationEmail
// ---------------------------------------------------------------------------
describe('buildScheduledConfirmationEmail', () => {
  const testMessage: MessageSummary = {
    id: 'msg-1',
    message_text: 'Hello future self!',
    scheduled_date: '2025-12-25',
    delivery_email: 'recipient@example.com',
  };

  it('returns correct subject', () => {
    const { subject } = buildScheduledConfirmationEmail(testMessage);
    expect(subject).toBe('Your FtrMsg message has been scheduled!');
  });

  it('contains formatted date', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage);
    expect(html).toContain('December 25, 2025');
  });

  it('HTML-escapes message text', () => {
    const msg = { ...testMessage, message_text: '<script>alert("xss")</script>' };
    const { html } = buildScheduledConfirmationEmail(msg);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('truncates preview at 240 chars with ellipsis', () => {
    const longText = 'A'.repeat(300);
    const msg = { ...testMessage, message_text: longText };
    const { html } = buildScheduledConfirmationEmail(msg);
    expect(html).toContain('A'.repeat(240) + '...');
  });

  it('does not add ellipsis for short messages', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage);
    expect(html).toContain('Hello future self!');
    expect(html).not.toContain('Hello future self!...');
  });

  it('contains escaped delivery email', () => {
    const msg = { ...testMessage, delivery_email: 'test&special@example.com' };
    const { html } = buildScheduledConfirmationEmail(msg);
    expect(html).toContain('test&amp;special@example.com');
  });

  it('contains the appUrl link', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage, 'https://custom.app');
    expect(html).toContain('href="https://custom.app"');
  });

  it('uses default appUrl when not provided', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage);
    expect(html).toContain('href="https://ftrmsg.com"');
  });

  it('uses custom appUrl when provided', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage, 'https://staging.ftrmsg.com');
    expect(html).toContain('href="https://staging.ftrmsg.com"');
  });

  it('contains FTRMSG branding', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage);
    expect(html).toContain('FTRMSG');
  });

  it('contains DOCTYPE', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('contains "Manage your scheduled messages" link text', () => {
    const { html } = buildScheduledConfirmationEmail(testMessage);
    expect(html).toContain('Manage your scheduled messages');
  });
});

// ---------------------------------------------------------------------------
// buildDeliveryEmail
// ---------------------------------------------------------------------------
describe('buildDeliveryEmail', () => {
  const testMessage: DeliveryMessage = {
    id: 'msg-1',
    user_id: 'user-1',
    message_text: 'Hello from the past!',
    video_storage_path: null,
    delivery_email: 'recipient@example.com',
    scheduled_date: '2025-06-15',
    delivery_token: 'token-abc',
  };

  it('returns correct subject', () => {
    const { subject } = buildDeliveryEmail(testMessage);
    expect(subject).toBe('Your FtrMsg message has arrived!');
  });

  it('throws ValidationError for invalid email', () => {
    const msg = { ...testMessage, delivery_email: 'not-an-email' };
    expect(() => buildDeliveryEmail(msg)).toThrow(ValidationError);
  });

  it('throws ValidationError for empty email', () => {
    const msg = { ...testMessage, delivery_email: '' };
    expect(() => buildDeliveryEmail(msg)).toThrow(ValidationError);
  });

  it('contains message text in HTML', () => {
    const { html } = buildDeliveryEmail(testMessage);
    expect(html).toContain('Hello from the past!');
  });

  it('defaults null message_text to empty string', () => {
    const msg = { ...testMessage, message_text: null as unknown as string };
    const { html } = buildDeliveryEmail(msg);
    // Should not throw; empty string appears in output
    expect(html).toContain('white-space: pre-wrap;"></p>');
  });

  it('includes video section when videoUrl is provided', () => {
    const { html } = buildDeliveryEmail(testMessage, 'https://example.com/video.mp4');
    expect(html).toContain('Video Message Attached');
    expect(html).toContain('Watch Video');
    expect(html).toContain('href="https://example.com/video.mp4"');
  });

  it('omits video section when videoUrl is undefined', () => {
    const { html } = buildDeliveryEmail(testMessage);
    expect(html).not.toContain('Video Message Attached');
  });

  it('omits video section when videoUrl is null', () => {
    const { html } = buildDeliveryEmail(testMessage, null);
    expect(html).not.toContain('Video Message Attached');
  });

  it('contains 7-day expiry text when video is present', () => {
    const { html } = buildDeliveryEmail(testMessage, 'https://example.com/video.mp4');
    expect(html).toContain('Video link expires in 7 days');
  });

  it('contains appUrl link', () => {
    const { html } = buildDeliveryEmail(testMessage, null, 'https://custom.app');
    expect(html).toContain('href="https://custom.app"');
  });

  it('uses default appUrl when not provided', () => {
    const { html } = buildDeliveryEmail(testMessage);
    expect(html).toContain('href="https://ftrmsg.com"');
  });

  it('uses custom appUrl', () => {
    const { html } = buildDeliveryEmail(testMessage, null, 'https://staging.ftrmsg.com');
    expect(html).toContain('href="https://staging.ftrmsg.com"');
  });

  it('contains FTRMSG branding', () => {
    const { html } = buildDeliveryEmail(testMessage);
    expect(html).toContain('FTRMSG');
  });

  it('contains DOCTYPE', () => {
    const { html } = buildDeliveryEmail(testMessage);
    expect(html).toContain('<!DOCTYPE html>');
  });
});
