/**
 * API endpoint для публичного доступа к аватарам и баннерам из S3
 * Аватары и баннеры хранятся с публичным доступом и доступны без авторизации
 */

import { NextRequest, NextResponse } from 'next/server';
import { getS3Client, getObjectAsBuffer } from '@/lib/storage/s3-client';
import { getMediaFromCache, setMediaCache } from '@/lib/storage/media-cache';
import { processImage } from '@/lib/wasm/image-processor';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { CACHE_CONTROL_IMAGES_PUBLIC } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    
    if (!path || path.length === 0) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid path' },
          { status: 400 }
        )
      );
    }

    // Определяем тип ресурса (avatars или banners) и формируем путь к файлу в S3
    // Для avatars: path = ['userId', 'timestamp.ext'] -> avatars/userId/timestamp.ext
    // Для banners: path = ['banners', 'userId', 'timestamp.ext'] -> banners/userId/timestamp.ext
    let s3Key: string;
    let resourceType: 'avatar' | 'banner';
    
    if (path[0] === 'banners' && path.length >= 3) {
      // Баннер: path = ['banners', 'userId', 'timestamp.ext']
      resourceType = 'banner';
      s3Key = `banners/${path.slice(1).join('/')}`;
    } else if (path.length >= 2) {
      // Аватар: path = ['userId', 'timestamp.ext']
      resourceType = 'avatar';
      s3Key = `avatars/${path.join('/')}`;
    } else {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid image path' },
          { status: 400 }
        )
      );
    }

    // Валидация: путь должен начинаться с avatars/ или banners/ и содержать userId и filename
    if ((!s3Key.startsWith('avatars/') && !s3Key.startsWith('banners/')) || 
        (resourceType === 'avatar' && path.length < 2) ||
        (resourceType === 'banner' && path.length < 3)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid image path' },
          { status: 400 }
        )
      );
    }

    // Валидация: userId должен быть UUID
    const userId = resourceType === 'banner' ? path[1] : path[0];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid user ID format' },
          { status: 400 }
        )
      );
    }

    // Валидация: filename должен иметь допустимое расширение
    const filename = path[path.length - 1];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const hasValidExtension = allowedExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidExtension) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid file extension' },
          { status: 400 }
        )
      );
    }

    // Проверка кэша Redis (Фаза 1: media cache)
    const cached = await getMediaFromCache(s3Key);
    if (cached) {
      const headers = new Headers();
      headers.set('Content-Type', cached.contentType);
      headers.set('Cache-Control', CACHE_CONTROL_IMAGES_PUBLIC);
      headers.set('Content-Length', cached.body.length.toString());
      headers.set('X-Cache', 'HIT');
      return setCorsHeaders(
        new NextResponse(new Uint8Array(cached.body), { status: 200, headers })
      );
    }

    // Cache miss: получаем файл из S3
    const client = getS3Client();
    if (!client) {
      logger.error('S3 storage is not configured');
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Storage not available' },
          { status: 503 }
        )
      );
    }

    try {
      const s3Result = await getObjectAsBuffer(s3Key);
      if (!s3Result) {
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Image not found' },
            { status: 404 }
          )
        );
      }

      let { body, contentType } = s3Result;
      body = await processImage(body, {}).catch(() => body);
      await setMediaCache(s3Key, body, contentType, { isAvatarOrBanner: true });

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', CACHE_CONTROL_IMAGES_PUBLIC);
      headers.set('Content-Length', body.length.toString());
      headers.set('X-Cache', 'MISS');

      return setCorsHeaders(
        new NextResponse(new Uint8Array(body), { status: 200, headers })
      );
    } catch (s3Error: unknown) {
      const err = s3Error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Image not found' },
            { status: 404 }
          )
        );
      }
      throw err;
    }
  } catch (error) {
    const resolvedParams = await params;
    logger.error('Error getting avatar from S3', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: resolvedParams.path
    });
    
    // Если файл не найден, возвращаем 404
    if (error instanceof Error && (error.message.includes('NoSuchKey') || error.message.includes('does not exist'))) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Image not found' },
          { status: 404 }
        )
      );
    }

    return setCorsHeaders(
      NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    );
  }
}
