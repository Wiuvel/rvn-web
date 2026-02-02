/**
 * Обёртка над WASM-модулем обработки изображений (docs/IMAGE_CACHE_IMPLEMENTATION_PLAN.md, Фаза 2).
 * При отсутствии или ошибке WASM возвращает исходный буфер (fallback).
 */

export interface ProcessImageOptions {
  width?: number;
  height?: number;
  format?: 'webp' | 'jpeg';
}

let wasmModule: {
  resize_image: (input: Uint8Array, width: number, height: number) => Uint8Array;
  convert_to_webp: (input: Uint8Array) => Uint8Array;
} | null = null;
let initPromise: Promise<boolean> | null = null;

async function initWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const pkg = await import('./pkg/image_processor_wasm.js');
      const init = pkg.default as unknown as (() => Promise<void>) | undefined;
      if (typeof init === 'function') {
        await init();
      }
      wasmModule = {
        resize_image: pkg.resize_image,
        convert_to_webp: pkg.convert_to_webp,
      };
      return true;
    } catch {
      return false;
    }
  })();
  return initPromise;
}

/**
 * Проверка готовности WASM при старте приложения (instrumentation).
 * Возвращает true, если модуль загружен и доступен.
 */
export async function checkWasmReady(): Promise<boolean> {
  return initWasm();
}

/**
 * Обработка изображения через WASM (ресайз/конвертация).
 * Если WASM недоступен или произошла ошибка — возвращает исходный buffer.
 */
export async function processImage(
  buffer: Buffer,
  options: ProcessImageOptions = {}
): Promise<Buffer> {
  const ok = await initWasm();
  if (!ok || !wasmModule) {
    return buffer;
  }
  try {
    const input = new Uint8Array(buffer);
    if (options.width != null && options.height != null) {
      const out = wasmModule.resize_image(input, options.width, options.height);
      return Buffer.from(out);
    }
    if (options.format === 'webp') {
      const out = wasmModule.convert_to_webp(input);
      return Buffer.from(out);
    }
    return buffer;
  } catch {
    return buffer;
  }
}
