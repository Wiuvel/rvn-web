import { describe, it, expect } from 'vitest';
import {
  detectMimeType,
  validateFileContent,
  getExtensionFromMime,
} from '@/lib/validation/magic-bytes';

describe('detectMimeType', () => {
  it('определяет PNG по magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectMimeType(buf)).toBe('image/png');
  });
  it('определяет JPEG и GIF', () => {
    const jpeg = Buffer.alloc(16);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    expect(detectMimeType(jpeg)).toBe('image/jpeg');
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(detectMimeType(gif)).toBe('image/gif');
  });
  it('определяет WebP (RIFF....WEBP)', () => {
    const buf = Buffer.alloc(16);
    buf[0] = 0x52;
    buf[1] = 0x49;
    buf[2] = 0x46;
    buf[3] = 0x46;
    buf[8] = 0x57;
    buf[9] = 0x45;
    buf[10] = 0x42;
    buf[11] = 0x50;
    expect(detectMimeType(buf)).toBe('image/webp');
  });
  it('определяет PDF и SVG', () => {
    expect(detectMimeType(Buffer.from('%PDF-1.7 test'))).toBe('application/pdf');
    expect(
      detectMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>')),
    ).toBe('image/svg+xml');
  });
  it('возвращает null для неизвестного или короткого буфера', () => {
    expect(detectMimeType(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
  });
});

describe('validateFileContent', () => {
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  it('валидирует совпадающий тип', () => {
    const result = validateFileContent(pngBuf, 'image/png', 'test.png');
    expect(result.valid).toBe(true);
  });
  it('отклоняет несовпадение категорий', () => {
    const result = validateFileContent(pngBuf, 'application/pdf', 'test.pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('не соответствует');
  });
  it('отклоняет неразрешённый тип (SVG)', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>');
    const result = validateFileContent(buf, 'image/svg+xml', 'test.svg');
    expect(result.valid).toBe(false);
  });
});

describe('getExtensionFromMime', () => {
  it('возвращает правильные расширения', () => {
    expect(getExtensionFromMime('image/png')).toBe('png');
    expect(getExtensionFromMime('image/jpeg')).toBe('jpg');
    expect(getExtensionFromMime('application/pdf')).toBe('pdf');
  });
  it('возвращает bin для неизвестного MIME', () => {
    expect(getExtensionFromMime('application/octet-stream')).toBe('bin');
  });
});
