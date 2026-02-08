import { describe, it, expect, vi } from 'vitest';

vi.mock('../toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('../../config/supabase', () => ({
  supabase: {},
}));

vi.mock('../../services/auth.service', () => ({
  authService: {
    onAuthStateChange: vi.fn(),
    getUser: vi.fn(),
  },
}));

import { getMessageGroup } from '../messages-dashboard';
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

describe('getMessageGroup', () => {
  it('returns delivered when status is delivered', () => {
    const msg = makeMessage({ status: 'delivered' });
    expect(getMessageGroup(msg)).toBe('delivered');
  });

  it('returns unlocked when date has passed and status is pending', () => {
    const msg = makeMessage({ scheduled_date: '2020-01-01', status: 'pending' });
    expect(getMessageGroup(msg)).toBe('unlocked');
  });

  it('returns locked when date is in the future and status is pending', () => {
    const msg = makeMessage({ scheduled_date: '2099-12-31', status: 'pending' });
    expect(getMessageGroup(msg)).toBe('locked');
  });

  it('delivered takes priority over unlocked', () => {
    const msg = makeMessage({ scheduled_date: '2020-01-01', status: 'delivered' });
    expect(getMessageGroup(msg)).toBe('delivered');
  });
});
