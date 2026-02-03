/**
 * Обёртка над WASM-модулем обработки изображений (docs/IMAGE_CACHE_IMPLEMENTATION_PLAN.md, Фаза 2).
 * При отсутствии или ошибке WASM возвращает исходный буфер (fallback).
 * Только относительный импорт — без process.cwd(), иначе Turbopack резолвит ./ROOT/... и падает.
 */

export interface ProcessImageOptions {
  width?: number;
  height?: number;
}

let wasmModule: {
  resize_image: (input: Uint8Array, width: number, height: number) => Uint8Array;
} | null = null;
let initPromise: Promise<boolean> | null = null;

/** Загрузка WASM-пакета: сначала относительный импорт, при ошибке — по cwd (dev: бандл не в lib/wasm). */
async function loadWasmPkg(): Promise<{
  default?: unknown;
  resize_image: (input: Uint8Array, width: number, height: number) => Uint8Array;
}> {
  try {
    return await import('./pkg/image_processor_wasm.js');
  } catch {
    // Fallback: путь из cwd в рантайме (строка собирается по частям, чтобы Turbopack не подставлял ROOT)
    const path = await import('path');
    const { createRequire } = await import('module');
    const cwd = typeof process !== 'undefined' ? process.cwd() : '';
    const sub = ['lib', 'wasm', 'pkg', 'image_processor_wasm.js'];
    const pkgPath = path.join(cwd, ...sub);
    const req = createRequire(path.join(cwd, 'package.json'));
    return req(pkgPath);
  }
}

async function initWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const pkg = await loadWasmPkg();
      const init = pkg.default as unknown as (() => Promise<void>) | undefined;
      if (typeof init === 'function') {
        await init();
      }
      wasmModule = {
        resize_image: pkg.resize_image,
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
 * Обработка изображения через WASM (ресайз).
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
    return buffer;
  } catch {
    return buffer;
  }
}
