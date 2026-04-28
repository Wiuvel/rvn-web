# Типы уведомлений

> **[English version](types.en.md)**

## Обзор

Внутренние уведомления — это однотабличная система: каждое уведомление это строка в `notifications` с ключом `(userId, type, relatedTicketId, isRead)`. Одна и та же строка может представлять N событий благодаря UPSERT-with-counter — отдельной таблицы «события» или event-лога нет.

У строки только одно изменяемое булево (`isRead`) и один изменяемый счётчик (`count`). Повторные события на тот же тикет инкрементируют счётчик вместо вставки новых строк — счётчик «непрочитанных» остаётся точным, а БД не раздувается.

## Схема

```ts
notifications {
  id              uuid PK
  user_id         uuid FK users(id) ON DELETE CASCADE
  type            text          -- дискриминатор (см. каталог ниже)
  title           text          -- заранее отрендеренный заголовок
  message         text          -- заранее отрендеренный текст
  is_read         boolean       -- по умолчанию false
  count           integer       -- по умолчанию 1, инкрементится UPSERT
  related_ticket_id uuid?       -- FK support_tickets(id) ON DELETE CASCADE
  created_at      timestamptz   -- обновляется до now() при каждом инкременте
}

-- Индексы:
-- idx_notifications_user_id (user_id)
-- idx_notifications_user_unread (user_id, is_read) WHERE is_read = false
-- idx_notifications_created_at (created_at)
```

`title` и `message` хранятся как готовые локализованные строки — шаблонной системы нет. Производитель форматирует строки до вызова `createNotification`.

## Каталог типов

Колонка `type` — это free-form строка-дискриминатор. Активные продюсеры в коде:

| `type` | Продюсер | Триггер | `relatedTicketId` |
|--------|----------|---------|-------------------|
| `ticket_status` | `lib/trpc/routers/support.ts` (admin/support `updateTicket`) | Смена статуса: `closed`, `in_progress`, `waiting_user` и т.д. | да |
| `support_reply` | `lib/trpc/routers/support.ts` (`sendMessage`, когда отправитель — поддержка) | Агент пишет ответ от имени пользователя | да |

Оба продюсера сейчас целятся в `userId = ticket.userId` (владелец тикета). Добавить новый тип — просто вызвать `createNotification({ type: 'my_event', … })` из нового места, миграция схемы не нужна.

Каталог сознательно узкий: уведомления — для событий, к которым пользователь возвращается внутри приложения. Маркетинговые или разовые рассылки идут через WebSocket-событие `system:notification` и строки в БД не создают.

## Группировка через UPSERT

`lib/notifications/create.ts → createNotification(params)`:

```
BEGIN TRANSACTION
  IF relatedTicketId задан:
    SELECT id, count
      FROM notifications
      WHERE user_id = $1
        AND type = $2
        AND related_ticket_id = $3
        AND is_read = false
      LIMIT 1
    IF FOUND:
      UPDATE notifications
        SET message = $newMessage,
            count = existing.count + 1,
            created_at = now()
        WHERE id = existing.id
      → переиспользуем existing.id
    ELSE:
      INSERT новой строки → returning id
  ELSE:
    INSERT новой строки → returning id
COMMIT
```

Важные свойства:

- **`is_read` устойчив**: как только пользователь открыл уведомление (`markRead`), следующее событие создаёт новую строку, а не инкрементирует «закрытую». Поэтому `count` всегда означает «события с момента, как пользователь в последний раз читал этот тикет».
- **Title не меняется**: при инкременте обновляется только `message`, поэтому строка держит исходный заголовок (`Тикет закрыт «…»`), а message может переноситься на свежее тело. Это убирает раздражающий «прыжок» заголовка в UI.
- **`created_at` обновляется до `now()`** на каждом инкременте, чтобы уведомление всплывало наверх списка.
- **Атомарность**: SELECT + UPDATE/INSERT внутри `db.transaction()` — два конкурентных продюсера не создадут дубликат для одной и той же `(userId, type, relatedTicketId)`.
- **Fire-and-forget**: любая ошибка ловится и логируется, но не пробрасывается — producing-эндпоинт (`sendMessage` и т.п.) не должен падать из-за сбоя уведомления.

Если `relatedTicketId` не передан, UPSERT пропускается и каждый раз вставляется новая строка. Текущие продюсеры этого не делают, но в будущем «глобальные» уведомления (события уровня аккаунта) могут.

## Real-time доставка

После записи в БД `createNotification` вызывает `broadcastNotification(userId, payload)` (`lib/websocket/client.ts`). WS-сервер эмитит `support:notification` в комнату пользователя с payload'ом:

```ts
WsNotificationPayload {
  id: string;
  type: string;                  // зеркалит notifications.type
  title: string;
  message: string;
  is_read: false;                // на момент доставки всегда false
  count: number;                 // count после UPSERT
  related_ticket_id: string | null;
  created_at: string;            // ISO-8601
}
```

Если WS-сервер недоступен, вызов просто проглатывается — уведомление всё равно лежит в БД и пользователь подхватит его на следующем `notification.list`. Очереди ретраев нет.

WS-сервер также экспонирует `system:notification` (типизировано как `BroadcastSystemPayload { message, type: 'info' | 'warning' | 'error' }`) для transient-баннеров. Эти события таблицу `notifications` не трогают.

## Чтение

`lib/trpc/routers/notification.ts`:

| Процедура | Назначение |
|-----------|------------|
| `notification.list` | Курсорная пагинация плоского списка, новые сверху. Курсор — `id` последней строки; сервер резолвит `id → createdAt` для keyset pagination. |
| `notification.groupedList` | Те же данные, сгруппированные по `relatedTicketId` (с `unread_count`, `total_count`, `latest_at` и последними 5 элементами в каждой группе). Курсор — `latest_at`. |
| `notification.unreadCount` | `{ count }`, кэшируется на 10 секунд в `lib/database/cache.ts`. Кэш сбрасывается на каждой записи. |
| `notification.markRead` | Помечает одно уведомление прочитанным. |
| `notification.markGroupRead` | Помечает все непрочитанные уведомления по конкретному `relatedTicketId` одним SQL. Используется колокольчиком при открытии тикета. |
| `notification.markAllRead` | Помечает все непрочитанные уведомления прочитанными. Используется кнопкой «Прочитать все» в колокольчике. |

Все процедуры инвалидируют `notif_unread:<userId>`, чтобы значок обновился на следующем поллинге `unreadCount`.

## Политика очистки

Прочитанные уведомления старше 30 дней удаляются оппортунистически: `cleanupOldNotifications(userId)` вызывается из `createNotification` при каждой новой записи, но throttled in-memory кэшем (`notif_cleanup:<userId>`, TTL 1 час), чтобы конкурентные продюсеры не запускали один и тот же DELETE одновременно.

```ts
DELETE FROM notifications
WHERE user_id = $1
  AND is_read = true
  AND created_at < now() - interval '30 days'
```

Непрочитанные уведомления не чистятся автоматически — они остаются, пока пользователь их не прочитает.

## Файлы

- `lib/notifications/create.ts` — `createNotification(params)`, `cleanupOldNotifications(userId)`.
- `lib/trpc/routers/notification.ts` — `list`, `groupedList`, `unreadCount`, `markRead`, `markGroupRead`, `markAllRead`.
- `lib/database/schema.ts` — таблица `notifications` + индексы.
- `lib/websocket/types.ts` — `WsNotificationPayload`, `BroadcastSystemPayload`.
- `lib/websocket/client.ts` — `broadcastNotification(userId, payload)`.
- Продюсеры: `lib/trpc/routers/support.ts` (поиск `createNotification(`).
