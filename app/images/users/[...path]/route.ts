/**
 * API endpoint для публичного доступа к аватарам из S3
 * Аватары хранятся с публичным доступом и доступны без авторизации
 */

import { NextRequest, NextResponse } from 'next/server';
import { getS3Client } from '@/lib/storage/s3-client';
import { getEnv } from '@/lib/validation/env-validation';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { logger } from '@/lib/utils/secure-logger';

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

    // Формируем путь к файлу в S3
    // path будет массивом: ['userId', 'timestamp.ext']
    // Полный путь: avatars/userId/timestamp.ext
    const s3Key = `avatars/${path.join('/')}`;

    // Валидация: путь должен начинаться с avatars/ и содержать userId и filename
    if (!s3Key.startsWith('avatars/') || path.length < 2) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid avatar path' },
          { status: 400 }
        )
      );
    }

    // Валидация: userId должен быть UUID
    const userId = path[0];
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

    // Генерируем presigned URL для доступа к файлу
    // Для публичных файлов можно использовать более долгий срок действия (24 часа)
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: s3Key,
    });

    const presignedUrl = await getSignedUrl(client, command, { 
      expiresIn: 86400 // 24 часа
    });

    // Редиректим на presigned URL
    // Это позволяет использовать кеширование браузера и CDN
    return NextResponse.redirect(presignedUrl);
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
          { error: 'Avatar not found' },
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
