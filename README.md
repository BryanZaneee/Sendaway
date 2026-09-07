# FTRMSG

Write to your future self. Open it when it's time.

A free time capsule that lives entirely in the browser. Write a note, pick a
date, and it stays sealed until that day. No accounts, no servers, no payments.

Live at [ftrmsg.com](https://www.ftrmsg.com).

## How it works

- **Vault.** Sealed messages are stored in `localStorage` under `ftrmsg.vault`.
  The page groups them into "still sealed" (live countdown, text hidden) and
  "ready to open".
- **Share link.** Every sealed message also becomes a link:
  `https://www.ftrmsg.com/#m=<base64url JSON>`. The whole message travels in
  the URL fragment, so it never hits a server and survives a browser cleanup.
  Opening the link shows a countdown until the date, then the letter, with a
  "save to my vault" button.
- **Reminder.** The sealed panel offers an `.ics` file for the unlock day.

### Honest limits

- The lock is a promise, not encryption. Anyone with the link and developer
  tools can decode it early. The FAQ on the page says so.
- Clearing site data deletes the vault on that browser. The link is the backup.
- The unlock moment is local midnight on the chosen date, on the reader's clock.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest, src/vault.test.ts
npm run typecheck
npm run build      # tsc + vite build → dist/
```

Zero runtime dependencies. Vite + TypeScript for the build, Vitest for tests.

## Layout

```
index.html        the single page, markup only
src/styles.css    watercolor styles
src/main.ts       DOM wiring: form, vault list, share link, countdowns, toasts
src/vault.ts      pure logic: dates, validation, link encode/decode, storage, ics
src/vault.test.ts
vercel.json       www redirect + security headers (CSP: self + Google Fonts)
```

## Deploy

Vercel, static. Push to `main`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits, and the PR
process. Run `npm test && npm run typecheck` before opening a PR. Never commit
`.env*` files.

## License

[MIT](LICENSE)
