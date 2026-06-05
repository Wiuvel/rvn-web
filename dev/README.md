# Local dev stack

A self-contained local environment for `rvn-web`: Postgres, Redis, MinIO (S3),
and the WebSocket server — wired together with generated secrets so you can run
and test the full app without renting a VPS.

> Full documentation: [docs/dev/local-stack.en.md](../docs/dev/local-stack.en.md) ([RU](../docs/dev/local-stack.md))

`rvn-web` itself runs **on the host** (`pnpm dev`) for fast HMR; the stack below
provides everything it talks to.

## Requirements

- Docker Desktop (running)
- Node.js (for the orchestrator scripts — no extra npm deps)

## Usage

```bash
node dev/up.mjs     # bring the stack up (clones WS server, migrates DB)
pnpm dev            # then start rvn-web on http://localhost:3000
```

Stop it:

```bash
node dev/down.mjs              # stop containers, keep data (asks Y/N about restoring .env.local)
node dev/down.mjs --fresh      # stop + wipe Postgres/MinIO volumes
node dev/down.mjs --restore    # stop + bring back your real .env.local without asking
```

## What `up.mjs` does

1. Clones `github.com/Wiuvel/rvn-socketio-server` into `dev/.ws-server` (pulls on later runs).
2. Generates `.env.local` (rvn-web) and `dev/.ws.env` (WS server) with matching secrets.
3. Backs up your existing `.env.local` → `.env.local.bak` (once).
4. `docker compose up --wait` for Postgres, Redis, MinIO + bucket setup, WS server.
5. Applies Drizzle migrations via `scripts/db-migrate.mjs`.

## Ports

| Service       | URL                                      | Notes                       |
|---------------|------------------------------------------|-----------------------------|
| rvn-web       | http://localhost:3000                    | `pnpm dev` (on host)        |
| WS server     | http://localhost:3002                    | in Docker                   |
| Postgres      | postgresql://rvn:rvn@localhost:5432/rvn  | user/pass/db = `rvn`        |
| Redis         | redis://localhost:6379                   | plaintext (no TLS)          |
| MinIO API     | http://localhost:9000                    | S3 endpoint                 |
| MinIO console | http://localhost:9001                    | `minioadmin` / `minioadmin` |

## Notes

- **Your real `.env.local` is preserved** in `.env.local.bak`. Restore it with
  `node dev/down.mjs --restore` (moves the backup back, so the next `up.mjs`
  re-backs-up whatever is current). The backup is never overwritten while it exists.
- **OAuth is disabled** locally (`*=NONE`). Login via OAuth won't work; everything
  else does. To test a real provider, edit `.env.local` after `up.mjs` (set the
  `CLIENT_ID`/`CLIENT_SECRET` pair) and restart `pnpm dev`.
- **Turnstile** uses Cloudflare's always-pass test keys, so the captcha never blocks you.
- **S3** runs on MinIO with bucket `rvn`; `avatars/` and `banners/` are public-read
  (matching production), so avatar/banner/attachment uploads work locally.
- **Secrets are stable across restarts** (reused from the previous `.env.local`),
  so you stay logged in. Use `node dev/up.mjs --fresh` to regenerate them.
- `dev/.ws-server`, `dev/.data`, `dev/.ws.env`, and `.env.local.bak` are gitignored.
