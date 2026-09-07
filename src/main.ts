import {
  Capsule, countdown, dateMonthsFromNow, decodeLink, encodeLink, formatDate,
  icsFor, isUnlocked, loadVault, remove, seal, validate,
} from './vault';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- tiny helpers ----

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // user text is untrusted: never innerHTML
  return e;
}

function toast(msg: string, error = false): void {
  const t = el('div', 'toast' + (error ? ' error' : ''), msg);
  t.onclick = () => t.remove();
  $('toasts').append(t);
  setTimeout(() => t.remove(), 4000);
}

function linkFor(c: Pick<Capsule, 't' | 'd' | 'f'>): string {
  return `${location.origin}${location.pathname}#m=${encodeLink(c)}`;
}

// Every live countdown registers here; one interval ticks them all.
const tickers = new Set<() => void>();
setInterval(() => tickers.forEach((fn) => fn()), 1000);

function timerEl(d: string, onUnlock: () => void): HTMLElement {
  const t = el('span', 'timer');
  const tick = () => {
    t.textContent = countdown(d);
    if (isUnlocked(d)) { tickers.delete(tick); onUnlock(); }
  };
  tick();
  tickers.add(tick);
  return t;
}

// ---- letter card (opened or locked) ----

function letter(c: Pick<Capsule, 't' | 'd' | 'f'>): HTMLElement {
  const card = el('div', 'card letter');
  const head = el('div', 'letter-head');
  const body = el('div', 'letter-body');
  card.append(head, body);

  if (isUnlocked(c.d)) {
    head.append(el('div', 'seal', '✓'), el('h3', '', 'Opened'));
    body.append(el('p', '', c.t));
    body.append(el('span', 'badge', `Sealed until ${formatDate(c.d)}${c.f ? ` · from ${c.f}` : ''}`));
  } else {
    head.classList.add('locked');
    head.append(el('div', 'seal', '🔒'), el('h3', '', c.f ? `Sealed by ${c.f}` : 'Sealed'));
    body.append(timerEl(c.d, () => card.replaceWith(letter(c))));
    body.append(el('p', 'muted', `Opens ${formatDate(c.d)}. No peeking.`));
  }
  return card;
}

// ---- vault list ----

function renderVault(): void {
  const all = loadVault();
  const locked = all.filter((c) => !isUnlocked(c.d));
  const ready = all.filter((c) => isUnlocked(c.d));
  $('empty').hidden = all.length > 0;
  $('locked-group').hidden = locked.length === 0;
  $('ready-group').hidden = ready.length === 0;
  $('locked').replaceChildren(...locked.map(capsuleRow));
  $('ready').replaceChildren(...ready.map(capsuleRow));
}

function capsuleRow(c: Capsule): HTMLElement {
  const open = isUnlocked(c.d);
  const row = el('div', 'card capsule' + (open ? ' open' : ''));
  const del = el('button', 'link-btn', 'Delete');
  del.onclick = (e) => { e.stopPropagation(); remove(c.id); renderVault(); toast('Gone. Future you will never know.'); };
  const meta = el('div', 'meta');
  meta.append(el('strong', '', open ? 'Ready to open' : `Opens ${formatDate(c.d)}`));
  meta.append(el('span', '', `${c.f ? `From ${c.f} · ` : ''}sealed ${new Date(c.c).toLocaleDateString()}`));
  row.append(meta);

  if (open) {
    row.append(el('span', 'muted', 'Tap to read'));
    row.onclick = () => {
      const opened = letter(c);
      opened.querySelector('.letter-body')!.append(del);
      row.replaceWith(opened);
    };
  } else {
    row.append(timerEl(c.d, renderVault));
  }

  row.append(del);
  return row;
}

// ---- compose form ----

function initCompose(): void {
  const text = $<HTMLTextAreaElement>('text');
  const date = $<HTMLInputElement>('date');
  const from = $<HTMLInputElement>('from');
  const chips = [...$('chips').querySelectorAll<HTMLButtonElement>('.chip')];

  text.oninput = () => ($('count').textContent = String(text.value.length));
  date.min = dateMonthsFromNow(0);

  chips.forEach((chip) => {
    chip.onclick = () => {
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      if (chip.dataset.custom !== undefined) {
        date.hidden = false;
        date.showPicker?.();
      } else {
        date.hidden = true;
        date.value = dateMonthsFromNow(Number(chip.dataset.months));
      }
    };
  });

  $<HTMLFormElement>('compose').onsubmit = (e) => {
    e.preventDefault();
    const err = validate(text.value, date.value);
    if (err) return toast(err, true);

    const c = seal({ t: text.value, d: date.value, f: from.value.trim() || undefined });
    const link = linkFor(c);
    $<HTMLInputElement>('link').value = link;
    $<HTMLAnchorElement>('ics').href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsFor(c, link));
    $('compose').hidden = true;
    $('sealed').hidden = false;
    toast(`Sealed. See you on ${formatDate(c.d)}.`);
    renderVault();
  };

  $('copy').onclick = async () => {
    const link = $<HTMLInputElement>('link');
    try {
      await navigator.clipboard.writeText(link.value);
      toast('Copied. Put it somewhere you\'ll find it.');
    } catch {
      link.select();
      toast('Select and copy the link above.', true);
    }
  };

  $('again').onclick = () => {
    text.value = ''; from.value = ''; date.value = ''; date.hidden = true;
    $('count').textContent = '0';
    chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
    $('sealed').hidden = true;
    $('compose').hidden = false;
    text.focus();
  };
}

// ---- share link on arrival ----

function initOpened(): void {
  const m = new URLSearchParams(location.hash.slice(1)).get('m');
  if (!m) return;
  const c = decodeLink(m);
  if (!c) return toast('That link is broken. Past you was sloppy.', true);

  const wrap = $('opened');
  wrap.hidden = false;
  wrap.append(letter(c));
  const actions = el('div', 'opened-actions');
  const save = el('button', 'btn small ghost', 'Save to my vault');
  save.onclick = () => { seal(c); renderVault(); save.replaceWith(el('span', 'muted', 'Saved to your vault.')); };
  actions.append(save);
  wrap.append(actions);
}

// ---- scroll reveal ----

function initReveal(): void {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -40px' });
  document.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
}

initCompose();
initOpened();
renderVault();
initReveal();
