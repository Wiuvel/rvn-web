/**
 * API endpoint для публичного доступа к аватарам и баннерам из S3
 * Аватары и баннеры хранятся с публичным доступом и доступны без авторизации
 */

import { NextRequest, NextResponse } from 'next/server';
import { getS3Client } from '@/lib/storage/s3-client';
import { getEnv } from '@/lib/validation/env-validation';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';
import { Readable } from 'stream';

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

    // Получаем клиент S3 и конфигурацию
    const client = getS3Client();
    const env = getEnv();
    
    if (!client || !env.S3_BUCKET) {
      logger.error('S3 storage is not configured');
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Storage not available' },
          { status: 503 }
        )
      );
    }

    // Получаем файл напрямую из S3
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: s3Key,
    });

    try {
      const response = await client.send(command);
      
      // Получаем тело файла как поток
      const stream = response.Body;
      if (!stream) {
        throw new Error('Empty stream from S3');
      }

      // Определяем Content-Type из метаданных S3 или по расширению
      const contentType = response.ContentType || 
        (filename.endsWith('.png') ? 'image/png' :
         filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' :
         filename.endsWith('.webp') ? 'image/webp' :
         filename.endsWith('.gif') ? 'image/gif' :
         'application/octet-stream');

      // Создаем Response с потоком данных
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'public, max-age=86400, immutable'); // 24 часа кеширования
      
      if (response.ContentLength) {
        headers.set('Content-Length', response.ContentLength.toString());
      }
      
      if (response.ETag) {
        headers.set('ETag', response.ETag);
      }
      
      if (response.LastModified) {
        headers.set('Last-Modified', response.LastModified.toUTCString());
      }

      // Преобразуем Node.js Readable stream в Web ReadableStream
      // В AWS SDK v3 для Node.js Body является Readable stream
      const nodeStream = stream as Readable;
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
      
      return setCorsHeaders(
        new NextResponse(webStream, {
          status: 200,
          headers,
        })
      );
    } catch (s3Error: any) {
      // Если файл не найден, возвращаем 404
      if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
        return setCorsHeaders(
          NextResponse.json(
            { error: 'Image not found' },
            { status: 404 }
          )
        );
      }
      throw s3Error;
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
