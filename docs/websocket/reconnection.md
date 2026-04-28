# Переподключение и устойчивость

> **[English version](reconnection.en.md)**

## Обзор

Web-клиент подключается к WebSocket-серверу (`rvn-socketio-server`) через Socket.IO. Соединение должно жить в течение всей авторизованной сессии, но на практике оно хрупкое — сети моргают, токены меняются, браузеры тормозят фоновые вкладки. Этот документ описывает, как `hooks/useWebSocket.ts` и `lib/websocket/client.ts` поддерживают соединение живым, не устраивая на сервере шторм reconnect'ов.

У двух частей разные задачи:

- **Браузерная сторона** (`hooks/useWebSocket.ts`) — владеет инстансом Socket.IO-клиента, React-жизненным циклом и состоянием членства в комнатах.
- **Node-сторона** (`lib/websocket/client.ts`) — fire-and-forget рассылки из API-роутов и tRPC в WS-сервер. Без переподключений: вызов не получился — залогировали и поехали дальше.

## Жизненный цикл соединения (браузер)

```
[useWebSocket({ enabled, token, ticketId })]
        │
        ▼
[token есть?] ──нет──→ сокет не создаём, лог "no token, skipping"
        │ да
        ▼
[debounce 100 мс, потом подключение]
        │
        ▼
io(NEXT_PUBLIC_WS_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  forceNew: false,
  autoConnect: true,
  auth: { token },
})
        │
        ▼
[connect] → setIsConnected(true), авто-rejoin currentTicketIdRef
[disconnect] → setIsConnected(false)
[connect_error] → классифицируем ошибку, при необходимости чистим токен
[error] → логируем только не-transport ошибки
```

Ключевые опции Socket.IO-клиента:

| Опция | Значение | Зачем |
|-------|----------|-------|
| `transports` | `['websocket', 'polling']` | Сначала WebSocket; polling-fallback для враждебных сетей (корпоративные прокси, мобильные операторы). |
| `reconnection` | `true` | Встроенный retry Socket.IO. Свой цикл переподключения мы не пишем. |
| `reconnectionAttempts` | `5` | После 5 фейлов клиент сдаётся и остаётся отключённым. Следующее действие пользователя (смена роута, обновление токена, ручной reload) создаст новый сокет. |
| `reconnectionDelay` / `reconnectionDelayMax` | `1000` / `5000` | Экспоненциальный backoff не превышает 5 секунд — достаточно быстро, чтобы ощущалось «живо», достаточно медленно, чтобы не задолбить сервер во время аварии. |
| `timeout` | `20000` | 20 секунд на соединение. Всё, что медленнее, считается жёстким фейлом. |
| `forceNew` | `false` | Переиспользуем manager там, где можно — экономим на TCP/TLS-handshake'ах при ремаунте хука. |

## Зачем 100 мс debounce

При первом монтировании компонентов с `useWebSocket` за несколько сотен миллисекунд проходит обычно три состояния:

1. `token = undefined` (auth-запрос летит)
2. `token = '<value>'` (auth-запрос отрезолвился)
3. `token = '<тот же value>'` (ререндер из-за другого state)

Без debounce каждое такое изменение тащило бы за собой пересоздание сокета и шторм `connect → disconnect → connect_error` на WS-сервере. Тайм-аут на 100 мс схлопывает всё в одну попытку подключения:

```ts
reconnectTimeoutRef.current = setTimeout(() => {
  // отключаем старый сокет, только если токен действительно поменялся
  if (cleanupRef.current && currentTokenRef.current !== token) {
    cleanupRef.current();
  }
  currentTokenRef.current = token;
  // ...создаём новый сокет
}, 100);
```

Тот же ref-guard (`currentTokenRef.current === token && socketRef.current?.connected`) делает ререндеры без смены токена no-op'ом.

## Ротация токена

Соединение привязано к значению cookie `token`. Когда `checkAuth` выдаёт новый токен (редко — только при полном перелогине), prop меняется, и хук переподключается с новым токеном в `auth: { token }`. Перед этим явно отключаем старый сокет, чтобы освободить auth-slot на сервере.

Если сервер отклоняет токен (`Authentication`, `Invalid token`, `Authentication required` в сообщении `connect_error`), хук обнуляет `currentTokenRef.current`. Это разрывает Socket.IO retry-loop с протухшим токеном — иначе бы все 5 попыток ушли с тем же плохим credential. Пользователь должен пройти повторную авторизацию (стандартный auth-флоу), которая в итоге передаст новый `token` prop и спровоцирует чистое переподключение.

CORS-ошибки (`CORS`, `origin` в сообщении) логируются отдельной диагностикой; они обычно указывают на ошибочный `WS_ALLOWED_ORIGINS` на сервере и сами не пройдут, пока его не починят.

## Членство в комнатах при переподключении

Тикеты и профильные страницы привязаны к Socket.IO-комнатам. Хук хранит текущий ticketId в ref'е (`currentTicketIdRef`), чтобы на каждом событии `connect` автоматически переэмиттить `support:join`:

```ts
socket.on('connect', () => {
  setIsConnected(true);
  if (currentTicketIdRef.current) {
    socket.emit('support:join', { ticketId: currentTicketIdRef.current });
  }
});
```

Это сделано намеренно: `ticketId` **не** входит в зависимости connect-эффекта, поэтому смена тикета внутри страницы не вызывает реконнект — отрабатывают только `joinTicket(newId)` / `leaveTicket(oldId)`. При переподключении хук подхватывает то, что пользователь сейчас смотрит, без ручной координации со стороны вызывающего компонента.

Тот же паттерн экспонируется и для профилей через `joinProfile` / `leaveProfile`. И `joinTicket`, и `joinProfile` ставят join в очередь до `socket.connected === true` и пропускают, если комната уже та же.

## Индикатор typing

`sendTyping(ticketId, isTyping)` — best-effort: эмиттит `support:typing` только когда сокет подключён. Буферизации нет: если сокет лежит, событие тихо теряется. И это нормально: typing — это UX-подсказка, потеря одного нажатия клавиши не меняет состояние приложения.

## Очистка

При unmount или смене зависимостей хук:

1. Чистит pending-таймер debounce.
2. Явно отписывает Socket.IO-листенеры (`off('connect')`, `off('disconnect')`, `off('connect_error')`, `off('error')`) — Socket.IO сам их не снимает.
3. Вызывает `socket.disconnect()`, чтобы освободить slot на сервере.
4. Зануляет `socketRef.current` и делает `setSocket(null)`, чтобы потребители не могли случайно использовать мёртвый сокет.

Снятие листенеров важно: один и тот же `useWebSocket` монтируется в `SupportClient` и `AdminSupportClient`, и оба маунтятся-размаунтятся при переходах. Без `off()` каждая навигация утекала бы обработчиками и держала бы в памяти живые stale-замыкания.

## Серверные рассылки (Node)

`lib/websocket/client.ts` — это API-роутная сторона контракта:

```ts
broadcastSupportMessage(ticketId, message)
broadcastTicketUpdate(ticketId, update)
broadcastNotification(userId, notification)
broadcastSystem(payload)
broadcastTicketAssignment(ticketId, assignedTo, assignedUser)
broadcastProfileComment(profileId, comment)
```

Это HTTP POST'ы в WS-сервер. Сделаны они намеренно fire-and-forget:

- Без ретраев и очереди. Если WS-сервер лежит, рассылка теряется; клиент перезапросит состояние на следующем обращении (`notification.list`, `support.getTicket`).
- Таймаут 5 секунд не даёт зависшему WS-серверу заблокировать API-роуты.
- Ошибки логируются, но никогда не пробрасываются — сбой уведомления не должен валить производящую tRPC-мутацию.

Это правильный trade-off, потому что каждая рассылка — это побочный эффект уже успешной записи в БД. БД — источник правды; WS — лишь быстрый канал доставки.

## Сценарии отказа

| Симптом | Причина | Что происходит |
|---------|---------|----------------|
| Баннер «не подключено» не уходит (`isConnected = false`) | WS-сервер недоступен, все 5 попыток зафейлились | Хук остаётся disconnected. Real-time обновления молчат, но tRPC/REST продолжают работать. Следующий маунт попробует снова. |
| `connect_error: Authentication required` | Токен протух / отозван | `currentTokenRef` обнуляется, ретраи останавливаются. Пользователю нужна повторная авторизация. |
| `connect_error: CORS / origin` | На сервере `WS_ALLOWED_ORIGINS` не включает текущий origin | Логируется как CORS-ошибка; будет фейлиться, пока конфиг WS-сервера не починят. |
| Фоновая вкладка «замораживается», потом догоняет | Браузер тормозит таймеры/сокеты в фоне | На фокус вкладки браузер триггерит `visibilitychange`, и Socket.IO сам реконнектится из `disconnected`. |
| `disconnect reason = transport close` | Сетевой сбой | Socket.IO ретраит с backoff, до 5 попыток. Обычно восстанавливается за секунды. |

## Файлы

- `hooks/useWebSocket.ts` — браузерный хук (connect, debounce, token-binding, room rejoin, typing).
- `lib/websocket/client.ts` — Node-сайдные хелперы рассылок.
- `lib/websocket/types.ts` — общие payload-типы (зеркало `rvn-socketio-server`).
- `docs/websocket/architecture.md` — общая архитектура и каталог событий.
- `docs/websocket/events.md` — полный справочник событий.
