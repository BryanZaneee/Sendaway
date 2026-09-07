// Pure logic. No DOM here so it runs in node for tests.

export const MAX_TEXT = 4000;
const STORAGE_KEY = 'ftrmsg.vault';

/** A sealed message. Short keys because it also travels in a URL. */
export interface Capsule {
  id: string;
  t: string; // text
  d: string; // unlock date, YYYY-MM-DD (local)
  f?: string; // from
  c: number; // created, epoch ms
}

// ---- dates ----

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dateMonthsFromNow(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return toDateString(date);
}

/** Local midnight on the unlock date. */
export function unlockAt(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function isUnlocked(d: string, now: Date = new Date()): boolean {
  return now.getTime() >= unlockAt(d).getTime();
}

export function formatDate(d: string): string {
  return unlockAt(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function countdown(d: string, now: Date = new Date()): string {
  const diff = Math.max(0, unlockAt(d).getTime() - now.getTime());
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${days}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// ---- validation ----

export function validate(text: string, d: string): string | null {
  if (!text.trim()) return 'Write something first. Even "hi" counts.';
  if (text.length > MAX_TEXT) return `Keep it under ${MAX_TEXT} characters.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Pick a date.';
  if (isUnlocked(d)) return 'That date already happened. Aim forward.';
  return null;
}

// ---- share links ----
// ponytail: sealed, not encrypted. Anyone with the link and dev tools can peek.
// That is the ceiling of a serverless app and the FAQ says so.

function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function encodeLink(c: Pick<Capsule, 't' | 'd' | 'f'>): string {
  const payload: Record<string, string> = { t: c.t, d: c.d };
  if (c.f) payload.f = c.f;
  return b64url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeLink(s: string): Pick<Capsule, 't' | 'd' | 'f'> | null {
  try {
    const o = JSON.parse(new TextDecoder().decode(unb64url(s)));
    if (typeof o.t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.d)) return null;
    if (!o.t || o.t.length > MAX_TEXT) return null;
    return { t: o.t, d: o.d, f: typeof o.f === 'string' && o.f ? o.f.slice(0, 80) : undefined };
  } catch {
    return null;
  }
}

// ---- storage ----

export function loadVault(store: Storage = localStorage): Capsule[] {
  try {
    const list = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveVault(list: Capsule[], store: Storage = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function seal(c: Pick<Capsule, 't' | 'd' | 'f'>, store: Storage = localStorage): Capsule {
  const capsule: Capsule = { id: crypto.randomUUID(), t: c.t, d: c.d, c: Date.now() };
  if (c.f) capsule.f = c.f;
  saveVault([capsule, ...loadVault(store)], store);
  return capsule;
}

export function remove(id: string, store: Storage = localStorage): void {
  saveVault(loadVault(store).filter((c) => c.id !== id), store);
}

// ---- calendar reminder ----

export function icsFor(c: Pick<Capsule, 'd'>, link: string): string {
  const day = c.d.replace(/-/g, '');
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => '\\' + m);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FTRMSG//EN',
    'BEGIN:VEVENT',
    `UID:${day}-${Math.random().toString(36).slice(2)}@ftrmsg.com`,
    `DTSTART;VALUE=DATE:${day}`,
    'SUMMARY:Open your FTRMSG message',
    `DESCRIPTION:${esc('Past you left something here: ' + link)}`,
    `URL:${link}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
