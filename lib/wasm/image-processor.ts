/**
 * Wrapper around the WASM image processing module.
 * Provides resizing capabilities with graceful fallback to the original buffer.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import initWasm, {
  resize_image,
  generate_thumbhash as wasm_generate_thumbhash,
} from './pkg/image_processor_wasm.js';

const wasmPath = fileURLToPath(new URL('./pkg/image_processor_wasm_bg.wasm', import.meta.url));

export interface ProcessImageOptions {
  width?: number;
  height?: number;
}

let wasmReady = false;

/**
 * Checks if the WASM module is ready/loadable.
 * Used for health checks or startup validation.
 */
export async function checkWasmReady(): Promise<boolean> {
  if (wasmReady) return true;
  try {
    const bytes = await readFile(wasmPath);
    await initWasm({ module_or_path: bytes });
    wasmReady = true;
    return true;
  } catch (error) {
    console.error('[WASM] Health check failed:', error);
    return false;
  }
}

/**
 * Processes an image buffer using WASM (resize).
 * Returns the original buffer if WASM is unavailable or fails.
 */
export async function processImage(
  buffer: Buffer,
  options: ProcessImageOptions = {},
): Promise<Buffer> {
  // If no resizing is needed, return original immediately
  if (!options.width && !options.height) {
    return buffer;
  }

  try {
    await checkWasmReady();
    const input = new Uint8Array(buffer);

    // Default to 0 if not provided (Rust side handles 0 as "keep original" or logic there)
    // But our logic in Rust: if width==0 || height==0 returns original.
    // So we need to ensure we pass valid dimensions if we want resize.
    // If only one dimension is provided, we might want to maintain aspect ratio,
    // but the current Rust implementation expects explicit width/height for resize_exact.
    // If you need aspect ratio preservation with one dimension, you should calculate it here or update Rust.
    // For now, we assume caller provides both or we pass 0 which results in no-op.
    const w = options.width ?? 0;
    const h = options.height ?? 0;

    if (w > 0 && h > 0) {
      const out = resize_image(input, w, h);
      return Buffer.from(out);
    }

    return buffer;
  } catch (error) {
    // Log the error but don't crash the request
    console.error('[WASM] Image processing failed (returning original):', error);
    return buffer;
  }
}

export async function generateThumbhash(buffer: Buffer): Promise<{
  thumbhash: string | null;
  width: number | null;
  height: number | null;
}> {
  try {
    await checkWasmReady();
    const result = wasm_generate_thumbhash(new Uint8Array(buffer));
    return {
      thumbhash: result?.thumbhash ?? null,
      width: result?.width ?? null,
      height: result?.height ?? null,
    };
  } catch (error) {
    console.error('[WASM] Thumbhash generation failed:', error);
    return { thumbhash: null, width: null, height: null };
  }
}
