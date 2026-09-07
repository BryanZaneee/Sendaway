# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

FTRMSG: a free, browser-only time capsule. One static page. Messages live in
`localStorage` and in share links (URL fragment). No backend, no accounts, no
payments. The Supabase/Stripe/Resend version was removed in September 2026;
do not reintroduce a server for anything.

## Commands

```bash
npm run dev        # Vite on :3000
npm test           # vitest run (src/vault.test.ts)
npm run typecheck  # tsc --noEmit
npm run build      # tsc && vite build
```

## Files

| Path | Purpose |
|---|---|
| `index.html` | All markup. No inline styles or scripts. |
| `src/styles.css` | Watercolor design: tokens in `:root`, Playfair / Lora / Caveat from Google Fonts. |
| `src/main.ts` | Procedural DOM wiring. Builds elements with `createElement` + `textContent`. |
| `src/vault.ts` | Pure, DOM-free logic. Everything testable lives here. |
| `src/vault.test.ts` | The test file. Add cases here, not new files. |
| `vercel.json` | Apex → www redirect, CSP (`self` + Google Fonts only), security headers. |

## Invariants

1. **Message text is untrusted.** It can arrive from a stranger's link. Never
   put it through `innerHTML`; use `textContent`.
2. **Share links are sealed, not encrypted.** Don't claim otherwise in copy.
3. **Keep `vault.ts` DOM-free** so tests run in the node environment.
4. **CSP has no `unsafe-inline`.** New styles go in `styles.css`, new scripts
   in `main.ts`.
5. **Tone is lighthearted.** Copy should sound like a note between friends.

## Commits

Conventional commit prefix, subject ≤ 50 chars, body wrapped at 72. No
`Co-Authored-By` or generated-with trailers.
