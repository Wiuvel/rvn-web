# Storage & Media

> **[Русская версия](storage.md)**

## Overview

The storage subsystem handles user-uploaded files (avatars, banners, support attachments), serves them back through HTTP API routes, caches binaries in Redis, and applies image transforms (resize, ThumbHash blur preview) through a Rust → WASM module.

```
┌───────────────┐  upload    ┌──────────────────┐
│   Browser     │───────────►│  /api/auth/...   │
│  <input file> │            │  /api/support/   │
└───────────────┘            │       upload     │
        ▲                    └────────┬─────────┘
        │                             │ validateFileContent (magic bytes)
        │  GET image                  │ generateThumbhash (WASM)
        │  /images/users/:path        ▼
        │  /support/files/:key   ┌──────────────────┐
        │                        │  S3-compatible   │
        │                        │   Object Store   │
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

## Architecture

### S3-compatible Object Storage

`lib/storage/s3-client.ts` wraps the AWS SDK v3 `@aws-sdk/client-s3` using path-style URLs (works with MinIO, Cloudflare R2, Yandex Object Storage, etc.). The client is lazy: `getS3Client()` returns `null` if any of `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` is missing, and every consumer handles `null` by returning a 503 or skipping cache writes.

| Function | Purpose |
|----------|---------|
| `uploadFileToS3(file, key, contentType)` | Authenticated-read upload (support attachments) |
| `uploadAvatarToS3(file, key, contentType)` | Public-read upload (avatars, banners) |
| `uploadAvatarFromUrl(imageUrl, userId)` | Fetches an external avatar (e.g. OAuth provider), validates by magic bytes, uploads with verified MIME |
| `deleteFileFromS3(key)` | Hard delete |
| `getPresignedUrl(key, expiresIn=3600)` | Time-limited GET URL (used internally for support previews) |
| `getObjectAsBuffer(key)` | Download as `Buffer` for cache warming and proxying through API routes |
| `generateStoragePath(ticketId, fileName, messageId?)` | Builds canonical S3 key for support attachments |
| `validateFile({ size, type, name })` | MIME + size whitelist (`AVATAR_MAX_BYTES`, `SUPPORT_ATTACHMENT_MAX_BYTES`) |
| `isImageFile(mime)` / `isDocumentFile(mime, name)` | Helpers used by upload handlers |

### Storage paths

| Resource  | Key format |
|-----------|------------|
| Avatar    | `avatars/{userId}/{timestamp}.{ext}` |
| Banner    | `banners/{userId}/{timestamp}.{ext}` |
| Support   | `support/{ticketId}/{messageId}/{timestamp}_{file}` |
| Pending   | `support/{ticketId}/pending/{timestamp}_{file}` (uploaded before message create) |

`{file}` is sanitized to `[a-zA-Z0-9._-]` to keep keys URL-safe and to prevent traversal.

### Redis media cache

`lib/storage/media-cache.ts` provides a Redis-backed binary cache for hot media. Two keys per object:

- `media:body:{s3Key}` — base64-encoded payload (gzip-compressed if `MEDIA_CACHE_COMPRESS=true` and body ≥ 512 bytes).
- `media:meta:{s3Key}` — JSON `{ content_type, size, compressed? }`.

Allowed prefixes (other keys are not cached): `support/`, `avatars/`, `banners/`.

| Function | Behaviour |
|----------|-----------|
| `getMediaFromCache(s3Key)` | Returns `{ body, contentType }` or `null`. Decompresses transparently. Any Redis error → `null`. |
| `setMediaCache(s3Key, body, contentType, { ttlSec?, isAvatarOrBanner? })` | Writes both keys with TTL. Skipped if size > `MEDIA_CACHE_MAX_OBJECT_MB`, prefix not allowed, or Redis unavailable. |
| `invalidateMediaCache(s3Key)` | Deletes both keys. Called on avatar/banner replacement and message deletion. |

Cache warm-up: avatar/banner upload routes call `setMediaCache` immediately after S3 PUT so the first GET is a HIT.

### WASM image processor

`wasm/src/lib.rs` (Rust crate, compiled to `lib/wasm/pkg` via `wasm-bindgen`) exposes:

| Function | Purpose |
|----------|---------|
| `resize_image(input, w, h)` | Triangle-filter `resize_exact`, format auto-detected by `image::guess_format`. Returns input unchanged if `w==0 || h==0`. |
| `generate_thumbhash(input)` | Resizes to ≤100×100, generates [ThumbHash](https://evanw.github.io/thumbhash/) blur preview. Returns `{ width, height, thumbhash }`. |

Loader (`lib/wasm/image-processor.ts`) tries CommonJS `require()` first (works in Next.js standalone bundles), falls back to dynamic `import('./pkg/...')`. On failure, both `processImage` and `generateThumbhash` log the error and **return the original buffer / nulls** — image flows are never blocked by a missing WASM build.

`next.config.ts` ships `lib/wasm/pkg/**/*` via `outputFileTracingIncludes` so the standalone build contains the compiled module.

## Request flow

### Avatar / banner GET — `app/images/users/[...path]/route.ts`

1. Parse `path[]` into `s3Key` (`avatars/{userId}/{file}` or `banners/{userId}/{file}`).
2. Validate `userId` is a UUID, filename has an allowed extension (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`).
3. `getMediaFromCache(s3Key)` → on HIT, return body with `X-Cache: HIT` and `Cache-Control: public, max-age=…`.
4. On MISS: `getObjectAsBuffer(s3Key)` → `processImage(body, {})` (no-op when no dimensions) → `setMediaCache(...)` → respond with `X-Cache: MISS`.
5. `NoSuchKey` / 404 from S3 → 404 JSON.

### Support attachment GET — `app/support/files/[key]/route.ts`

Authenticated route — only members of the ticket and support staff may read. Uses the same Redis cache, but TTL is governed by `MEDIA_CACHE_TTL_SEC_SUPPORT`.

### Avatar upload — `app/api/auth/avatar/route.ts`

1. Validate session + CSRF.
2. Read `multipart/form-data`, enforce `AVATAR_MAX_BYTES`.
3. `validateFileContent(buffer, declaredMime, 'avatar')` — magic-byte sniffing in `lib/validation/magic-bytes.ts`. Returns `verifiedType` (rejects mismatched extensions / spoofed MIME).
4. `uploadAvatarToS3(buffer, key, verifiedType)` (public-read).
5. `setMediaCache(key, buffer, verifiedType, { isAvatarOrBanner: true })` — warm cache.
6. Update `users.avatar` and `users.avatarUpdatedAt`, invalidate user auth cache.

### Support attachment upload — `app/api/support/upload/route.ts`

1. Up to `MAX_FILES_PER_REQUEST = 2` per call.
2. Per file: magic-byte validation, then `generateThumbhash(buffer)` if image — extracts `{ width, height, thumbhash }` for blur preview placeholders in the chat UI.
3. `uploadFileToS3(buffer, key, verifiedType)` (authenticated-read).
4. Insert row in `support_message_attachments` with `blur_hash`, `width`, `height`, `storage_path`.

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `S3_ENDPOINT` | — | S3-compatible API URL |
| `S3_BUCKET` | — | Bucket name |
| `S3_ACCESS_KEY` | — | Access key id |
| `S3_SECRET_KEY` | — | Secret key |
| `S3_REGION` | `us-east-1` | Region (required by AWS SDK signer) |
| `MEDIA_CACHE_ENABLED` | `true` if `REDIS_URL` set | Master switch for the Redis layer |
| `MEDIA_CACHE_MAX_OBJECT_MB` | `2` | Skip caching bodies above this size |
| `MEDIA_CACHE_TTL_SEC_SUPPORT` | `3600` | TTL for `support/` keys |
| `MEDIA_CACHE_TTL_SEC_AVATARS` | `86400` | TTL for `avatars/` and `banners/` |
| `MEDIA_CACHE_COMPRESS` | `true` | gzip bodies ≥ 512 bytes |

If `S3_*` is unset the upload endpoints return 503; if `REDIS_URL` is unset the cache is bypassed and S3 is hit on every read.

## Files

- `lib/storage/s3-client.ts` — S3 SDK wrapper, upload helpers, key generation, MIME validation.
- `lib/storage/media-cache.ts` — Redis cache layer with gzip and TTL policy.
- `lib/wasm/image-processor.ts` — WASM loader, `processImage`, `generateThumbhash` with graceful fallback.
- `wasm/src/lib.rs` — Rust source (image resize, ThumbHash).
- `lib/validation/magic-bytes.ts` — magic-byte content validation, MIME → extension mapping.
- `app/images/users/[...path]/route.ts` — public avatar/banner read endpoint with cache.
- `app/support/files/[key]/route.ts` — authenticated support attachment read endpoint.
- `app/api/auth/avatar/route.ts`, `app/api/auth/banner/route.ts` — avatar/banner upload + cache warm-up.
- `app/api/support/upload/route.ts` — support multi-file upload + ThumbHash extraction.
- `next.config.ts` — `outputFileTracingIncludes` for the WASM bundle.
