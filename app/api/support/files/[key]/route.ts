/**
 * API endpoint для получения файлов из S3 с авторизацией
 * Проверяет права доступа пользователя к тикету перед выдачей файла
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
import { getPresignedUrl } from '@/lib/storage/s3-client';
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
    // Rate limiting
    const rateLimitResult = await generalRateLimit.check(request);
    if (!rateLimitResult.allowed) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_TOO_MANY_REQUESTS },
          { status: 429 }
        )
      );
    }

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

    // Проверяем, что путь начинается с support/ (безопасность)
    if (!decodedKey.startsWith('support/')) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid file path' },
          { status: 400 }
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

    // Генерируем presigned URL (действителен 1 час)
    const presignedUrl = await getPresignedUrl(decodedKey, 3600);

    // Редиректим на presigned URL
    return NextResponse.redirect(presignedUrl);
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
