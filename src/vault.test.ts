import { describe, expect, it } from 'vitest';
import { countdown, dateMonthsFromNow, decodeLink, encodeLink, isUnlocked, loadVault, seal, remove, validate } from './vault';

function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

describe('share link', () => {
  it('round-trips unicode and newlines', () => {
    const c = { t: 'Dear me,\n\nthe plant 🌱 is dead. — Past you', d: '2030-01-02', f: 'Bryan' };
    expect(decodeLink(encodeLink(c))).toEqual(c);
  });
  it('omits an empty from', () => {
    expect(decodeLink(encodeLink({ t: 'hi', d: '2030-01-02' }))).toEqual({ t: 'hi', d: '2030-01-02', f: undefined });
  });
  it('rejects garbage', () => {
    expect(decodeLink('not-base64!')).toBeNull();
    expect(decodeLink(btoa('{"t":1}'))).toBeNull();
    expect(decodeLink(btoa('{"t":"x","d":"soon"}'))).toBeNull();
  });
});

describe('dates', () => {
  it('unlocks at local midnight on the date', () => {
    expect(isUnlocked('2020-01-01')).toBe(true);
    expect(isUnlocked(dateMonthsFromNow(1))).toBe(false);
    expect(isUnlocked('2030-05-05', new Date(2030, 4, 5, 0, 0, 0))).toBe(true);
    expect(isUnlocked('2030-05-05', new Date(2030, 4, 4, 23, 59, 59))).toBe(false);
  });
  it('formats a countdown', () => {
    expect(countdown('2030-05-05', new Date(2030, 4, 3, 22, 30, 5))).toBe('1d 01:29:55');
    expect(countdown('2020-01-01')).toBe('0d 00:00:00');
  });
  it('dateMonthsFromNow is YYYY-MM-DD', () => {
    expect(dateMonthsFromNow(3)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('validate', () => {
  it('needs text and a future date', () => {
    expect(validate('', '2030-01-01')).toMatch(/Write/);
    expect(validate('x', '')).toMatch(/date/);
    expect(validate('x', '2020-01-01')).toMatch(/already/);
    expect(validate('x'.repeat(4001), '2030-01-01')).toMatch(/4000/);
    expect(validate('x', '2030-01-01')).toBeNull();
  });
});

describe('vault storage', () => {
  it('seals, lists newest first, removes', () => {
    const s = memStore();
    const a = seal({ t: 'a', d: '2030-01-01' }, s);
    const b = seal({ t: 'b', d: '2030-01-01', f: 'me' }, s);
    expect(loadVault(s).map((c) => c.id)).toEqual([b.id, a.id]);
    remove(a.id, s);
    expect(loadVault(s)).toHaveLength(1);
    expect(loadVault(s)[0].f).toBe('me');
  });
  it('survives corrupt storage', () => {
    const s = memStore();
    s.setItem('ftrmsg.vault', '{nope');
    expect(loadVault(s)).toEqual([]);
  });
});
