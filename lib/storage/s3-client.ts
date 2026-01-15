import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@/lib/validation/env-validation';

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
    // Публичный доступ для чтения
    ACL: 'public-read',
  });

  await client.send(command);

  // Формируем публичный URL
  // 
  // ВАЖНО: Если вы используете кастомный домен (привязанный к S3 бакету),
  // убедитесь, что:
  // 1. SSL сертификат настроен для вашего кастомного домена
  // 2. DNS записи настроены правильно (CNAME или A-запись)
  // 3. В S3_PUBLIC_URL указан ваш кастомный домен с HTTPS
  //
  // Если SSL не настроен для кастомного домена, используйте S3_PUBLIC_URL
  // с предоставленным провайдером URL (который имеет валидный SSL).
  //
  // Если задан S3_PUBLIC_URL, используем его (приоритет для кастомных доменов с SSL)
  if (env.S3_PUBLIC_URL) {
    const publicUrl = env.S3_PUBLIC_URL.endsWith('/') 
      ? env.S3_PUBLIC_URL.slice(0, -1) 
      : env.S3_PUBLIC_URL;
    return `${publicUrl}/${key}`;
  }

  // Fallback: формируем URL из endpoint и bucket
  // Используется, если S3_PUBLIC_URL не задан
  // Этот URL обычно имеет валидный SSL от провайдера
  if (!env.S3_ENDPOINT || !env.S3_BUCKET) {
    throw new Error('S3 endpoint and bucket must be configured');
  }
  const endpointUrl = env.S3_ENDPOINT.endsWith('/') 
    ? env.S3_ENDPOINT.slice(0, -1) 
    : env.S3_ENDPOINT;
  return `${endpointUrl}/${env.S3_BUCKET}/${key}`;
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
 * Валидирует файл перед загрузкой
 */
export function validateFile(file: { size: number; type: string; name: string }): {
  valid: boolean;
  error?: string;
} {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Размер файла не должен превышать 10МБ',
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
