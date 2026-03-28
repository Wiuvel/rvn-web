import { NextRequest, NextResponse } from 'next/server';
import {
  uploadFileToS3,
  generateStoragePath,
  validateFile,
  validateFileWithContent,
} from '@/lib/storage/s3-client';
import { checkAuth } from '@/lib/auth/helper';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { db } from '@/lib/database/db';
import { supportTickets } from '@/lib/database/schema';
import { eq } from 'drizzle-orm';
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
      return setCorsHeaders(NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }));
    }

    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 }));
    }
    const user = authResult.user;

    // Получаем ticketId из query параметров
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('ticketId');

    if (!ticketId) {
      return setCorsHeaders(NextResponse.json({ error: 'TICKET_ID_REQUIRED' }, { status: 400 }));
    }

    // Проверяем, что тикет существует и принадлежит пользователю
    if (!db) {
      return setCorsHeaders(NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 }));
    }

    const ticketRows = await db
      .select({
        id: supportTickets.id,
        userId: supportTickets.userId,
        status: supportTickets.status,
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    const ticket = ticketRows[0];
    if (!ticket) {
      return setCorsHeaders(NextResponse.json({ error: 'TICKET_NOT_FOUND' }, { status: 404 }));
    }

    // Проверяем права доступа
    if (ticket.userId !== user.id) {
      return setCorsHeaders(NextResponse.json({ error: 'ACCESS_DENIED' }, { status: 403 }));
    }

    // Проверяем, что тикет не закрыт
    if (ticket.status === 'closed') {
      return setCorsHeaders(
        NextResponse.json({ error: 'CANNOT_UPLOAD_TO_CLOSED_TICKET' }, { status: 400 }),
      );
    }

    // Получаем FormData
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return setCorsHeaders(NextResponse.json({ error: 'NO_FILES_PROVIDED' }, { status: 400 }));
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return setCorsHeaders(
        NextResponse.json(
          { error: `MAXIMUM_${MAX_FILES_PER_REQUEST}_FILES_ALLOWED` },
          { status: 400 },
        ),
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
          NextResponse.json({ error: validation.error || 'INVALID_FILE' }, { status: 400 }),
        );
      }

      // Читаем файл в Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Валидация содержимого по magic bytes
      const contentCheck = validateFileWithContent(
        { size: file.size, type: file.type, name: file.name },
        buffer,
      );

      if (!contentCheck.valid) {
        return setCorsHeaders(
          NextResponse.json(
            { error: contentCheck.error || 'FILE_CONTENT_INVALID' },
            { status: 400 },
          ),
        );
      }

      const verifiedType = contentCheck.detectedType || file.type;

      // Генерируем ThumbHash и размер изображения на сервере (Node/WASM),
      // чтобы не зависеть от клиентского WASM и не тянуть `fs` в браузерный бандл.
      let blurHash: string | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (verifiedType.startsWith('image/')) {
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

      // Загружаем в S3 (используем verified type из magic bytes)
      await uploadFileToS3(buffer, storagePath, verifiedType);

      uploadResults.push({
        fileName: file.name,
        fileType: verifiedType,
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
      }),
    );
  } catch (error) {
    console.error('Error uploading file:', error);
    return setCorsHeaders(NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 }));
  }
}
