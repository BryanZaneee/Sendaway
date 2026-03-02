import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub Deno global before importing cron-auth (Deno.env.get is only called at runtime, not import time)
const mockEnvGet = vi.fn<(key: string) => string | undefined>();
vi.stubGlobal('Deno', { env: { get: mockEnvGet } });

import { verifyCronSecret } from '../cron-auth.ts';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers });
}

describe('verifyCronSecret', () => {
  beforeEach(() => {
    mockEnvGet.mockReset();
  });

  it('returns true when header matches secret', () => {
    mockEnvGet.mockReturnValue('my-secret');
    const req = makeRequest({ 'x-cron-secret': 'my-secret' });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it('returns false when header does not match', () => {
    mockEnvGet.mockReturnValue('my-secret');
    const req = makeRequest({ 'x-cron-secret': 'wrong-secret' });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('returns false when header is missing', () => {
    mockEnvGet.mockReturnValue('my-secret');
    const req = makeRequest();
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('returns false when CRON_SECRET env var is not set', () => {
    mockEnvGet.mockReturnValue(undefined);
    const req = makeRequest({ 'x-cron-secret': 'any-value' });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('returns false when CRON_SECRET env var is empty string', () => {
    mockEnvGet.mockReturnValue('');
    const req = makeRequest({ 'x-cron-secret': '' });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it('handles case-insensitive header names', () => {
    mockEnvGet.mockReturnValue('my-secret');
    const req = makeRequest({ 'X-Cron-Secret': 'my-secret' });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it('returns false when values differ by casing', () => {
    mockEnvGet.mockReturnValue('my-secret');
    const req = makeRequest({ 'x-cron-secret': 'My-Secret' });
    expect(verifyCronSecret(req)).toBe(false);
  });
});
