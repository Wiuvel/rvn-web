import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@/lib/validation/env-validation';
import { AVATAR_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_FILE_SIZE_LIMIT_ERROR } from '@/lib/utils/constants';
import { Readable } from 'stream';

/**
 * Создает и возвращает клиент S3 для Object Storage
 */
export function getS3Client(): S3Client | null {
  const env = getEnv();
  
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    return null;
  }

  // S3-совместимый API
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true, // Используем path-style URLs
  });
}

/**
 * Загружает файл в Object Storage
 * @param file - File объект или Buffer
 * @param key - Путь к файлу в бакете (например, 'support/ticket_id/message_id/filename')
 * @param contentType - MIME type файла
 * @returns URL загруженного файла
 */
export async function uploadFileToS3(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const env = getEnv();
  
  if (!client || !env.S3_BUCKET) {
    throw new Error('S3 storage is not configured');
  }

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: file,
    ContentType: contentType,
    // Авторизованный доступ для чтения (только для авторизованных пользователей)
    // Примечание: некоторые S3-совместимые провайдеры могут не поддерживать ACL
    // В этом случае доступ контролируется через bucket policies
    ACL: 'authenticated-read',
  });

  await client.send(command);

  // Возвращаем путь к файлу (storage_path), а не публичный URL
  // Фактический доступ к файлу будет через API endpoint с авторизацией
  return key;
}

/**
 * Удаляет файл из Object Storage
 */
export async function deleteFileFromS3(key: string): Promise<void> {
  const client = getS3Client();
  const env = getEnv();
  
  if (!client || !env.S3_BUCKET) {
    throw new Error('S3 storage is not configured');
  }

  const command = new DeleteObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  await client.send(command);
}

/**
 * Генерирует presigned URL для временного доступа к файлу
 * @param key - Путь к файлу в бакете
 * @param expiresIn - Время жизни URL в секундах (по умолчанию 1 час)
 * @returns Presigned URL
 */
export async function getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const client = getS3Client();
  const env = getEnv();
  
  if (!client || !env.S3_BUCKET) {
    throw new Error('S3 storage is not configured');
  }

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Скачивает объект из S3 и возвращает тело как Buffer (для кэширования).
 * @param key - Путь к файлу в бакете
 * @returns { body: Buffer, contentType: string, contentLength?: number } или null при ошибке/отсутствии
 */
export async function getObjectAsBuffer(key: string): Promise<{
  body: Buffer;
  contentType: string;
  contentLength?: number;
} | null> {
  const client = getS3Client();
  const env = getEnv();
  if (!client || !env.S3_BUCKET) {
    return null;
  }
  try {
    const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
    const response = await client.send(command);
    const stream = response.Body;
    if (!stream) {
      return null;
    }
    const chunks: Buffer[] = [];
    const nodeStream = stream as Readable;
    for await (const chunk of nodeStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const contentType = response.ContentType || 'application/octet-stream';
    return { body, contentType, contentLength: response.ContentLength ?? body.length };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
}

/**
 * Генерирует путь к файлу для хранения в Object Storage
 * @param ticketId - ID тикета
 * @param messageId - ID сообщения (опционально, для предварительной загрузки)
 * @param fileName - Имя файла
 * @returns Путь к файлу
 */
export function generateStoragePath(
  ticketId: string,
  fileName: string,
  messageId?: string
): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  if (messageId) {
    return `support/${ticketId}/${messageId}/${timestamp}_${sanitizedFileName}`;
  }
  
  // Для предварительной загрузки (до создания сообщения)
  return `support/${ticketId}/pending/${timestamp}_${sanitizedFileName}`;
}

/**
 * Проверяет, является ли файл изображением
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Проверяет, является ли файл документом
 */
export function isDocumentFile(mimeType: string, fileName: string): boolean {
  const documentMimeTypes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  
  const documentExtensions = ['.pdf', '.txt', '.doc', '.docx'];
  const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  
  return documentMimeTypes.includes(mimeType) || documentExtensions.includes(fileExtension);
}

/**
 * Загружает аватар в Object Storage с публичным доступом
 * @param file - File объект или Buffer
 * @param key - Путь к файлу в бакете (например, 'avatars/userId/timestamp.ext')
 * @param contentType - MIME type файла
 * @returns Путь к файлу в S3
 */
export async function uploadAvatarToS3(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const env = getEnv();
  
  if (!client || !env.S3_BUCKET) {
    throw new Error('S3 storage is not configured');
  }

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: file,
    ContentType: contentType,
    // Публичный доступ для чтения (для аватаров)
    // Примечание: некоторые S3-совместимые провайдеры могут не поддерживать ACL
    // В этом случае доступ контролируется через bucket policies
    ACL: 'public-read',
  });

  await client.send(command);

  return key;
}

/**
 * Загружает изображение по URL и сохраняет в Object Storage
 * @param imageUrl - URL изображения
 * @param userId - ID пользователя для генерации пути
 * @returns Путь к файлу в S3 или null в случае ошибки
 */
export async function uploadAvatarFromUrl(
  imageUrl: string,
  userId: string
): Promise<string | null> {
  try {
    // Скачиваем изображение
    const imageResponse = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Raven/1.0)',
      },
    });

    if (!imageResponse.ok) {
      console.warn(`Failed to fetch avatar from URL: ${imageUrl}`, {
        status: imageResponse.status,
      });
      return null;
    }

    // Проверяем, что это изображение
    const contentType = imageResponse.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.warn(`Invalid content type for avatar: ${contentType}`);
      return null;
    }

    // Ограничиваем размер файла (лимит из конфига)
    const contentLength = imageResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > AVATAR_MAX_BYTES) {
      console.warn(`Avatar file too large: ${contentLength} bytes`);
      return null;
    }

    // Читаем изображение в Buffer
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Проверяем фактический размер
    if (buffer.length > AVATAR_MAX_BYTES) {
      console.warn(`Avatar file too large: ${buffer.length} bytes`);
      return null;
    }

    // Определяем расширение файла из content-type или URL
    let extension = 'jpg';
    if (contentType.includes('png')) {
      extension = 'png';
    } else if (contentType.includes('gif')) {
      extension = 'gif';
    } else if (contentType.includes('webp')) {
      extension = 'webp';
    } else {
      // Пытаемся определить из URL
      const urlMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
      if (urlMatch) {
        extension = urlMatch[1].toLowerCase();
      }
    }

    // Генерируем путь для хранения аватара
    const timestamp = Date.now();
    const storagePath = `avatars/${userId}/${timestamp}.${extension}`;

    // Загружаем в S3 с публичным доступом
    await uploadAvatarToS3(buffer, storagePath, contentType);

    return storagePath;
  } catch (error) {
    console.error('Error uploading avatar from URL:', error);
    return null;
  }
}

/**
 * Валидирует файл перед загрузкой
 */
export function validateFile(file: { size: number; type: string; name: string }): {
  valid: boolean;
  error?: string;
} {
  if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return {
      valid: false,
      error: SUPPORT_FILE_SIZE_LIMIT_ERROR,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'Файл не может быть пустым',
    };
  }

  // Разрешенные типы файлов
  const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
  const allowedDocumentTypes = ['application/pdf', 'text/plain'];
  
  const isImage = allowedImageTypes.includes(file.type);
  const isDocument = allowedDocumentTypes.includes(file.type) || 
                     file.name.toLowerCase().endsWith('.pdf') || 
                     file.name.toLowerCase().endsWith('.txt');

  if (!isImage && !isDocument) {
    return {
      valid: false,
      error: 'Разрешены только изображения (.png, .jpg, .gif, .webp, .svg) и документы (.pdf, .txt)',
    };
  }

  return { valid: true };
}
