/**
 * API endpoint для получения файлов вложений поддержки из S3 с авторизацией
 * Проверяет права доступа пользователя к тикету перед выдачей файла
 *
 * Примечание: Аватары обрабатываются через /images/users/ endpoint (публичный доступ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { hasUserRole } from '@/lib/auth/user-roles';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import {
  ERROR_INTERNAL_SERVER_ERROR,
  ERROR_NOT_AUTHENTICATED,
  ERROR_TOO_MANY_REQUESTS,
  ERROR_ACCESS_DENIED,
} from '@/lib/utils/constants';
import { db } from '@/lib/database/db';
import { supportTickets, supportMessages, supportMessageAttachments } from '@/lib/database/schema';
import { eq, and } from 'drizzle-orm';
import { getS3Client, getObjectAsBuffer } from '@/lib/storage/s3-client';
import { getMediaFromCache, setMediaCache } from '@/lib/storage/media-cache';
import { processImage } from '@/lib/wasm/image-processor';
import { getEnv } from '@/lib/validation/env-validation';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { CACHE_CONTROL_SUPPORT_FILES } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить presigned URL для доступа к файлу
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(NextResponse.json({ error: ERROR_NOT_AUTHENTICATED }, { status: 401 }));
    }
    const user = authResult.user;

    const isSupport = await hasUserRole(user.id, 'support');
    const { key } = await params;

    // Декодируем key (может быть URL-encoded)
    const decodedKey = decodeURIComponent(key);

    // Этот endpoint обрабатывает только файлы поддержки (вложения в тикетах)
    // Аватары обрабатываются через /images/users/ endpoint
    if (!decodedKey.startsWith('support/')) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid file path. This endpoint only handles support attachments.' },
          { status: 400 },
        ),
      );
    }

    // Rate limiting для файлов поддержки
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      return setCorsHeaders(NextResponse.json({ error: ERROR_TOO_MANY_REQUESTS }, { status: 429 }));
    }

    // Извлекаем ticketId из пути (формат: support/{ticketId}/...)
    const pathParts = decodedKey.split('/');
    if (pathParts.length < 2) {
      return setCorsHeaders(
        NextResponse.json({ error: 'Invalid file path format' }, { status: 400 }),
      );
    }

    const ticketId = pathParts[1];

    // Валидация UUID формата ticketId
    if (!isValidUUID(ticketId)) {
      return setCorsHeaders(NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 }));
    }

    // Проверяем доступ к тикету
    if (!db) {
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }

    const ticketRows = await db
      .select({ id: supportTickets.id, userId: supportTickets.userId })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    const ticket = ticketRows[0];
    if (!ticket) {
      return setCorsHeaders(NextResponse.json({ error: 'Ticket not found' }, { status: 404 }));
    }

    // Проверяем права доступа: пользователь может видеть только свои тикеты, поддержка - все
    if (!isSupport && ticket.userId !== user.id) {
      return setCorsHeaders(NextResponse.json({ error: ERROR_ACCESS_DENIED }, { status: 403 }));
    }

    // Проверяем, что файл существует в базе данных (дополнительная проверка безопасности)
    // Извлекаем messageId из пути, если есть (формат: support/{ticketId}/{messageId}/...)
    const messageId = pathParts.length >= 3 && pathParts[2] !== 'pending' ? pathParts[2] : null;

    if (messageId && isValidUUID(messageId)) {
      // Проверяем, что файл привязан к сообщению в тикете
      const attachmentRows = await db
        .select({
          id: supportMessageAttachments.id,
          messageId: supportMessageAttachments.messageId,
          storagePath: supportMessageAttachments.storagePath,
        })
        .from(supportMessageAttachments)
        .where(eq(supportMessageAttachments.storagePath, decodedKey))
        .limit(1);

      const attachment = attachmentRows[0];
      if (attachment) {
        // Проверяем, что сообщение принадлежит тикету
        const messageRows = await db
          .select({ id: supportMessages.id, ticketId: supportMessages.ticketId })
          .from(supportMessages)
          .where(
            and(
              eq(supportMessages.id, attachment.messageId),
              eq(supportMessages.ticketId, ticketId),
            ),
          )
          .limit(1);

        const message = messageRows[0];
        if (!message) {
          return setCorsHeaders(
            NextResponse.json({ error: 'File not found in ticket' }, { status: 404 }),
          );
        }
      }
    }

    const fileName = decodedKey.split('/').pop() || 'file';

    // Проверка кэша Redis (Фаза 1: media cache)
    const cached = await getMediaFromCache(decodedKey);
    if (cached) {
      const headers = new Headers();
      headers.set('Content-Type', cached.contentType);
      headers.set('Cache-Control', CACHE_CONTROL_SUPPORT_FILES);
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      headers.set('Content-Length', cached.body.length.toString());
      headers.set('X-Cache', 'HIT');
      return setCorsHeaders(
        new NextResponse(new Uint8Array(cached.body), { status: 200, headers }),
      );
    }

    // Cache miss: получаем файл из S3 (буфер для возможности кэширования)
    const client = getS3Client();
    const env = getEnv();
    if (!client || !env.S3_BUCKET) {
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }

    try {
      const s3Result = await getObjectAsBuffer(decodedKey);
      if (!s3Result) {
        return setCorsHeaders(NextResponse.json({ error: 'File not found' }, { status: 404 }));
      }

      let { body, contentType } = s3Result;
      // Опциональная обработка через WASM (ресайз/формат); при ошибке — исходный буфер
      body = await processImage(body, {}).catch(() => body);
      // Записываем в кэш (если размер позволяет; setMediaCache сам проверяет лимит)
      await setMediaCache(decodedKey, body, contentType, { isAvatarOrBanner: false });

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', CACHE_CONTROL_SUPPORT_FILES);
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      headers.set('Content-Length', body.length.toString());
      headers.set('X-Cache', 'MISS');

      return setCorsHeaders(new NextResponse(new Uint8Array(body), { status: 200, headers }));
    } catch (s3Error: unknown) {
      const err = s3Error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return setCorsHeaders(NextResponse.json({ error: 'File not found' }, { status: 404 }));
      }
      logger.error('Error getting file from S3', {
        error: err instanceof Error ? err.message : 'Unknown error',
        key: decodedKey,
      });
      return setCorsHeaders(
        NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
      );
    }
  } catch (error) {
    logger.error('Error getting presigned URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return setCorsHeaders(
      NextResponse.json({ error: ERROR_INTERNAL_SERVER_ERROR }, { status: 500 }),
    );
  }
}
