import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { uploadFileToS3, generateStoragePath, validateFile } from '@/lib/storage/s3-client';
import { getUserByToken } from '@/lib/auth/index';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { supabaseAdmin } from '@/lib/database/supabase';
import { generateThumbhash } from '@/lib/wasm/image-processor';

const MAX_FILES_PER_REQUEST = 2; // Максимум 2 файла за раз

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Загрузка файлов в Object Storage
 */
export async function POST(request: NextRequest) {
  try {
    // Базовая проверка rate limit по IP
    const generalRateLimitResult = await generalRateLimit.check(request);
    if (!generalRateLimitResult.allowed) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'TOO_MANY_REQUESTS' },
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
          { error: 'NOT_AUTHENTICATED' },
          { status: 401 }
        )
      );
    }

    const user = await getUserByToken(dashboardToken);
    if (!user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'NOT_AUTHENTICATED' },
          { status: 401 }
        )
      );
    }

    // Получаем ticketId из query параметров
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('ticketId');
    
    if (!ticketId) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'TICKET_ID_REQUIRED' },
          { status: 400 }
        )
      );
    }

    // Проверяем, что тикет существует и принадлежит пользователю
    if (!supabaseAdmin) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'INTERNAL_SERVER_ERROR' },
          { status: 500 }
        )
      );
    }

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, status')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'TICKET_NOT_FOUND' },
          { status: 404 }
        )
      );
    }

    // Проверяем права доступа
    if (ticket.user_id !== user.id) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'ACCESS_DENIED' },
          { status: 403 }
        )
      );
    }

    // Проверяем, что тикет не закрыт
    if (ticket.status === 'closed') {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'CANNOT_UPLOAD_TO_CLOSED_TICKET' },
          { status: 400 }
        )
      );
    }

    // Получаем FormData
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'NO_FILES_PROVIDED' },
          { status: 400 }
        )
      );
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return setCorsHeaders(
        NextResponse.json(
          { error: `MAXIMUM_${MAX_FILES_PER_REQUEST}_FILES_ALLOWED` },
          { status: 400 }
        )
      );
    }

    // Валидируем и загружаем файлы
    const uploadResults = [];
    
    for (const file of files) {
      // Валидация файла
      const validation = validateFile({
        size: file.size,
        type: file.type,
        name: file.name,
      });

      if (!validation.valid) {
        return setCorsHeaders(
          NextResponse.json(
            { error: validation.error || 'INVALID_FILE' },
            { status: 400 }
          )
        );
      }

      // Читаем файл в Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Генерируем ThumbHash и размер изображения на сервере (Node/WASM),
      // чтобы не зависеть от клиентского WASM и не тянуть `fs` в браузерный бандл.
      let blurHash: string | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (file.type.startsWith('image/')) {
        try {
          const result = await generateThumbhash(buffer);
          blurHash = result.thumbhash;
          width = result.width;
          height = result.height;
        } catch (e) {
          console.warn('Failed to generate thumbhash on server for', file.name, e);
        }
      }

      // Генерируем путь для хранения
      const storagePath = generateStoragePath(ticketId, file.name);

      // Загружаем в S3
      const fileUrl = await uploadFileToS3(buffer, storagePath, file.type);

      uploadResults.push({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        storageUrl: `/support/files/${encodeURIComponent(storagePath)}`, // Используем endpoint для авторизованного доступа
        blur_hash: blurHash,
        width,
        height,
      });
    }

    return setCorsHeaders(
      NextResponse.json({
        success: true,
        files: uploadResults,
      })
    );
  } catch (error) {
    console.error('Error uploading file:', error);
    return setCorsHeaders(
      NextResponse.json(
        { error: 'INTERNAL_SERVER_ERROR' },
        { status: 500 }
      )
    );
  }
}
