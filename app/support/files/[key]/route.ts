/**
 * API endpoint для получения файлов вложений поддержки из S3 с авторизацией
 * Проверяет права доступа пользователя к тикету перед выдачей файла
 * 
 * Примечание: Аватары обрабатываются через /images/users/ endpoint (публичный доступ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserByToken } from '@/lib/auth';
import { hasUserRole } from '@/lib/auth/user-roles';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_TOO_MANY_REQUESTS, ERROR_ACCESS_DENIED } from '@/lib/utils/constants';
import { supabaseAdmin } from '@/lib/database/supabase';
import { getS3Client } from '@/lib/storage/s3-client';
import { getEnv } from '@/lib/validation/env-validation';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { isValidUUID } from '@/lib/utils/uuid-validation';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * GET - Получить presigned URL для доступа к файлу
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    // Проверка авторизации
    const cookieStore = await cookies();
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';
    const dashboardToken = cookieStore.get('dashboard_token')?.value;

    if (!isAuthenticated || !dashboardToken) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

    const user = await getUserByToken(dashboardToken);
    if (!user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }

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
          { status: 400 }
        )
      );
    }

    // Rate limiting для файлов поддержки
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TOO_MANY_REQUESTS },
          { status: 429 }
        )
      );
    }

    // Извлекаем ticketId из пути (формат: support/{ticketId}/...)
    const pathParts = decodedKey.split('/');
    if (pathParts.length < 2) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid file path format' },
          { status: 400 }
        )
      );
    }

    const ticketId = pathParts[1];
    
    // Валидация UUID формата ticketId
    if (!isValidUUID(ticketId)) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid ticket ID' },
          { status: 400 }
        )
      );
    }

    // Проверяем доступ к тикету
    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        )
      );
    }

    // Проверяем права доступа: пользователь может видеть только свои тикеты, поддержка - все
    if (!isSupport && ticket.user_id !== user.id) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_ACCESS_DENIED },
          { status: 403 }
        )
      );
    }

    // Проверяем, что файл существует в базе данных (дополнительная проверка безопасности)
    // Извлекаем messageId из пути, если есть (формат: support/{ticketId}/{messageId}/...)
    const messageId = pathParts.length >= 3 && pathParts[2] !== 'pending' ? pathParts[2] : null;
    
    if (messageId && isValidUUID(messageId)) {
      // Проверяем, что файл привязан к сообщению в тикете
      const { data: attachment, error: attachmentError } = await supabaseAdmin
        .from('support_message_attachments')
        .select('id, message_id, storage_path')
        .eq('storage_path', decodedKey)
        .single();

      if (!attachmentError && attachment) {
        // Проверяем, что сообщение принадлежит тикету
        const { data: message, error: messageError } = await supabaseAdmin
          .from('support_messages')
          .select('id, ticket_id')
          .eq('id', attachment.message_id)
          .eq('ticket_id', ticketId)
          .single();

        if (messageError || !message) {
          return setCorsHeaders(
            NextResponse.json(
              { error: 'File not found in ticket' },
              { status: 404 }
            )
          );
        }
      }
    }

    // Получаем файл напрямую из S3
    const client = getS3Client();
    const env = getEnv();
    
    if (!client || !env.S3_BUCKET) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: decodedKey,
    });

    try {
      const response = await client.send(command);
      
      // Получаем тело файла как поток
      const stream = response.Body;
      if (!stream) {
        throw new Error('Empty stream from S3');
      }

      // Определяем Content-Type из метаданных S3 или по расширению
      const fileName = decodedKey.split('/').pop() || 'file';
      const contentType = response.ContentType || 
        (fileName.endsWith('.png') ? 'image/png' :
         fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
         fileName.endsWith('.webp') ? 'image/webp' :
         fileName.endsWith('.gif') ? 'image/gif' :
         fileName.endsWith('.pdf') ? 'application/pdf' :
         fileName.endsWith('.txt') ? 'text/plain' :
         'application/octet-stream');

      // Создаем Response с потоком данных
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'private, max-age=3600'); // 1 час кеширования для приватных файлов
      
      // Добавляем заголовок для скачивания файла
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      
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
            { error: 'File not found' },
            { status: 404 }
          )
        );
      }
      
      logger.error('Error getting file from S3', {
        error: s3Error instanceof Error ? s3Error.message : 'Unknown error',
        key: decodedKey
      });
      
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }
  } catch (error) {
    logger.error('Error getting presigned URL', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return setCorsHeaders(
      NextResponse.json(
        { error: ERROR_INTERNAL_SERVER_ERROR },
        { status: 500 }
      )
    );
  }
}
