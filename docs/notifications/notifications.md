# Система уведомлений

> **[English version](notifications.en.md)**

## Обзор

Система уведомлений информирует пользователей о событиях в тикетах поддержки: ответы от поддержки, изменения статуса обращений. Уведомления доставляются в реальном времени через WebSocket и доступны через API с cursor-based пагинацией.

```
┌──────────────┐    notification:new   ┌─────────────────────┐
│   Browser    │◄──────────────────────│  rvn-socketio-server│
│  (dropdown   │   WebSocket push      │  user:{userId} room │
│   + page)    │                       └────────┬────────────┘
└──────┬───────┘                                │
       │                                        │ POST /broadcast/
       │  tRPC queries                          │ notification
       ▼                                        │
┌──────────────┐  createNotification()  ┌───────┴────────────┐
│   rvn-web    │───────────────────────►│  rvn-web           │
│  tRPC router │   UPSERT + broadcast   │  support.ts        │
└──────────────┘                        └────────────────────┘
```

## Архитектура

### База данных

Таблица `notifications`:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `user_id` | UUID | FK → users.id |
| `type` | TEXT | Тип: `support_reply`, `ticket_status` |
| `title` | TEXT | Заголовок |
| `message` | TEXT | Текст уведомления |
| `is_read` | BOOLEAN | Прочитано? |
| `count` | INTEGER | Количество сгруппированных сообщений |
| `related_ticket_id` | UUID | FK → support_tickets.id |
| `created_at` | TIMESTAMPTZ | Время создания/обновления |

**Индексы:**
- `idx_notifications_user_id` — по user_id
- `idx_notifications_user_unread` — частичный (user_id, is_read) WHERE is_read = false
- `idx_notifications_created_at` — по времени

### Группировка (UPSERT)

Чтобы не создавать отдельное уведомление на каждое сообщение поддержки:

1. При создании уведомления проверяется: есть ли непрочитанное с таким же `userId + type + relatedTicketId`?
2. **Да** — UPDATE: обновить `message`, `created_at`, `count = count + 1`
3. **Нет** — INSERT новое уведомление

Результат: один тикет = одна строка (пока непрочитано). После `markRead` следующий ответ создаёт новое уведомление.

## Точки создания

### Ответ поддержки (`support_reply`)
- Триггер: `sendMessage` в `support.ts`, если `senderType === 'support'`
- Title: "Новый ответ в тикете"
- Message: "Поддержка ответила на обращение: {subject}" (до 80 символов)

### Изменение статуса (`ticket_status`)
- Триггер: `changeStatus` / `closeTicket` в `support.ts`
- `pending` → "Ваше обращение приняли в обработку"
- `closed` → "Ваше обращение было закрыто"

## Real-time доставка

### WebSocket user rooms

Каждый авторизованный сокет автоматически присоединяется к комнате `user:{userId}` при подключении к WebSocket серверу. При создании уведомления `rvn-web` отправляет POST-запрос:

```
POST /broadcast/notification
{
  "userId": "...",
  "notification": { id, type, title, message, is_read, count, related_ticket_id, created_at }
}
```

Сервер эмитит событие `notification:new` в комнату `user:{userId}`.

### Auto-mark-read

Если пользователь просматривает тикет (передан `activeTicketId` в `useNotifications`), новое уведомление для этого тикета автоматически помечается как прочитанное на клиенте.

## API (tRPC)

### `notification.list`
- Cursor-based пагинация (ORDER BY createdAt DESC)
- Input: `{ cursor?: UUID, limit: 1..50 }`
- Output: `{ items: Notification[], nextCursor: string | null }`

### `notification.unreadCount`
- Кэшируется 10 секунд (in-memory)
- Polling каждые 60 секунд как baseline
- Output: `{ count: number }`

### `notification.markRead`
- Input: `{ id: UUID }`
- Помечает одно уведомление как прочитанное

### `notification.markAllRead`
- Помечает все непрочитанные как прочитанные

## UI компоненты

### NotificationsWidget (`components/navigation/Notifications.tsx`)
- Колокольчик с синим badge (число непрочитанных, 99+)
- Dropdown: последние 5 уведомлений, кнопка "Прочитать все"
- Клик → навигация к тикету (`/support?ticket={id}`)
- Ссылка "Все уведомления" → `/notifications`

### Страница `/notifications`
- Бесконечный скролл (IntersectionObserver)
- Относительное время ("2 мин назад", "вчера")
- Кнопки markRead для отдельных и markAllRead для всех

### Мобильная навигация
- Bottom nav: Bell icon с badge заменяет "О проекте" для авторизованных
- Overlay menu: пункт "Уведомления" с badge

## Кэширование

| Данные | Тип кэша | TTL | Инвалидация |
|--------|----------|-----|-------------|
| `unreadCount` | In-memory | 10s | createNotification, markRead, markAllRead |
| `getUserByToken` | Redis | 5m | logout, revoke device |
| `user.profile` | In-memory | 60s | TTL |
| `user.comments.list` | In-memory | 30s | comments.create |
| `admin.teamCount` | In-memory | 5m | grant/revoke role |

## Файлы

| Файл | Назначение |
|------|-----------|
| `lib/database/schema.ts` | Таблица `notifications` + relations |
| `lib/notifications/create.ts` | Сервис создания с UPSERT |
| `lib/trpc/routers/notification.ts` | tRPC роутер |
| `hooks/useNotifications.ts` | Клиентский хук |
| `components/providers/WebSocketProvider.tsx` | Глобальный WS провайдер |
| `components/navigation/Notifications.tsx` | Виджет (dropdown) |
| `components/notifications/NotificationsPageClient.tsx` | Страница /notifications |
| `app/notifications/page.tsx` | Next.js route |
| `database/schema.sql` | Полная схема (секция 7) |
| `database/schema_migration.sql` | Миграция для существующей БД |
