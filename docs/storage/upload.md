# Pipeline загрузки файлов

> **[English version](upload.en.md)**

## Обзор

Приложение принимает загрузки в трёх местах: аватары, баннеры и вложения в support-чате. Все три проходят через общие хелперы `lib/storage/s3-client.ts` и в итоге попадают в S3-совместимое Object Storage (endpoint конфигурируется — работает с AWS S3, MinIO, Backblaze B2 и т.п.). Контракт намеренно строгий:

1. **Multipart POST**, не presigned PUT. Сервер читает файл в `Buffer` и валидирует всё ещё до того, как уйдёт хоть один S3-вызов.
2. **Magic-bytes валидация** работает поверх Content-Type. Заявленный клиентом MIME — это лишь подсказка, а не факт; реальную сигнатуру в файле перебивает.
3. **Auth + rate limit** проверяются до того, как сервер прочитает хоть один байт тела.

## End-to-end

```
[Браузер] FormData (file)
        │
        ▼
[POST /api/auth/avatar | /api/auth/banner | /api/support/upload]
  • generalRateLimit.check(request)
  • checkAuth(request) → 401, если не авторизован
  • request.formData() → File
        │
        ▼
[validateFile({ size, type, name })]
  • size ≤ AVATAR_MAX_BYTES / SUPPORT_ATTACHMENT_MAX_BYTES
  • size > 0
  • заявленный MIME ∈ allowed list
        │
        ▼
[file.arrayBuffer() → Buffer]
        │
        ▼
[validateFileWithContent({size,type,name}, buffer)]
  • detectMimeType(buffer) по magic bytes
  • detectedType ∈ allowed list
  • detectedType совместим с заявленным типом
        │
        ▼
[avatar/banner: дополнительные правила]
  • startsWith('image/')
  • не 'image/gif'
        │
        ▼
[generateThumbhash(buffer)]   // опционально — только для support-вложений
        │
        ▼
[uploadFileToS3(buffer, key, verifiedType)]
[setMediaCache(key, buffer, verifiedType, …)]   // прогрев Redis-кэша
        │
        ▼
[DB: UPDATE users.avatar | INSERT support_messages.attachments]
[invalidateUserAuthCacheByUserId / cache.delete profile]
        │
        ▼
[(аватар) deleteFileFromS3(oldKey) — best-effort, после коммита БД]
        │
        ▼
[200 OK { url, ... }]
```

## Валидация типа файла

Два слоя, оба обязательны:

### Слой 1 — `validateFile()`

`lib/storage/s3-client.ts → validateFile({size,type,name})` проверяет метаданные, заявленные клиентом:

| Правило | Детали |
|---------|--------|
| Size | `size > 0` и `size ≤ SUPPORT_ATTACHMENT_MAX_BYTES`. Avatar-роут дополнительно проверяет `size ≤ AVATAR_MAX_BYTES`. |
| Type | Заявленный MIME должен быть одним из `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`. |
| Расширение fallback | Имена `.pdf` и `.txt` проходят, даже если `Content-Type` отсутствует — некоторые браузеры шлют `application/octet-stream` для plain text. |

Слой быстрый (буфер не нужен) и позволяет отбросить очевидно плохие запросы до чтения тела.

### Слой 2 — `validateFileWithContent()`

`lib/validation/magic-bytes.ts → detectMimeType(buffer)` читает первые байты:

| MIME | Сигнатура |
|------|-----------|
| PNG | `89 50 4E 47 0D 0A 1A 0A` на offset 0 |
| JPEG | `FF D8 FF` на offset 0 |
| GIF | `47 49 46 38 39 61` (GIF89a) или `47 49 46 38 37 61` (GIF87a) |
| WebP | `RIFF` на offset 0 + `WEBP` на offset 8 |
| PDF | `%PDF` на offset 0 |
| SVG | `<svg` в первом 1 KB (текстовый формат, бинарной сигнатуры нет) |
| TXT | только по расширению `.txt` — у plain text нет сигнатуры |

`validateFileContent(buffer, declaredType, fileName)` отклоняет запрос, если:

- `detectMimeType` вернул null (повреждён / неизвестный формат).
- Detected MIME не входит в allowlist (закрывает вариант «заявил `application/pdf`, прислал `.exe`»).
- Detected MIME = `image/gif` для avatar/banner-роутов (анимированные аватары запрещены явно).

Дальше роут доверяет `verifiedType = detectedType || file.type` для downstream-операций (S3 `Content-Type`, расширение через `getExtensionFromMime`).

## Особенности роутов

### Аватары — `app/api/auth/avatar/route.ts`

- Лимит: `AVATAR_MAX_BYTES` (2 MB).
- Разрешённые типы: только изображения, **без GIF** (анимированные аватары запрещены).
- Storage path: `avatars/<userId>/<timestamp>.<ext>` — timestamp ломает browser cache при перезаписи.
- `users.avatar` ставится в `s3:<storagePath>` (префикс `s3:` сообщает read-path'у, что нужно идти через `media-cache`, а не по внешнему URL).
- Старый аватар удаляется после успешного коммита в БД, **с проверкой пути** — путь обязан начинаться с `avatars/<userId>/`, чтобы исключить path-traversal между пользователями.
- `setMediaCache(...)` греет Redis-кэш — самый первый GET попадает в warm cache.
- `invalidateUserAuthCacheByUserId(userId)` + `cache.delete('profile:...')` делают новый аватар видимым на всех серверах/процессах сразу.

### Баннеры — `app/api/auth/banner/route.ts`

Та же форма, что и у аватаров, но storage path — `banners/<userId>/<timestamp>.<ext>`, лимит — `BANNER_MAX_BYTES`.

### Вложения в support — `app/api/support/upload/route.ts`

- Лимит: `SUPPORT_ATTACHMENT_MAX_BYTES`.
- До **2 файлов за запрос** (`MAX_FILES_PER_REQUEST`). Больше — несколько запросов.
- Разрешено: изображения (включая GIF) + PDF + plain text.
- Storage path: `support/<ticketId>/<messageId>/<filename>`.
- Для image-вложений запускается `generateThumbhash(buffer)` — см. ниже про WASM.
- Роут требует `?ticketId=…` и проверяет, что тикет принадлежит вызывающему (или что сессия — это support/admin).

## WASM image processor

`lib/wasm/image-processor.ts` оборачивает Rust → WASM модуль (`wasm/src/lib.rs`) с экспортом:

| Функция | Назначение |
|---------|------------|
| `resize_image(buf, width, height)` | Билинейный resize в указанные габариты. Формат сохраняется (PNG → PNG, JPEG → JPEG). |
| `generate_thumbhash(buf)` | Возвращает `{ width, height, thumbhash }` — base64 blur-placeholder. |

У обёртки есть graceful fallback: если WASM не загрузился (запуск сервера без `wasm-pack build`, runtime-ошибка), `resize_image()` возвращает оригинальный буфер, а `generate_thumbhash()` — null. Загрузка в любом случае проходит, единственный эффект — UI не получит blur-плейсхолдер.

Thumbhash хранится рядом с метаданными вложения, чтобы чат мог отрисовать blur-плейсхолдер до загрузки полного изображения.

## Object Storage

`getS3Client()` возвращает клиент `@aws-sdk/client-s3`, сконфигурированный из `lib/validation/env-validation.ts`:

| Переменная | Обязательна | Примечания |
|------------|:-----------:|------------|
| `S3_ENDPOINT` | да | Custom endpoint (Backblaze, MinIO и т.п.) — `forcePathStyle: true`, чтобы не требовать subdomain-style URL. |
| `S3_ACCESS_KEY` | да | |
| `S3_SECRET_KEY` | да | |
| `S3_BUCKET` | да | |
| `S3_REGION` | нет | По умолчанию `us-east-1`. |

Загрузка использует `PutObjectCommand` с явным `ContentType` (verifiedType, не заявленный). Аватары и баннеры идут с `ACL: 'public-read'`, чтобы их можно было раздавать через CDN; support-вложения по умолчанию приватные и отдаются через `getSignedUrl`.

## Read path и медиа-кэш

`lib/storage/media-cache.ts` — Redis-кэш для тел и метаданных:

- Префиксы ключей: `media:body:<s3Key>`, `media:meta:<s3Key>`.
- Тела больше `MIN_BODY_SIZE_TO_COMPRESS` (512 байт) хранятся gzip-сжатыми, когда `MEDIA_CACHE_COMPRESS=true`.
- TTL по умолчанию: аватары/баннеры — 24 ч, support-вложения — 1 ч. Все значения настраиваются через `MEDIA_CACHE_TTL_SEC_*`.
- Кэшируются только allow-listed префиксы: `support/`, `avatars/`, `banners/`. Всё остальное идёт мимо кэша.
- Кэш автоматически выключается, если `REDIS_URL` не задан — поведение не меняется, просто на каждый запрос cold-fetch из S3.

## Файлы

- `app/api/auth/avatar/route.ts`, `app/api/auth/banner/route.ts`, `app/api/support/upload/route.ts` — точки входа.
- `lib/storage/s3-client.ts` — `getS3Client`, `uploadFileToS3`, `uploadAvatarToS3`, `deleteFileFromS3`, `validateFile`, `validateFileWithContent`.
- `lib/storage/media-cache.ts` — Redis-кэш тел.
- `lib/validation/magic-bytes.ts` — детект magic bytes, `detectMimeType`, `validateFileContent`.
- `lib/wasm/image-processor.ts` — WASM-обёртка.
- `wasm/src/lib.rs` — Rust → WASM источник `resize_image` и `generate_thumbhash`.
- `lib/utils/constants.ts` — лимиты по размеру.
