/**
 * Валидация файлов по magic bytes (file signatures).
 * Определяет реальный MIME-тип файла по содержимому, а не по заголовкам клиента.
 */

interface MagicSignature {
  mime: string;
  bytes: number[];
  offset: number;
  /** Дополнительная проверка байт на другом offset (для WebP: RIFF + WEBP) */
  extra?: { bytes: number[]; offset: number };
}

const SIGNATURES: MagicSignature[] = [
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  // GIF89a
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 },
  // GIF87a
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 },
  // WebP: RIFF....WEBP
  {
    mime: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46],
    offset: 0,
    extra: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  },
  // PDF: %PDF
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
];

/**
 * Определяет MIME-тип файла по magic bytes.
 * Возвращает null если формат не распознан.
 */
export function detectMimeType(buffer: Buffer, fileName?: string): string | null {
  if (buffer.length < 12) {
    // Слишком короткий для бинарной сигнатуры — проверим текстовые форматы
    return detectTextFormat(buffer, fileName);
  }

  for (const sig of SIGNATURES) {
    if (matchBytes(buffer, sig.bytes, sig.offset)) {
      if (sig.extra && !matchBytes(buffer, sig.extra.bytes, sig.extra.offset)) {
        continue;
      }
      return sig.mime;
    }
  }

  // Текстовые форматы без бинарной сигнатуры
  return detectTextFormat(buffer, fileName);
}

function matchBytes(buffer: Buffer, bytes: number[], offset: number): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Проверяет текстовые форматы: SVG и plain text.
 */
function detectTextFormat(buffer: Buffer, fileName?: string): string | null {
  // SVG: ищем <svg в первых 1KB
  const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('utf-8');
  if (/<svg[\s>]/i.test(head)) {
    return 'image/svg+xml';
  }

  // TXT: только если расширение .txt (нет бинарной сигнатуры у текста)
  if (fileName && fileName.toLowerCase().endsWith('.txt')) {
    return 'text/plain';
  }

  return null;
}

export interface ContentValidationResult {
  valid: boolean;
  detectedType: string | null;
  error?: string;
}

/**
 * Валидирует содержимое файла по magic bytes.
 * Сравнивает реальный тип с заявленным и проверяет что формат разрешён.
 */
export function validateFileContent(
  buffer: Buffer,
  declaredType: string,
  fileName: string,
): ContentValidationResult {
  const detectedType = detectMimeType(buffer, fileName);

  if (!detectedType) {
    return {
      valid: false,
      detectedType: null,
      error: 'Не удалось определить тип файла. Файл повреждён или имеет неподдерживаемый формат',
    };
  }

  // Проверяем что detected тип входит в список разрешённых
  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
  ];

  if (!allowedTypes.includes(detectedType)) {
    return {
      valid: false,
      detectedType,
      error: `Тип файла "${detectedType}" не разрешён`,
    };
  }

  // Проверяем категорию: если клиент заявил image/*, а файл — PDF, это подозрительно
  const declaredIsImage = declaredType.startsWith('image/');
  const detectedIsImage = detectedType.startsWith('image/');

  if (declaredIsImage !== detectedIsImage) {
    return {
      valid: false,
      detectedType,
      error: 'Содержимое файла не соответствует заявленному типу',
    };
  }

  return { valid: true, detectedType };
}

/**
 * Определяет расширение файла по detected MIME-типу.
 */
export function getExtensionFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'application/pdf':
      return 'pdf';
    case 'text/plain':
      return 'txt';
    default:
      return 'bin';
  }
}
