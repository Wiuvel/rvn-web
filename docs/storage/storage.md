# Хранилище и медиа

> **[English version](storage.en.md)**

## Обзор

Подсистема хранилища обрабатывает загружаемые пользователями файлы (аватары, баннеры, вложения тикетов поддержки), отдаёт их обратно через HTTP API, кэширует бинарники в Redis и применяет преобразования изображений (ресайз, ThumbHash blur preview) через Rust → WASM модуль.

```
┌───────────────┐   upload   ┌──────────────────┐
│   Browser     │───────────►│  /api/auth/...   │
│  <input file> │            │  /api/support/   │
└───────────────┘            │       upload     │
        ▲                    └────────┬─────────┘
        │                             │ validateFileContent (magic bytes)
        │  GET image                  │ generateThumbhash (WASM)
        │  /images/users/:path        ▼
        │  /support/files/:key   ┌──────────────────┐
        │                        │  S3-совместимое  │
        │                        │   Object Storage │
        │                        └────────┬─────────┘
        │                                 │
        │   Redis HIT       cache miss    │
        └─────────┬───────────────────────┘
                  ▼
            ┌───────────────────┐
            │   Redis (gzip)    │
            │  media:body:KEY   │
            │  media:meta:KEY   │
            └───────────────────┘
```

## Архитектура

### S3-совместимое объектное хранилище

`lib/storage/s3-client.ts` оборачивает AWS SDK v3 (`@aws-sdk/client-s3`) с path-style URL — работает с MinIO, Cloudflare R2, Yandex Object Storage и т.п. Клиент ленивый: `getS3Client()` возвращает `null`, если хотя бы одна из переменных `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` не задана; все потребители обрабатывают `null` как 503 либо просто пропускают запись в кэш.

| Функция | Назначение |
|---------|------------|
| `uploadFileToS3(file, key, contentType)` | Authenticated-read загрузка (вложения тикетов) |
| `uploadAvatarToS3(file, key, contentType)` | Public-read загрузка (аватары, баннеры) |
| `uploadAvatarFromUrl(imageUrl, userId)` | Скачивает внешний аватар (например, OAuth-провайдера), валидирует по magic bytes, заливает с проверенным MIME |
| `deleteFileFromS3(key)` | Hard-delete |
| `getPresignedUrl(key, expiresIn=3600)` | Временная GET-ссылка (внутреннее использование) |
| `getObjectAsBuffer(key)` | Скачивание в `Buffer` для прогрева кэша и проксирования через API |
| `generateStoragePath(ticketId, fileName, messageId?)` | Генерация канонического S3-ключа для вложений |
| `validateFile({ size, type, name })` | Whitelist по MIME и размеру (`AVATAR_MAX_BYTES`, `SUPPORT_ATTACHMENT_MAX_BYTES`) |
| `isImageFile(mime)` / `isDocumentFile(mime, name)` | Хелперы для обработчиков загрузки |

### Структура ключей в S3

| Ресурс    | Формат ключа |
|-----------|--------------|
| Avatar    | `avatars/{userId}/{timestamp}.{ext}` |
| Banner    | `banners/{userId}/{timestamp}.{ext}` |
| Support   | `support/{ticketId}/{messageId}/{timestamp}_{file}` |
| Pending   | `support/{ticketId}/pending/{timestamp}_{file}` (загружено до создания сообщения) |

`{file}` санитизируется в `[a-zA-Z0-9._-]` — это делает ключи URL-safe и предотвращает path traversal.

### Redis-кэш медиа

`lib/storage/media-cache.ts` реализует Redis-кэш бинарников для горячих медиа. На каждый объект два ключа:

- `media:body:{s3Key}` — payload в base64 (gzip, если `MEDIA_CACHE_COMPRESS=true` и тело ≥ 512 байт).
- `media:meta:{s3Key}` — JSON `{ content_type, size, compressed? }`.

Разрешённые префиксы (всё остальное не кэшируется): `support/`, `avatars/`, `banners/`.

| Функция | Поведение |
|---------|-----------|
| `getMediaFromCache(s3Key)` | Возвращает `{ body, contentType }` либо `null`. Прозрачно распаковывает gzip. Любая ошибка Redis → `null`. |
| `setMediaCache(s3Key, body, contentType, { ttlSec?, isAvatarOrBanner? })` | Пишет оба ключа с TTL. Пропускается, если размер > `MEDIA_CACHE_MAX_OBJECT_MB`, префикс не разрешён или Redis недоступен. |
| `invalidateMediaCache(s3Key)` | Удаляет оба ключа. Вызывается при замене аватара/баннера и удалении сообщения. |

Прогрев кэша: маршруты загрузки аватара/баннера сразу после `S3 PUT` вызывают `setMediaCache`, поэтому первый GET — HIT.

### WASM image processor

`wasm/src/lib.rs` (Rust crate, собирается в `lib/wasm/pkg` через `wasm-bindgen`) экспортирует:

| Функция | Назначение |
|---------|------------|
| `resize_image(input, w, h)` | `resize_exact` с фильтром Triangle, формат определяется через `image::guess_format`. Возвращает вход без изменений, если `w==0 \|\| h==0`. |
| `generate_thumbhash(input)` | Ресайз до ≤100×100, генерация [ThumbHash](https://evanw.github.io/thumbhash/) blur-превью. Возвращает `{ width, height, thumbhash }`. |

Загрузчик (`lib/wasm/image-processor.ts`) сначала пробует CommonJS `require()` (работает в Next.js standalone-сборках), затем — динамический `import('./pkg/...')`. При ошибке `processImage` и `generateThumbhash` логируют ошибку и **возвращают исходный буфер / nulls** — флоу с изображениями никогда не блокируется отсутствием WASM-сборки.

`next.config.ts` тащит `lib/wasm/pkg/**/*` через `outputFileTracingIncludes`, чтобы standalone-сборка содержала скомпилированный модуль.

## Поток запросов

### GET аватар/баннер — `app/images/users/[...path]/route.ts`

1. Парсим `path[]` в `s3Key` (`avatars/{userId}/{file}` или `banners/{userId}/{file}`).
2. Валидируем: `userId` — UUID, имя файла оканчивается на разрешённое расширение (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`).
3. `getMediaFromCache(s3Key)` → при HIT отдаём тело с `X-Cache: HIT` и `Cache-Control: public, max-age=…`.
4. При MISS: `getObjectAsBuffer(s3Key)` → `processImage(body, {})` (no-op без размеров) → `setMediaCache(...)` → ответ с `X-Cache: MISS`.
5. `NoSuchKey` / 404 от S3 → JSON 404.

### GET вложения тикета — `app/support/files/[key]/route.ts`

Авторизованный маршрут — читать могут только участники тикета и персонал поддержки. Использует тот же Redis-кэш, но TTL — `MEDIA_CACHE_TTL_SEC_SUPPORT`.

### Загрузка аватара — `app/api/auth/avatar/route.ts`

1. Валидация сессии и CSRF.
2. Чтение `multipart/form-data`, контроль `AVATAR_MAX_BYTES`.
3. `validateFileContent(buffer, declaredMime, 'avatar')` — magic-byte sniffing в `lib/validation/magic-bytes.ts`. Возвращает `verifiedType` (отвергает несоответствие расширения/MIME).
4. `uploadAvatarToS3(buffer, key, verifiedType)` (public-read).
5. `setMediaCache(key, buffer, verifiedType, { isAvatarOrBanner: true })` — прогрев кэша.
6. Обновляем `users.avatar` и `users.avatarUpdatedAt`, инвалидируем auth-кэш пользователя.

### Загрузка вложения тикета — `app/api/support/upload/route.ts`

1. До `MAX_FILES_PER_REQUEST = 2` файлов за запрос.
2. На каждый файл: magic-byte валидация, затем `generateThumbhash(buffer)` для изображений — извлекаем `{ width, height, thumbhash }` для blur-плейсхолдеров в чате.
3. `uploadFileToS3(buffer, key, verifiedType)` (authenticated-read).
4. Запись в `support_message_attachments` с `blur_hash`, `width`, `height`, `storage_path`.

## Конфигурация

Переменные окружения (см. `.env.example`):

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `S3_ENDPOINT` | — | URL S3-совместимого API |
| `S3_BUCKET` | — | Имя бакета |
| `S3_ACCESS_KEY` | — | Access key id |
| `S3_SECRET_KEY` | — | Secret key |
| `S3_REGION` | `us-east-1` | Регион (нужен подписывальщику AWS SDK) |
| `MEDIA_CACHE_ENABLED` | `true`, если задан `REDIS_URL` | Главный выключатель Redis-слоя |
| `MEDIA_CACHE_MAX_OBJECT_MB` | `2` | Не кэшировать объекты больше этого размера |
| `MEDIA_CACHE_TTL_SEC_SUPPORT` | `3600` | TTL для `support/` |
| `MEDIA_CACHE_TTL_SEC_AVATARS` | `86400` | TTL для `avatars/` и `banners/` |
| `MEDIA_CACHE_COMPRESS` | `true` | gzip тел ≥ 512 байт |

Если `S3_*` не задано, эндпойнты загрузки отвечают 503; если не задан `REDIS_URL`, кэш отключён и каждый GET идёт в S3.

## Файлы

- `lib/storage/s3-client.ts` — обёртка AWS SDK, помощники загрузки, генерация ключей, валидация MIME.
- `lib/storage/media-cache.ts` — Redis-кэш с gzip и политикой TTL.
- `lib/wasm/image-processor.ts` — загрузчик WASM, `processImage`, `generateThumbhash` с graceful fallback.
- `wasm/src/lib.rs` — Rust-исходники (resize, ThumbHash).
- `lib/validation/magic-bytes.ts` — magic-byte валидация контента, маппинг MIME → расширение.
- `app/images/users/[...path]/route.ts` — публичный read-эндпойнт аватара/баннера с кэшем.
- `app/support/files/[key]/route.ts` — авторизованный read-эндпойнт вложений.
- `app/api/auth/avatar/route.ts`, `app/api/auth/banner/route.ts` — загрузка + прогрев кэша.
- `app/api/support/upload/route.ts` — мульти-файл загрузка + извлечение ThumbHash.
- `next.config.ts` — `outputFileTracingIncludes` для WASM-бандла.
