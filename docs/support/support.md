# Система поддержки

> **[English version](support.en.md)**

Тикет-система: пользователи создают обращения, агенты поддержки отвечают в реальном времени. Сообщения доставляются через WebSocket, вложения хранятся в S3, события порождают уведомления.

## Связанные документы

- [RBAC](../security/rbac.md) — роли `user` / `support` / `admin`, флаг `pex`, middleware (кто имеет доступ к панели агента).
- [Загрузка файлов](../storage/upload.md) — пайплайн вложений support (`app/api/support/upload`, проверка magic-byte, S3-префикс `support/`).
- [Хранилище и медиа](../storage/storage.md) — S3, Redis-кэш медиа, thumbhash.
- [Уведомления](../notifications/notifications.md) и [типы](../notifications/types.md) — UPSERT-группировка уведомлений по тикету.
- [WebSocket: архитектура](../websocket/architecture.md) и [события](../websocket/events.md) — комнаты, broadcast, доставка.
- [Сессии и cookies](../auth/sessions.md) — аутентификация пользователя.

## Обзор

Две точки входа на один и тот же домен тикетов:

| Маршрут | Кто | Компонент |
|---------|-----|-----------|
| `app/support` | пользователь | `SupportClient` |
| `app/ui/panel/support` | агент (роль `support` / `admin`) | `AdminSupportClient` |

Пользователь видит только свои тикеты; агент — все, может назначать, менять статус и закрывать с указанием причины. Разграничение — через [RBAC](../security/rbac.md): мутации агента требуют `supportProcedure` (роль `support` или `admin`), пользовательские — `protectedProcedure`.

## Модель данных

Три таблицы (`lib/database/schema.ts`):

```
support_tickets
  id, user_id → users, assigned_to → users (nullable),
  status ('open' | 'pending' | 'closed'), priority ('normal' по умолчанию),
  subject, last_message_at, closed_at, created_at, updated_at

support_messages
  id, ticket_id → support_tickets (cascade), sender_id → users (cascade),
  message_text, sender_type ('user' | 'support'), is_read, created_at

support_message_attachments
  id, message_id → support_messages (cascade),
  file_name, file_type, file_size, storage_path,
  blur_hash, width, height, created_at
```

`status` и `priority` — текстовые колонки на уровне БД, рантайм-сужение до union-типов делается в `support.ts` (`TicketStatus`, `TicketPriority`). `blur_hash` / `width` / `height` заполняются для изображений (см. [Загрузка файлов](../storage/upload.md)).

## Жизненный цикл тикета

```
                   create
                     │
                     ▼
   ┌────────── open ◀──────── reopen (новое сообщение)
   │             │
   │   агент: assignedTo, priority
   │             │
   │             ▼
   │          pending  (ждём ответа пользователя / агента)
   │             │
   │             ▼
   └────────▶ closed  (closed_at + причина закрытия)
```

- **create** (`tickets.create`) — пользователь задаёт `subject` + первое сообщение; статус `open`.
- **update** (`tickets.update`, `supportProcedure`) — агент меняет `status`, `assignedTo`, `priority`; при закрытии указывается причина (модалка `CloseReasonModal`), проставляется `closed_at`.
- Фильтр списка для агента: `open` / `pending` / `closed` / `all`.
- Архив — закрытые тикеты с отдельным поиском в `AdminSupportClient`.

## tRPC-процедуры (`lib/trpc/routers/support.ts`)

| Процедура | Доступ | Назначение |
|-----------|--------|------------|
| `check` | public | Доступна ли поддержка текущему пользователю (роль/гость) |
| `tickets.list` | protected | Список тикетов (свои — пользователю, все — агенту), с фильтром по статусу |
| `tickets.create` | protected | Создать тикет + первое сообщение |
| `tickets.get` | protected | Тикет с сообщениями и вложениями; докручивает `sender_type` по ролям |
| `tickets.update` | **support** | Сменить статус / назначить / приоритет / закрыть с причиной |
| `tickets.sendMessage` | protected | Отправить сообщение (с вложениями); reopen при необходимости |
| `tickets.markAsRead` | protected | Отметить сообщения тикета прочитанными |

## Пагинация

Список и история сообщений подгружаются через `IntersectionObserver`: 50 элементов начальной загрузки + по 25 за батч при прокрутке к концу. Это уже отлажено для админ-поддержки (см. память проекта); `MessageItem` обёрнут в `React.memo`.

## Реал-тайм (WebSocket)

Серверная сторона вызывает хелперы из `lib/websocket/client.ts`, которые отправляют broadcast на WS-сервер (`WEBSOCKET_SERVER_URL` + `INTERNAL_API_KEY`):

| Хелпер | Когда | Кому |
|--------|-------|------|
| `broadcastNewMessage(ticketId, message)` | новое сообщение | подписчикам комнаты тикета |
| `broadcastTicketUpdate(ticketId, ticket)` | смена статуса/полей | подписчикам комнаты тикета |
| `broadcastTicketAssignment(...)` | назначение агента | агентам |

Подробнее о комнатах и доставке — [WebSocket: архитектура](../websocket/architecture.md) и [события](../websocket/events.md). Реконнект, дебаунс и rejoin комнат — [Reconnection](../websocket/reconnection.md). На клиенте состояние соединения показывает `ConnectionBanner`.

## Вложения

Загрузка идёт не через tRPC, а через REST-роут `app/api/support/upload` (проверка magic-byte, лимиты, запись в S3 под префикс `support/`, генерация thumbhash для изображений). Метаданные сохраняются в `support_message_attachments`. Полный пайплайн — [Загрузка файлов](../storage/upload.md). Чтение файлов — `app/support/files/[key]`; рендер с размытым плейсхолдером — `ImageWithBlur` / `ImageViewer`.

## Уведомления

Новое сообщение порождает уведомление через `createNotification` (`lib/notifications`). Уведомления группируются по тикету через UPSERT — несколько сообщений в одном тикете не плодят отдельные записи. Семантика — [Уведомления](../notifications/notifications.md), каталог типов — [Типы уведомлений](../notifications/types.md).

## Ключевые файлы

| Файл | Роль |
|------|------|
| `lib/trpc/routers/support.ts` | Роутер тикетов и сообщений |
| `components/support/SupportClient.tsx` | UI пользователя |
| `components/support/AdminSupportClient.tsx` | UI агента (списки, архив, назначение) |
| `components/support/MessageItem.tsx` / `AdminMessageItem.tsx` | Рендер сообщений (memo) |
| `components/support/FileUploadModal.tsx` / `ImageViewer.tsx` | Вложения |
| `components/support/CloseReasonModal.tsx` | Закрытие тикета с причиной |
| `app/api/support/upload/route.ts` | Приём вложений |
| `lib/websocket/client.ts` | Broadcast-хелперы |
