# Local dev stack

> **[Русская версия](local-stack.md)**

## Overview

The tooling in `dev/` brings up a fully local environment for `rvn-web` with one command: Postgres, Redis, MinIO (S3), and the WebSocket server — with generated secrets and the services wired together. It lets you develop and test the app without renting a VPS.

`rvn-web` itself runs **on the host** (`pnpm dev`) for fast HMR; the stack provides everything it talks to.

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

## Communication topology

```
Browser ──socket.io (NEXT_PUBLIC_WS_URL)──▶ WS server :3002
rvn-web :3000 ──HTTP broadcast (WEBSOCKET_SERVER_URL + INTERNAL_API_KEY)──▶ WS server :3002
WS server ──auth callback (AUTH_SERVICE_URL + INTERNAL_API_KEY)──▶ rvn-web :3000
```

The WS server runs in Docker and reaches rvn-web (on the host) via `host.docker.internal:3000`. `INTERNAL_API_KEY` is shared by both sides.

## Ports

| Service       | URL                                      | Notes                       |
|---------------|------------------------------------------|-----------------------------|
| rvn-web       | http://localhost:3000                    | `pnpm dev` (on host)        |
| WS server     | http://localhost:3002                    | in Docker                   |
| Postgres      | postgresql://rvn:rvn@localhost:5432/rvn  | user/pass/db = `rvn`        |
| Redis         | redis://localhost:6379                   | no TLS                      |
| MinIO API     | http://localhost:9000                    | S3 endpoint                 |
| MinIO console | http://localhost:9001                    | `minioadmin` / `minioadmin` |

## Behaviour

- **Your real `.env.local` is preserved** in `.env.local.bak`. While the `.bak` exists, repeated `up.mjs` runs **never overwrite it**. Restore with `node dev/down.mjs --restore` — the backup is moved back (not copied), so the next `up.mjs` backs up the now-current file.
- **OAuth is disabled** locally (`*=NONE`). Login via OAuth won't work; everything else does. To test a provider, set its `CLIENT_ID`/`CLIENT_SECRET` pair in `.env.local` after `up.mjs` and restart `pnpm dev`.
- **Turnstile** uses [Cloudflare's test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (always pass), so the captcha never blocks you.
- **S3** runs on MinIO with bucket `rvn`; `avatars/` and `banners/` are public-read (matching production), so avatar/banner/attachment uploads work locally.
- **Secrets are stable across restarts** (reused from the previous `.env.local`), so you stay logged in. Use `node dev/up.mjs --fresh` to regenerate them.
- `dev/.ws-server`, `dev/.data`, `dev/.ws.env`, `.env.local.bak` are gitignored. The whole `dev/` folder is in `.dockerignore` (kept out of the prod image).
