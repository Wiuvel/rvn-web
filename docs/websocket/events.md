# Справочник WebSocket событий

> **[English version](events.en.md)**

## Клиент → Сервер

| Событие | Payload | Описание |
|---|---|---|
| `support:join` | `{ ticketId: string }` | Войти в комнату тикета |
| `support:leave` | `{ ticketId: string }` | Покинуть комнату тикета |
| `support:typing` | `{ ticketId: string, isTyping: boolean }` | Индикатор набора текста (лимит: 1с интервал, 10/мин) |
| `profile:join` | `{ profileId: string }` | Войти в комнату комментариев профиля |
| `profile:leave` | `{ profileId: string }` | Покинуть комнату комментариев профиля |

## Сервер → Клиент

| Событие | Payload | Описание |
|---|---|---|
| `support:message:new` | `{ ticketId, message }` | Новое сообщение в тикете |
| `support:ticket:updated` | `{ ticketId, ticket }` | Изменение статуса/метаданных тикета |
| `support:ticket:assigned` | `{ ticketId, assignedTo, assignedUser }` | Тикет назначен агенту поддержки |
| `support:typing:status` | `{ ticketId, userId, username, isTyping }` | Кто-то печатает в тикете |
| `support:message:read` | `{ ticketId, messageIds[], readBy }` | Сообщения отмечены как прочитанные |
| `support:error` | `{ message, code? }` | Уведомление об ошибке |
| `profile:comment:new` | `{ profileId, comment }` | Новый комментарий в профиле |
| `notification:new` | `{ notification }` | Новое уведомление пользователю (targeted в `user:{userId}` room) |
| `system:notification` | `{ message, type? }` | Системное уведомление (рассылается всем подключенным клиентам) |

## Комнаты

- `user:{userId}` — Персональная комната пользователя. Авто-присоединение при подключении. Используется для уведомлений.
- `ticket:{ticketId}` — Комната тикета. Пользователи могут входить только в свои тикеты; поддержка — в любой.
- `profile:{profileId}` — Комната комментариев профиля. Любой аутентифицированный пользователь.

## Коды ошибок

| Код | Описание |
|---|---|
| `INVALID_DATA` | Отсутствует или некорректный payload |
| `INVALID_TICKET_ID` | Ticket ID не является валидным UUID |
| `TICKET_NOT_FOUND` | Тикет не существует |
| `ACCESS_DENIED` | Нет доступа к этому тикету |
| `VALIDATION_ERROR` | Ошибка сервера при проверке доступа |
| `SERVICE_UNAVAILABLE` | Auth-сервис недоступен |

## Broadcast REST эндпоинты

Используются rvn-web для отправки событий через WS-сервер. Все требуют заголовок `x-internal-api-key`.

| Эндпоинт | Эмитит |
|---|---|
| `POST /broadcast/support/message` | `support:message:new` |
| `POST /broadcast/support/ticket-update` | `support:ticket:updated` |
| `POST /broadcast/support/ticket-assigned` | `support:ticket:assigned` |
| `POST /broadcast/support/message-read` | `support:message:read` |
| `POST /broadcast/profile/comment` | `profile:comment:new` |
| `POST /broadcast/notification` | `notification:new` (в комнату `user:{userId}`) |
| `POST /broadcast/system` | `system:notification` |
