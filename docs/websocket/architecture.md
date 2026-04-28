# Архитектура WebSocket

> **[English version](architecture.en.md)**

## Обзор

Real-time коммуникация обрабатывается **отдельным WebSocket сервером** (`rvn-socket-server`), независимым от Next.js приложения. Веб-приложение подключается к нему как клиент и отправляет broadcast-команды через внутренний REST API.

```
┌──────────────┐     Socket.IO      ┌─────────────────────┐
│   Browser    │◄──────────────────►│  rvn-socket-server  │
│  (socket.io  │   wss://ws.host    │  (Bun + Socket.IO)  │
│   client)    │                    │    порт 3002        │
└──────┬───────┘                    └────────┬────────────┘
       │                                     │
       │  HTTPS                              │  HTTP (внутренний)
       ▼                                     ▼
┌──────────────┐   POST /broadcast/* ┌────────────────────┐
│   rvn-web    │────────────────────►│  rvn-socket-server │
│  (Next.js)   │    x-internal-      │  REST broadcast    │
│  порт 3001   │    api-key          │  endpoints         │
└──────┬───────┘                     └────────────────────┘
       │
       │  POST /api/internal/*
       ▼
┌──────────────┐
│  rvn-web     │   Верификация
│  internal API│   токенов и тикетов
└──────────────┘
```

## Потоки данных

### Клиент → Сервер (события)

1. Браузер подключается к `NEXT_PUBLIC_WS_URL` через хук `useWebSocket`
2. Socket.IO передаёт auth-токен в handshake
3. WS-сервер валидирует токен через `POST /api/internal/verify-token` callback к rvn-web
4. При успехе клиент может вступать в комнаты и отправлять события (`support:join`, `support:typing` и т.д.)

### Сервер → Клиент (broadcast)

1. tRPC мутация в rvn-web выполняется (например, отправлено новое сообщение)
2. rvn-web вызывает `POST /broadcast/support/message` на WS-сервере (внутренняя сеть)
3. WS-сервер эмитит событие в соответствующую Socket.IO комнату
4. Все подключённые клиенты в комнате получают событие

## Аутентификация

WS-сервер **не имеет** прямого доступа к базе данных. Аутентификация делегируется:

1. Клиент отправляет `auth.token` в Socket.IO handshake
2. WS-сервер вызывает `POST {AUTH_SERVICE_URL}/api/internal/verify-token` с токеном + cookies сессии
3. rvn-web валидирует токен (SHA256 → поиск в `user_devices`), сессию и роли
4. Ответ: `{ valid, user: { id, username, isSupport } }`
5. Результат кешируется в памяти на 60 секунд по хешу токена

Доступ к тикетам проверяется аналогично через `POST /api/internal/verify-ticket-access`.

## Переменные окружения

### rvn-web

| Переменная | Сторона | Описание |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | Клиент (build-time) | Публичный URL WS-сервера для браузера |
| `WEBSOCKET_SERVER_URL` | Сервер | Внутренний URL WS-сервера для broadcast |
| `INTERNAL_API_KEY` | Сервер | Общий секрет для внутренней API авторизации |

### rvn-socket-server

| Переменная | Описание |
|---|---|
| `PORT` | Порт сервера (по умолчанию: 3002) |
| `AUTH_SERVICE_URL` | URL rvn-web для верификации токенов |
| `INTERNAL_API_KEY` | Общий секрет (должен совпадать с rvn-web) |
| `CORS_ORIGINS` | Разрешённые origins через запятую |

## Ключевые файлы

### rvn-web

- `hooks/useWebSocket.ts` — Socket.IO клиентский хук
- `lib/websocket/client.ts` — HTTP broadcast клиент (серверная сторона)
- `lib/websocket/types.ts` — TypeScript-контракт (зеркало `rvn-socketio-server/src/types.ts`)
- `app/api/internal/verify-token/route.ts` — Эндпоинт верификации токена
- `app/api/internal/verify-ticket-access/route.ts` — Верификация доступа к тикету

### rvn-socket-server

- `src/index.ts` — Точка входа, Bun сервер + Socket.IO
- `src/auth.ts` — Auth middleware с кешированием
- `src/broadcast.ts` — REST broadcast обработчик
- `src/handlers/support.ts` — Обработчики событий тикетов
- `src/handlers/profile.ts` — Обработчики событий комментариев
- `src/rate-limit.ts` — Rate limiting подключений и typing
- `src/types.ts` — Общие TypeScript типы (источник правды)

## Контракт типов

Контракт сообщений WebSocket описан дважды: на стороне сервера в [`Wiuvel/rvn-socketio-server`](https://github.com/Wiuvel/rvn-socketio-server) (`src/types.ts`) и в зеркальном файле `lib/websocket/types.ts` на стороне rvn-web. Серверный файл — **источник правды**, все изменения начинаются с него.

При изменении контракта:

1. Обновите `src/types.ts` в `rvn-socketio-server`.
2. Отзеркальте изменение в `lib/websocket/types.ts` здесь.
3. Обновите broadcast-хелперы в `lib/websocket/client.ts` и потребителей в `hooks/useWebSocket.ts`.
4. Обновите таблицы событий в [`events.en.md`](events.en.md) / [`events.md`](events.md).

Автоматической проверки на дрейф нет; в перспективе можно вынести типы в общий npm-пакет `@rvn/ws-types` либо добавить CI-шаг, который сверяет оба файла.
