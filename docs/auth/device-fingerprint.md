# Фингерпринтинг устройств

> **[English version](device-fingerprint.en.md)**

## Обзор

Двухуровневая система идентификации устройств для группировки записей в `user_devices`. Предотвращает дубликаты при повторных входах с одного устройства.

Не используется для безопасности — только для UX (список устройств в настройках профиля).

## Архитектура

```
Вход / Регистрация
       ↓
 [Клиент]
 getOrCreateFpid()  ← IndexedDB
       ↓
 Отправка на сервер (tRPC input / cookie для OAuth)
       ↓
 [Сервер]
 computeDeviceFpHash(ua, ip, fpid)
       ↓
 SELECT ... WHERE userId = ? AND deviceFpHash = ?
       ↓
   ┌───┴───┐
 Найден   Нет
   ↓       ↓
 UPDATE   INSERT
```

## Layer 1: Клиентский FPID

**Файл:** `lib/auth/device-fingerprint.client.ts`

### Генерация

- Формат: `MP_` + 12 случайных base64-символов (напр. `MP_x7kL9mN2pQ4r`)
- Источник: `crypto.getRandomValues(new Uint8Array(12))`
- Создаётся один раз, живёт в IndexedDB до ручного удаления

### Хранение

IndexedDB `rvn_device` (v1), два store:

| Store | Содержимое | Назначение |
|-------|-----------|------------|
| `fpid` | `{ fpid, time, lastSentAt }` | Сам идентификатор |
| `rb_sync` | `{ hash, lastSentTime }` | Контроль целостности (hash от `fpid:time`) |

### getOrCreateFpid()

1. Читает FPID из IndexedDB
2. Проверяет целостность через `rb_sync.hash`
3. Если отсутствует или повреждён — генерирует новый
4. Возвращает `{ fpid, time, lastSentAt }`

### Передача на сервер

**Форма входа/регистрации** (`components/auth/Form.tsx`):
```
fpid = getOrCreateFpid() → loginMutation({ fpid }) → markFpidSent()
```

**OAuth** (popup → redirect → callback):
```
getOrCreateFpid() → setFpidCookieForOAuth(fpid)
  ↓
cookie "rvn_fpid" (max-age: 5 мин)
  ↓
OAuth callback читает cookie → registerDevice(fpid) → удаляет cookie
```

Cookie с коротким TTL (5 мин) — потому что OAuth redirect теряет контекст IndexedDB.

## Layer 2: Серверный хеш

**Файл:** `lib/auth/device-fingerprint.server.ts`

### computeDeviceFpHash(ua, ip, fpid)

Вычисляет SHA256 из нормализованных компонентов:

**1. User-Agent → `browser:os`**
```
"Mozilla/5.0 (Windows NT 10.0; ...) Chrome/120.0..." → "chrome:windows"
```

Распознаёт: Chrome, Firefox, Safari, Edge, Opera, Brave, Vivaldi, Yandex.
ОС: Windows, Mac, Linux, Android, iOS.

**2. IP → префикс**
```
IPv4: "185.22.174.56"  → "185.22.174"    (первые 3 октета)
IPv6: "2001:db8:1::1"  → "2001:db8:1::"  (первые 4 сегмента)
```

Последний октет игнорируется — один и тот же пользователь может менять IP внутри подсети.

**3. Payload**

| FPID | Payload | Точность |
|------|---------|----------|
| Есть | `chrome:windows\|185.22.174\|MP_x7kL9m` | Высокая |
| Нет | `chrome:windows\|185.22.174` | Средняя |

Результат: SHA256 hex (64 символа), хранится в `user_devices.device_fp_hash`.

## Группировка в registerDevice()

**Файл:** `lib/auth/session-manager.ts`

### С FPID (основной путь)

1. `deviceFpHash = computeDeviceFpHash(ua, ip, fpid)`
2. `SELECT id FROM user_devices WHERE userId = ? AND deviceFpHash = ?`
3. **Найден** → UPDATE (`tokenHash`, `lastActive`, `ipAddress`)
4. **Не найден** → INSERT (новое устройство)

### Без FPID (fallback)

Когда IndexedDB очищен или недоступен:

1. `SELECT id FROM user_devices WHERE userId = ? AND deviceName = ? AND ipAddress = ?`
2. **Найден** → UPDATE (тот же браузер + ОС на том же IP)
3. **Не найден** → INSERT

Менее точный — не различает два одинаковых браузера на одном IP.

## Сценарии дедупликации

| Сценарий | FPID | Совпадение | Результат |
|----------|------|------------|-----------|
| Тот же браузер, та же сеть | Persistent | `deviceFpHash` | UPDATE |
| Тот же браузер, другая сеть | Persistent | `deviceFpHash` | UPDATE (IP prefix в хеше, но FPID тот же → разные хеши → INSERT) |
| IndexedDB очищен | Новый | Нет совпадения хеша → fallback по `deviceName + IP` | UPDATE или INSERT |
| Приватный режим | Нет | `deviceName + IP` | UPDATE или INSERT |
| Другой браузер | Другой | Другой `deviceFpHash` | INSERT (новое устройство) |

> **Примечание:** При смене сети с persistent FPID создаётся новая запись, т.к. IP prefix входит в хеш. Это ожидаемое поведение — с точки зрения сервера это может быть другое устройство.

## Схема БД

```sql
user_devices:
  device_fp_hash  TEXT         -- SHA256, nullable, индексируется
  -- Индекс: (user_id, device_fp_hash) WHERE device_fp_hash IS NOT NULL
```

## Безопасность

- FPID никогда не логируется — в БД хранится только SHA256 хеш
- OAuth cookie `rvn_fpid` — max-age 5 минут, удаляется после использования
- Система не используется для аутентификации или авторизации
- Фингерпринт легко сбрасывается (очистка IndexedDB) — это by design
