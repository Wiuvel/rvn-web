/**
 * Кэш медиа (изображения, вложения) в Redis.
 * Согласно docs/IMAGE_CACHE_IMPLEMENTATION_PLAN.md — Фаза 1: кэш в Redis и fallback без WASM.
 * Тела сжимаются gzip при записи (если включено и размер выше порога); при чтении распаковываются.
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import { getRedisClient } from '@/lib/database/redis';

const CACHE_KEY_PREFIX = 'media:body:';
const META_KEY_PREFIX = 'media:meta:';

/** Минимальный размер тела (байт), при котором имеет смысл сжатие */
const MIN_BODY_SIZE_TO_COMPRESS = 512;

/** Разрешённые префиксы s3Key для кэширования */
const ALLOWED_PREFIXES = ['support/', 'avatars/', 'banners/'] as const;

export interface MediaCacheConfig {
  enabled: boolean;
  maxObjectBytes: number;
  ttlSecSupport: number;
  ttlSecAvatars: number;
  compress: boolean;
}

/**
 * Конфигурация кэша из env (опциональные переменные, не ломают старт при отсутствии).
 */
export function getMediaCacheConfig(): MediaCacheConfig {
  const redisUrl = process.env.REDIS_URL;
  const enabledEnv = process.env.MEDIA_CACHE_ENABLED;
  const enabled = enabledEnv === undefined || enabledEnv === '' ? !!redisUrl : enabledEnv === 'true' || enabledEnv === '1';
  const maxMb = Number(process.env.MEDIA_CACHE_MAX_OBJECT_MB) || 2;
  const ttlSupport = Number(process.env.MEDIA_CACHE_TTL_SEC_SUPPORT) || 3600;   // 1 ч для вложений
  const ttlAvatars = Number(process.env.MEDIA_CACHE_TTL_SEC_AVATARS) || 86400; // 24 ч для аватаров
  const compressEnv = process.env.MEDIA_CACHE_COMPRESS;
  const compress = compressEnv === undefined || compressEnv === '' ? true : compressEnv === 'true' || compressEnv === '1';
  return {
    enabled: !!redisUrl && enabled,
    maxObjectBytes: Math.max(0, maxMb) * 1024 * 1024,
    ttlSecSupport: Math.max(60, ttlSupport),
    ttlSecAvatars: Math.max(60, ttlAvatars),
    compress,
  };
}

function isAllowedKey(s3Key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => s3Key.startsWith(p));
}

interface CacheMeta {
  content_type: string;
  size?: number;
  compressed?: boolean;
}

function decompressIfNeeded(body: Buffer, meta: CacheMeta): Buffer {
  if (meta.compressed) {
    try {
      return gunzipSync(body);
    } catch {
      return body;
    }
  }
  return body;
}

/**
 * Получить медиа из кэша Redis.
 * @returns { body: Buffer, contentType: string } или null при промахе/ошибке.
 */
export async function getMediaFromCache(s3Key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const config = getMediaCacheConfig();
  if (!config.enabled || !isAllowedKey(s3Key)) {
    return null;
  }
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }
  try {
    const key = CACHE_KEY_PREFIX + s3Key;
    const metaKey = META_KEY_PREFIX + s3Key;
    const [bodyBase64, metaJson] = await Promise.all([redis.get(key), redis.get(metaKey)]);
    if (!bodyBase64 || !metaJson) {
      return null;
    }
    const meta = JSON.parse(metaJson) as CacheMeta;
    let body = Buffer.from(bodyBase64, 'base64');
    const decompressed = decompressIfNeeded(body, meta);
    return { body: Buffer.from(decompressed), contentType: meta.content_type || 'application/octet-stream' };
  } catch {
    return null;
  }
}

/**
 * Записать медиа в кэш Redis.
 * Не пишет, если размер превышает лимит или Redis недоступен.
 * При включённом сжатии тела >= MIN_BODY_SIZE_TO_COMPRESS сжимаются gzip.
 */
export async function setMediaCache(
  s3Key: string,
  body: Buffer,
  contentType: string,
  options: { ttlSec?: number; isAvatarOrBanner?: boolean } = {}
): Promise<void> {
  const config = getMediaCacheConfig();
  if (!config.enabled || !isAllowedKey(s3Key)) {
    return;
  }
  if (body.length > config.maxObjectBytes) {
    return;
  }
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  const ttlSec = options.ttlSec ?? (options.isAvatarOrBanner ? config.ttlSecAvatars : config.ttlSecSupport);
  let payload = body;
  let compressed = false;
  if (config.compress && body.length >= MIN_BODY_SIZE_TO_COMPRESS) {
    try {
      payload = gzipSync(body);
      compressed = true;
    } catch {
      // Оставляем без сжатия при ошибке
    }
  }
  const meta: CacheMeta = {
    content_type: contentType,
    size: body.length,
    ...(compressed && { compressed: true }),
  };
  try {
    const key = CACHE_KEY_PREFIX + s3Key;
    const metaKey = META_KEY_PREFIX + s3Key;
    await redis.setex(key, ttlSec, payload.toString('base64'));
    await redis.setex(metaKey, ttlSec, JSON.stringify(meta));
  } catch {
    // Не падаем при ошибке записи кэша
  }
}

/**
 * Инвалидировать кэш по s3Key (при удалении/обновлении файла).
 */
export async function invalidateMediaCache(s3Key: string): Promise<void> {
  if (!isAllowedKey(s3Key)) {
    return;
  }
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  try {
    await redis.del(CACHE_KEY_PREFIX + s3Key);
    await redis.del(META_KEY_PREFIX + s3Key);
  } catch {
    // ignore
  }
}
