import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

const mockRange = vi.fn();

vi.mock('../toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('../../config/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: mockRange,
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../services/auth.service', () => ({
  authService: {
    onAuthStateChange: vi.fn(),
    getUser: vi.fn(() => ({ id: 'user-1' })),
  },
}));

describe('MessagesDashboard duplicate messages race condition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Set up minimal DOM
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="messagesDashboard"></div></body></html>');
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement as typeof HTMLElement;
  });

  it('second concurrent show() is skipped while first is in progress', async () => {
    const { messagesDashboard } = await import('../messages-dashboard');
    messagesDashboard.init();

    let resolveFirst!: (value: unknown) => void;
    mockRange.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    // Fire two concurrent show() calls
    const first = messagesDashboard.show();
    const second = messagesDashboard.show();

    // Resolve the first call
    resolveFirst({ data: [], error: null });

    await first;
    await second;

    // fetchMessages should only have been called once (range called once)
    expect(mockRange).toHaveBeenCalledTimes(1);
  });
});
