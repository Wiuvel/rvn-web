# IP-геолокация устройств

> **[English version](geolocation.en.md)**

## Обзор

Модуль `lib/utils/geolocation.ts` определяет местоположение пользователя по IP-адресу при регистрации/обновлении устройства. Результат сохраняется в `user_devices.location` как текст на русском языке (напр. `"Москва, Россия"`).

Локация — чисто информационная, отображается в настройках профиля. Не используется для безопасности.

## Архитектура

```
registerDevice() / createSession()
  └→ resolveAndStoreLocation(deviceId, ip)  [fire-and-forget]
       └→ lookupIP(ip)
            ├─ 1. Приватный IP? → null
            ├─ 2. Кеш (Map, 10K, TTL 24ч) → hit? → return
            ├─ 3. MaxMind GeoLite2-City.mmdb → найдено? → return
            └─ 4. ip-api.com/json/{ip}?lang=ru → return
```

## Источники данных

### MaxMind GeoLite2 (primary)

- Локальная .mmdb база, ~70MB
- Загружается лениво при первом запросе (или при startup check)
- Поддерживает локализацию из коробки: `result.city.names.ru`, `result.country.names.ru`
- Fallback на `.names.en` если русского перевода нет

**В production (Docker)**: скачивается при сборке образа из [P3TERX/GeoLite.mmdb](https://github.com/P3TERX/GeoLite.mmdb) — зеркало, обновляемое ежедневно через CI.

**В dev**: .mmdb отсутствует, модуль автоматически переключается на fallback.

### ip-api.com (fallback)

- Бесплатный HTTP API, без ключа
- Ограничение: 45 req/min (мы ставим 40 req/min через throttle 1.5s)
- Timeout: 3 секунды
- `?lang=ru` — русская локализация
- Используется в dev-режиме и как fallback при ошибках MaxMind

## Формат хранения

В БД (`user_devices.location`, TEXT) хранится готовая строка на русском:

| Пример | Когда |
|--------|-------|
| `Москва, Россия` | Есть и город, и страна |
| `Россия` | Только страна |
| `NULL` | Приватный IP / не удалось определить |

### Почему текст, а не коды

- UI отображает as-is, без дополнительных запросов
- Нет необходимости в мультиязычности (проект на русском)
- Нет lookup-таблиц, маппингов, зависимостей
- При необходимости легко мигрировать: добавить `country_code` колонку и заполнить

### Альтернативы (не выбраны)

| Подход | Плюс | Минус |
|--------|------|-------|
| `geoname_id` + `country_code` | Компактно, мультиязычно | Нужна lookup-таблица городов на клиенте |
| JSONB `{city_ru, country_ru, country_code}` | Гибко | Избыточно для информационного поля |

## Кеширование

In-memory `Map<ip, {value, expiresAt}>`:
- Макс. 10,000 записей (FIFO eviction)
- TTL: 24 часа
- Кешируются и положительные, и отрицательные результаты (`null`)

## Конфигурация

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `MAXMIND_DB_PATH` | `./data/GeoLite2-City.mmdb` | Путь к .mmdb файлу |

## Startup check

В `instrumentation.ts` при старте сервера:
```
[startup] GeoIP: MaxMind ready (./data/GeoLite2-City.mmdb)
[startup] GeoIP: ip-api.com fallback (no .mmdb found)
```

## Точки вызова

`session-manager.ts` — 4 места:

1. `registerDevice()` — обновление существующего устройства по fpid
2. `registerDevice()` — insert нового устройства с fpid
3. `registerDevice()` — insert/update устройства без fpid (по deviceName + IP)
4. `createSession()` — fire-and-forget при обновлении lastActive

Все вызовы через `resolveAndStoreLocation()` — fire-and-forget, никогда не блокируют основной flow и не бросают исключений.
