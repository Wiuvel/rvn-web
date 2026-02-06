/**
 * API endpoint для загрузки и обновления баннера пользователя
 * Удаляет старый баннер из S3 при загрузке нового
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth/helper';
import { setCorsHeaders, handleCorsPreflight } from '@/lib/security/cors';
import { generalRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/utils/secure-logger';
import { ERROR_INTERNAL_SERVER_ERROR, ERROR_NOT_AUTHENTICATED, ERROR_TOO_MANY_REQUESTS } from '@/lib/utils/constants';
import { supabaseAdmin } from '@/lib/database/supabase';
import { uploadAvatarToS3, deleteFileFromS3, validateFile } from '@/lib/storage/s3-client';
import { setMediaCache } from '@/lib/storage/media-cache';
import { isValidUUID } from '@/lib/utils/uuid-validation';
import { BANNER_MAX_BYTES } from '@/lib/utils/constants';

export async function OPTIONS() {
  return handleCorsPreflight();
}

/**
 * POST - Загрузить/обновить баннер пользователя
 */
export async function POST(request: NextRequest) {
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

    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_NOT_AUTHENTICATED },
          { status: 401 }
        )
      );
    }
    const user = authResult.user;

    // Валидация userId (защита от уязвимостей)
    if (!isValidUUID(user.id)) {
      logger.error('Invalid user ID format', { userId: user.id });
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Invalid user ID' },
          { status: 400 }
        )
      );
    }

    // Получаем файл из FormData
    const formData = await request.formData();
    const file = formData.get('banner') as File;

    if (!file) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        )
      );
    }

    // Валидация файла
    const validation = validateFile({
      size: file.size,
      type: file.type,
      name: file.name,
    });

    if (!validation.valid) {
      return setCorsHeaders(
        NextResponse.json(
          { error: validation.error || 'Invalid file' },
          { status: 400 }
        )
      );
    }

    // Дополнительная валидация: только изображения для баннеров (без GIF)
    if (!file.type.startsWith('image/')) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'Only image files are allowed for banners' },
          { status: 400 }
        )
      );
    }

    // Запрещаем GIF для баннеров
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'GIF files are not allowed for banners' },
          { status: 400 }
        )
      );
    }

    // Ограничиваем размер файла (лимит из конфига)
    if (file.size > BANNER_MAX_BYTES) {
      return setCorsHeaders(
        NextResponse.json(
          { error: 'File size must not exceed 2MB' },
          { status: 400 }
        )
      );
    }

    // Получаем текущий баннер пользователя для удаления
    if (!supabaseAdmin) {
      logger.error('Supabase admin client not available');
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    const { data: currentUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('banner')
      .eq('id', user.id)
      .single();

    if (userError || !currentUser) {
      logger.error('Error fetching current user banner', {
        error: userError,
        userId: user.id
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Определяем расширение файла (GIF исключен)
    let extension = 'jpg';
    if (file.type.includes('png')) {
      extension = 'png';
    } else if (file.type.includes('webp')) {
      extension = 'webp';
    } else {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.png')) extension = 'png';
      else if (fileName.endsWith('.webp')) extension = 'webp';
    }

    // Генерируем путь для хранения нового баннера
    const timestamp = Date.now();
    const storagePath = `banners/${user.id}/${timestamp}.${extension}`;

    // Читаем файл в Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Загружаем новый баннер в S3 с публичным доступом
    try {
      await uploadAvatarToS3(buffer, storagePath, file.type);
      // Прогрев кэша: первый запрос изображения будет HIT
      await setMediaCache(storagePath, buffer, file.type, { isAvatarOrBanner: true });
    } catch (error) {
      logger.error('Error uploading banner to S3', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id
      });
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Обновляем баннер в базе данных
    const newBannerPath = `s3:${storagePath}`;
    if (!supabaseAdmin) {
      logger.error('Supabase admin client not available');
      // Пытаемся удалить загруженный файл из S3 при ошибке
      try {
        await deleteFileFromS3(storagePath);
      } catch (deleteError) {
        logger.error('Error deleting uploaded banner after DB connection failure', {
          error: deleteError
        });
      }
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ banner: newBannerPath })
      .eq('id', user.id);

    if (updateError) {
      logger.error('Error updating banner in database', {
        error: updateError,
        userId: user.id
      });
      // Пытаемся удалить загруженный файл из S3 при ошибке обновления БД
      try {
        await deleteFileFromS3(storagePath);
      } catch (deleteError) {
        logger.error('Error deleting uploaded banner after DB update failure', {
          error: deleteError
        });
      }
      return setCorsHeaders(
        NextResponse.json(
          { error: ERROR_INTERNAL_SERVER_ERROR },
          { status: 500 }
        )
      );
    }

    // Удаляем старый баннер из S3, если он существует и отличается от нового
    if (currentUser.banner && currentUser.banner.startsWith('s3:banners/')) {
      const oldStoragePath = currentUser.banner.substring(3); // Убираем префикс 's3:'
      
      // Дополнительная проверка безопасности: убеждаемся, что путь действительно относится к текущему пользователю
      // Это защищает от уязвимостей типа path traversal
      if (oldStoragePath.startsWith(`banners/${user.id}/`)) {
        try {
          await deleteFileFromS3(oldStoragePath);
        } catch (deleteError) {
          // Логируем ошибку, но не блокируем ответ (старый файл можно удалить позже)
          logger.warn('Error deleting old banner from S3', {
            error: deleteError,
            oldPath: oldStoragePath,
            userId: user.id
          });
        }
      } else {
        // Логируем попытку удаления файла другого пользователя (защита от уязвимостей)
        logger.warn('Attempted to delete banner of different user', {
          oldPath: oldStoragePath,
          userId: user.id
        });
      }
    }

    // Обновляем user_data cookie с новым баннером
    const hostname = request.nextUrl?.hostname ?? request.headers.get('host') ?? '';
    const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
    
    // Получаем текущий pex из cookie или базы
    const { parseUserDataCookie, createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } = await import('@/lib/auth/user-cookie.server');
    const currentCookie = request.cookies.get(USER_DATA_COOKIE_NAME)?.value;
    const currentData = parseUserDataCookie(currentCookie);
    const pex = currentData?.pex || 'u';

    const userDataValue = createUserDataCookie({
      user_id: user.user_id,
      username: user.username,
      avatar: user.avatar ?? null,
      banner: newBannerPath,
      pex,
    });
    const response = NextResponse.json({
      success: true,
      banner: newBannerPath,
      bannerUrl: `/images/users/banners/${user.id}/${timestamp}.${extension}`
    });
    response.cookies.set(USER_DATA_COOKIE_NAME, userDataValue, getUserDataCookieOptions(isLocalhost));

    return setCorsHeaders(response);
  } catch (error) {
    logger.error('Error uploading banner', {
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
