import { describe, it, expect } from 'vitest';
import {
  isImageFile,
  isDocumentFile,
  validateFile,
  generateStoragePath,
} from '@/lib/storage/s3-client';

describe('isImageFile', () => {
  it('определяет image типы', () => {
    expect(isImageFile('image/png')).toBe(true);
    expect(isImageFile('image/jpeg')).toBe(true);
    expect(isImageFile('image/webp')).toBe(true);
  });
  it('отклоняет не-image типы', () => {
    expect(isImageFile('application/pdf')).toBe(false);
    expect(isImageFile('text/plain')).toBe(false);
  });
});

describe('isDocumentFile', () => {
  it('определяет PDF и TXT по MIME', () => {
    expect(isDocumentFile('application/pdf', 'document.pdf')).toBe(true);
    expect(isDocumentFile('text/plain', 'readme.txt')).toBe(true);
  });
  it('определяет документ по расширению при octet-stream', () => {
    expect(isDocumentFile('application/octet-stream', 'file.pdf')).toBe(true);
  });
  it('отклоняет неизвестные типы', () => {
    expect(isDocumentFile('image/png', 'image.png')).toBe(false);
  });
});

describe('validateFile', () => {
  it('принимает валидное изображение и PDF', () => {
    expect(validateFile({ size: 1024 * 1024, type: 'image/png', name: 'test.png' }).valid).toBe(
      true,
    );
    expect(
      validateFile({
        size: 5 * 1024 * 1024,
        type: 'application/pdf',
        name: 'document.pdf',
      }).valid,
    ).toBe(true);
  });
  it('отклоняет слишком большой или пустой файл', () => {
    const big = validateFile({
      size: 15 * 1024 * 1024,
      type: 'image/png',
      name: 'big.png',
    });
    expect(big.valid).toBe(false);
    const empty = validateFile({ size: 0, type: 'image/png', name: 'empty.png' });
    expect(empty.valid).toBe(false);
    expect(empty.error).toContain('пустым');
  });
  it('отклоняет запрещённые типы', () => {
    const zip = validateFile({
      size: 1024,
      type: 'application/zip',
      name: 'archive.zip',
    });
    expect(zip.valid).toBe(false);
  });
});

describe('generateStoragePath', () => {
  it('генерирует путь с messageId', () => {
    const path = generateStoragePath('ticket-123', 'photo.png', 'msg-456');
    expect(path).toMatch(/^support\/ticket-123\/msg-456\/\d+_photo\.png$/);
  });
  it('генерирует путь без messageId (pending)', () => {
    const path = generateStoragePath('ticket-123', 'photo.png');
    expect(path).toMatch(/^support\/ticket-123\/pending\/\d+_photo\.png$/);
  });
  it('sanitizes имя файла', () => {
    const path = generateStoragePath('t1', 'файл (1).png', 'msg1');
    expect(path).not.toContain(' ');
    expect(path).not.toContain('(');
  });
});
