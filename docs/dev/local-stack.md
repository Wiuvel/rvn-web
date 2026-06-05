# Локальный dev-стенд

> **[English version](local-stack.en.md)**

## Обзор

Инструмент в папке `dev/` поднимает полностью локальное окружение для `rvn-web` одной командой: Postgres, Redis, MinIO (S3) и WebSocket-сервер — со сгенерированными секретами и связкой сервисов между собой. Нужен, чтобы разрабатывать и тестировать приложение без аренды VPS.

Сам `rvn-web` запускается **на хосте** (`pnpm dev`) ради HMR; стенд предоставляет всё, к чему он обращается.

## Требования

- Docker Desktop (запущен)
- Node.js (для скриптов-оркестраторов — без дополнительных npm-зависимостей)

## Использование

```bash
node dev/up.mjs     # поднять стенд (клонирует WS-сервер, накатывает миграции)
pnpm dev            # затем запустить rvn-web на http://localhost:3000
```

Остановка:

```bash
node dev/down.mjs              # остановить контейнеры, сохранить данные (спросит Y/N про возврат .env.local)
node dev/down.mjs --fresh      # остановить + удалить volumes Postgres/MinIO
node dev/down.mjs --restore    # остановить + вернуть реальный .env.local без вопроса
```

## Что делает `up.mjs`

1. Клонирует `github.com/Wiuvel/rvn-socketio-server` в `dev/.ws-server` (при повторных запусках — `git pull`).
2. Генерирует `.env.local` (rvn-web) и `dev/.ws.env` (WS-сервер) с согласованными секретами.
3. Бэкапит существующий `.env.local` → `.env.local.bak` (один раз).
4. `docker compose up --wait`: Postgres, Redis, MinIO + создание bucket, WS-сервер.
5. Накатывает Drizzle-миграции через `scripts/db-migrate.mjs`.

## Архитектура взаимодействия

```
Браузер ──socket.io (NEXT_PUBLIC_WS_URL)──▶ WS-сервер :3002
rvn-web :3000 ──HTTP broadcast (WEBSOCKET_SERVER_URL + INTERNAL_API_KEY)──▶ WS-сервер :3002
WS-сервер ──auth-callback (AUTH_SERVICE_URL + INTERNAL_API_KEY)──▶ rvn-web :3000
```

WS-сервер работает в Docker и обращается к rvn-web (на хосте) через `host.docker.internal:3000`. `INTERNAL_API_KEY` общий для обеих сторон.

## Порты

| Сервис        | URL                                      | Примечание                  |
|---------------|------------------------------------------|-----------------------------|
| rvn-web       | http://localhost:3000                    | `pnpm dev` (на хосте)       |
| WS-сервер     | http://localhost:3002                    | в Docker                    |
| Postgres      | postgresql://rvn:rvn@localhost:5432/rvn  | user/pass/db = `rvn`        |
| Redis         | redis://localhost:6379                   | без TLS                     |
| MinIO API     | http://localhost:9000                    | S3 endpoint                 |
| MinIO консоль | http://localhost:9001                    | `minioadmin` / `minioadmin` |

## Поведение

- **Реальный `.env.local` сохраняется** в `.env.local.bak`. Пока `.bak` существует, повторные `up.mjs` его **не перезаписывают**. Вернуть: `node dev/down.mjs --restore` — бэкап переносится обратно (не копируется), поэтому следующий `up.mjs` забэкапит уже актуальный файл.
- **OAuth отключён** локально (`*=NONE`). Вход через OAuth не работает; всё остальное работает. Чтобы протестировать провайдера — впиши пару `CLIENT_ID`/`CLIENT_SECRET` в `.env.local` после `up.mjs` и перезапусти `pnpm dev`.
- **Turnstile** использует [тестовые ключи Cloudflare](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (всегда проходят), капча не блокирует.
- **S3** — MinIO с bucket `rvn`; префиксы `avatars/` и `banners/` доступны на чтение анонимно (как в проде), поэтому загрузки аватаров/баннеров/вложений работают локально.
- **Секреты стабильны между перезапусками** (переиспользуются из предыдущего `.env.local`), поэтому сессия не сбрасывается. `node dev/up.mjs --fresh` форсит регенерацию.
- `dev/.ws-server`, `dev/.data`, `dev/.ws.env`, `.env.local.bak` — в `.gitignore`. Вся папка `dev/` — в `.dockerignore` (не попадает в прод-образ).
