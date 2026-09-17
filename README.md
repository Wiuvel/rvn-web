<h1 align="center">
  <img src="./public/favicon.svg" width="48" height="48" align="center" alt="icon">
  rvncom/website
</h1>

<p align="center">
  <img src="docs/images/readme-card.png" alt="RVN Website" width="90%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vinext-1.0.0--beta.10-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Vinext">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/React-19-3178c6?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind-3.4-3178c6?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind">
  <img src="https://img.shields.io/badge/tRPC-11-3178c6?style=flat-square&logo=trpc&logoColor=white" alt="tRPC">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
</p>

## 📖 About

**RVN** is a VPN service that gives users fast, private internet access without the usual setup hassle. Pick a plan, top up your balance or redeem a promo, and your connection is ready in seconds — no manual configuration, no waiting around.

The site is the home base for everything around the subscription: account and device management, payments and balance history, in-app support with live replies, and notifications that keep you in the loop. Sign in with the provider you already use, manage your plan from any device, and reach support whenever something needs attention.

## 🚀 Tech Stack

**Core**: Vinext - Next.js API on Vite 8, React 19, TypeScript, Tailwind CSS, Radix UI

**API**: tRPC 11, Socket.io

**Data**: Drizzle ORM (PostgreSQL), Redis, AWS S3

**Auth**: Argon2id, OAuth (Google, GitHub, Yandex, Telegram, VK, Twitch)

**Infra**: Docker, Rust → WASM (Image processing), Rolldown

## 📚 Documentation

The complete project documentation is centralized in [**`docs/`**](docs/index.md) (also [English Version](docs/index.en.md)).

---

## ⚙️ Setup

```bash
cp .env.example .env
pnpm install
pnpm run build:wasm
pnpm run build
pnpm run dev
```

### Local dev stack

Don't have a Postgres / Redis / S3 / WS server to point at? Spin up a complete local environment (containers + generated secrets + auto migrations) with one command, then run the dev server:

```bash
node dev/up.mjs     # Postgres + Redis + MinIO + WS server
pnpm dev            # rvn-web on http://localhost:3000
node dev/down.mjs   # tear it down
```

See [Local dev stack](docs/dev/local-stack.en.md) for ports, OAuth/Turnstile notes, and the `.env.local` backup behaviour.

## 📜 Scripts

```bash
pnpm dev               # dev server
pnpm build             # production build
pnpm start             # production server
pnpm test              # vitest
pnpm lint              # oxlint
pnpm format            # prettier
pnpm db:generate       # drizzle-kit: emit a new SQL migration from schema.ts
pnpm db:migrate        # apply pending migrations to DATABASE_URL
pnpm db:studio         # drizzle-kit studio
```

## 🐳 Docker

The image is built in stages (WASM → deps → build → runner) and outputs a standalone server on port `3001`.

**Build** — two public build args are baked into the client bundle, and the MaxMind license key is passed as a BuildKit secret (never written to an image layer):

```bash
export MAXMIND_LICENSE_KEY=your-license-key

docker build \
  --build-arg NEXT_PUBLIC_WS_URL=wss://ws.rvn.market \
  --build-arg NEXT_PUBLIC_TURNSTILE_SITEKEY=your-sitekey \
  --secret id=maxmind_key,env=MAXMIND_LICENSE_KEY \
  -t rvn-web .
```

| Build variable | How | Required | Purpose |
|----------------|-----|----------|---------|
| `NEXT_PUBLIC_WS_URL` | `--build-arg` | yes | WebSocket URL, inlined into the client bundle |
| `NEXT_PUBLIC_TURNSTILE_SITEKEY` | `--build-arg` | yes | Turnstile site key, inlined into the client bundle |
| `MAXMIND_LICENSE_KEY` | `--secret id=maxmind_key` | no | Official GeoLite2 download; omit to fall back to a mirror |

**Run** — runtime config comes from the environment (see [Environment](#-environment)):

```bash
docker run -p 3001:3001 --env-file .env rvn-web
```

## 📁 Project Structure

```text
app/
├── auth/              # login, register, OAuth
├── dashboard/         # user dashboard
├── admin/             # admin panel
├── support/           # ticket system
├── user/settings/     # profile settings
├── api/               # tRPC, websocket, uploads
└── protection/        # bot/DDoS protection

lib/
├── auth/              # sessions, device fingerprint
├── database/          # drizzle, redis, cache
├── storage/           # S3, media cache
├── trpc/              # routers (auth, user, admin)
└── websocket/         # socket.io server

wasm/                  # Rust image processing
```

## 🌐 Environment

`.env.example`:

- `NEXT_PUBLIC_DOMAIN` — app URL
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — cache
- `S3_*` — object storage
- `CSRF_SECRET` / `TURNSTILE_*` — security
- OAuth keys per provider

## License

The project is distributed under the License Terms: [Apache License 2.0 + Commons Clause](./LICENSE.md)

---
