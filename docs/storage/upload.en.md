# Upload Pipeline

> **[Русская версия](upload.md)**

## Overview

The app accepts uploads in three places: avatars, banners, and support attachments. All three flow through the same `lib/storage/s3-client.ts` helpers and end up in S3-compatible Object Storage (configurable endpoint — works with AWS S3, MinIO, Backblaze B2, etc.). The upload contract is intentionally strict:

1. **Multipart POST**, not presigned PUT. The server reads the file into a `Buffer`, validates everything before an S3 round-trip happens.
2. **Magic-byte validation** runs after the Content-Type check. The client-declared MIME is treated as a hint, not a fact — the actual signature wins.
3. **Auth + rate limit** are enforced before any byte of the body is even processed.

## End-to-end Flow

```
[Browser] FormData (file)
        │
        ▼
[POST /api/auth/avatar | /api/auth/banner | /api/support/upload]
  • generalRateLimit.check(request)
  • checkAuth(request) → 401 if not authenticated
  • request.formData() → File
        │
        ▼
[validateFile({ size, type, name })]
  • size ≤ AVATAR_MAX_BYTES / SUPPORT_ATTACHMENT_MAX_BYTES
  • size > 0
  • declared MIME ∈ allowed list
        │
        ▼
[file.arrayBuffer() → Buffer]
        │
        ▼
[validateFileWithContent({size,type,name}, buffer)]
  • detectMimeType(buffer) by magic bytes
  • detectedType ∈ allowed list
  • detectedType matches declared type (or close)
        │
        ▼
[avatar/banner: extra rules]
  • startsWith('image/')
  • not 'image/gif'
        │
        ▼
[generateThumbhash(buffer)]   // optional — support uploads only
        │
        ▼
[uploadFileToS3(buffer, key, verifiedType)]
[setMediaCache(key, buffer, verifiedType, …)]   // warm Redis cache
        │
        ▼
[DB: UPDATE users.avatar | INSERT support_messages.attachments]
[invalidateUserAuthCacheByUserId / cache.delete profile]
        │
        ▼
[(avatar) deleteFileFromS3(oldKey) — best-effort, after DB commit]
        │
        ▼
[200 OK { url, ... }]
```

## File-Type Validation

Two layers, both required:

### Layer 1 — `validateFile()`

`lib/storage/s3-client.ts → validateFile({size,type,name})` checks the metadata declared by the client:

| Rule | Detail |
|------|--------|
| Size | `size > 0` and `size ≤ SUPPORT_ATTACHMENT_MAX_BYTES`. Avatar route additionally enforces `size ≤ AVATAR_MAX_BYTES`. |
| Type | Declared MIME must be one of `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`. |
| Extension fallback | `.pdf` and `.txt` filenames pass even if `Content-Type` is missing — some browsers send `application/octet-stream` for plain text. |

This layer is fast (no buffer needed) and lets us reject obviously bad requests before reading the body.

### Layer 2 — `validateFileWithContent()`

`lib/validation/magic-bytes.ts → detectMimeType(buffer)` reads the first bytes:

| MIME | Signature |
|------|-----------|
| PNG | `89 50 4E 47 0D 0A 1A 0A` at offset 0 |
| JPEG | `FF D8 FF` at offset 0 |
| GIF | `47 49 46 38 39 61` (GIF89a) or `47 49 46 38 37 61` (GIF87a) |
| WebP | `RIFF` at offset 0 + `WEBP` at offset 8 |
| PDF | `%PDF` at offset 0 |
| SVG | `<svg` in first 1 KB (text format, no binary signature) |
| TXT | extension `.txt` only — no signature for plain text |

`validateFileContent(buffer, declaredType, fileName)` rejects a request when:

- `detectMimeType` returns null (corrupted / unknown).
- detected MIME is not in the allowlist (closes the door on declaring `application/pdf` and uploading an `.exe`).
- detected MIME is `image/gif` for avatar/banner routes (animated avatars are explicitly disallowed).

The route then trusts `verifiedType = detectedType || file.type` for downstream operations (S3 `Content-Type`, file extension via `getExtensionFromMime`).

## Per-Route Specifics

### Avatars — `app/api/auth/avatar/route.ts`

- Limit: `AVATAR_MAX_BYTES` (2 MB).
- Allowed types: images only, **no GIF** (animated avatars forbidden).
- Storage path: `avatars/<userId>/<timestamp>.<ext>` — timestamp avoids browser cache reuse on overwrite.
- `users.avatar` is set to `s3:<storagePath>` (the `s3:` prefix tells the read path to go through `media-cache` instead of an external URL).
- Old avatar is deleted after the DB commit succeeds, **with a path check** — the path must start with `avatars/<userId>/` to prevent path-traversal across users.
- `setMediaCache(...)` warms the Redis-backed media cache so the very first GET hits warm.
- `invalidateUserAuthCacheByUserId(userId)` + `cache.delete('profile:...')` make the new avatar visible across all servers/processes immediately.

### Banners — `app/api/auth/banner/route.ts`

Same shape as avatars but storage path is `banners/<userId>/<timestamp>.<ext>` and limit is `BANNER_MAX_BYTES`.

### Support attachments — `app/api/support/upload/route.ts`

- Limit: `SUPPORT_ATTACHMENT_MAX_BYTES`.
- Up to **2 files per request** (`MAX_FILES_PER_REQUEST`). Larger batches require multiple requests.
- Allowed: images (incl. GIF) + PDF + plain text.
- Storage path: `support/<ticketId>/<messageId>/<filename>`.
- `generateThumbhash(buffer)` runs for image attachments — see "WASM image processor" below.
- The route requires `?ticketId=…` and verifies the ticket belongs to the caller (or to a support agent for admin/support sessions).

## WASM Image Processor

`lib/wasm/image-processor.ts` wraps a Rust → WASM module (`wasm/src/lib.rs`) that exposes:

| Function | Purpose |
|----------|---------|
| `resize_image(buf, width, height)` | Bilinear-resize image to fit the box. Format-preserving (PNG → PNG, JPEG → JPEG). |
| `generate_thumbhash(buf)` | Returns `{ width, height, thumbhash }` — a base64 thumbhash blur placeholder. |

The wrapper has a graceful fallback: if WASM fails to load (server start without `wasm-pack build`, or a runtime error), `resize_image()` returns the original buffer and `generate_thumbhash()` returns `null`. Uploads succeed in either case — the only effect is that the UI doesn't get a blur placeholder.

The thumbhash payload is stored alongside the attachment metadata so the chat can render a placeholder before the full image loads.

## Object Storage

`getS3Client()` returns an `@aws-sdk/client-s3` client configured from `lib/validation/env-validation.ts`:

| Variable | Required | Notes |
|----------|----------|-------|
| `S3_ENDPOINT` | yes | Custom endpoint (Backblaze, MinIO, etc.) — `forcePathStyle: true` so subdomain-style URLs aren't required. |
| `S3_ACCESS_KEY` | yes | |
| `S3_SECRET_KEY` | yes | |
| `S3_BUCKET` | yes | |
| `S3_REGION` | optional | Defaults to `us-east-1`. |

Uploads use `PutObjectCommand` with explicit `ContentType` (the verified type, not the declared one). Avatars and banners pass `ACL: 'public-read'` so they can be served from a CDN if configured; support attachments default to private and are served via `getSignedUrl`.

## Read Path & Media Cache

`lib/storage/media-cache.ts` provides a Redis-backed cache for image bodies + metadata:

- Key prefixes: `media:body:<s3Key>`, `media:meta:<s3Key>`.
- Bodies larger than `MIN_BODY_SIZE_TO_COMPRESS` (512 bytes) are stored gzip-compressed when `MEDIA_CACHE_COMPRESS=true`.
- TTLs: avatars/banners default to 24 h, support attachments to 1 h. All values configurable via `MEDIA_CACHE_TTL_SEC_*`.
- Allow-listed prefixes only: `support/`, `avatars/`, `banners/`. Anything else bypasses cache.
- The whole cache turns off automatically if `REDIS_URL` is unset — no behavior change, just a cold S3 fetch on every request.

## Files

- `app/api/auth/avatar/route.ts`, `app/api/auth/banner/route.ts`, `app/api/support/upload/route.ts` — entry points.
- `lib/storage/s3-client.ts` — `getS3Client`, `uploadFileToS3`, `uploadAvatarToS3`, `deleteFileFromS3`, `validateFile`, `validateFileWithContent`.
- `lib/storage/media-cache.ts` — Redis cache for image bodies.
- `lib/validation/magic-bytes.ts` — magic-byte detection, `detectMimeType`, `validateFileContent`.
- `lib/wasm/image-processor.ts` — WASM wrapper.
- `wasm/src/lib.rs` — Rust → WASM source for `resize_image` and `generate_thumbhash`.
- `lib/utils/constants.ts` — file-size limits.
