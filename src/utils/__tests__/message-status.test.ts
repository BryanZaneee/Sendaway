import { describe, it, expect } from 'vitest';
import { isMessageUnlocked } from '../message-status';
import type { Message } from '../../types/database';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'test-id',
    user_id: 'user-1',
    message_text: 'hello',
    video_storage_path: null,
    video_size_bytes: 0,
    video_duration_seconds: 0,
    delivery_email: 'test@example.com',
    scheduled_date: '2099-12-31',
    status: 'pending',
    delivery_token: 'token-1',
    delivered_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('isMessageUnlocked', () => {
  it('returns true when scheduled_date is in the past', () => {
    const msg = makeMessage({ scheduled_date: '2020-01-01' });
    expect(isMessageUnlocked(msg)).toBe(true);
  });

  it('returns true when scheduled_date is today', () => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const msg = makeMessage({ scheduled_date: dateStr });
    expect(isMessageUnlocked(msg)).toBe(true);
  });

  it('returns false when scheduled_date is in the future', () => {
    const msg = makeMessage({ scheduled_date: '2099-12-31' });
    expect(isMessageUnlocked(msg)).toBe(false);
  });

  it('returns true when status is delivered regardless of date', () => {
    const msg = makeMessage({ scheduled_date: '2099-12-31', status: 'delivered' });
    expect(isMessageUnlocked(msg)).toBe(true);
  });
});
