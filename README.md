<div align="center">
  <h1 align="center">Raven Private</h1>

  <a href="https://rvn.market">
    <img src="docs/images/main.png" alt="Website Main Page" width="700">
  </a>

  <p align="center">
    Powerful protection by RVN. Secure, high‑performance VPN & Proxy (VLESS) for a clean internet without limits
  </p>

  <p align="center">
    <a href="https://rvn.market">
      <img src="https://img.shields.io/badge/Get%20Started-%E2%86%92-0969da?style=for-the-badge&labelColor=0969da&color=0969da" alt="Get Started" width="200" height="auto">
    </a>
  </p>

  <p align="center">
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js">
    <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black" alt="React">
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind">
    <img src="https://img.shields.io/badge/tRPC-11-2596be?style=flat-square&logo=trpc&logoColor=white" alt="tRPC">
    <img src="https://img.shields.io/badge/Supabase-PostgreSQL-3fcf8e?style=flat-square&logo=supabase&logoColor=white" alt="Supabase">
    <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis">
    <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/Rust→WASM-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust WASM">
  </p>
</div>

## Tech Stack

**Core** — Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI

**API** — tRPC 11, Socket.io

**Data** — Supabase (PostgreSQL), Redis, AWS S3

**Auth** — bcrypt, OAuth (Google, GitHub, Yandex, Telegram, VK, Twitch)

**Infra** — Docker, Rust → WASM (image processing), Turbopack

---

## Setup

```bash
cp .env.example .env
pnpm install
pnpm run build:wasm
pnpm run build
pnpm dev
```

## Scripts

```bash
pnpm dev               # dev server
pnpm build             # production build
pnpm start             # production server
pnpm test              # vitest
pnpm lint              # oxlint
pnpm format            # prettier
```

## Project Structure

```
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
├── database/          # supabase, redis, cache
├── storage/           # S3, media cache
├── trpc/              # routers (auth, user, admin)
└── websocket/         # socket.io server

wasm/                  # Rust image processing
```

## Environment

`.env.example`:

- `NEXT_PUBLIC_DOMAIN` — app URL
- `SUPABASE_*` — database
- `REDIS_URL` — cache
- `S3_*` — object storage
- `CSRF_SECRET` / `TURNSTILE_*` — security
- OAuth keys per provider

---
