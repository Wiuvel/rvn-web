/**
 * Wrapper around the WASM image processing module.
 * Provides resizing capabilities with graceful fallback to the original buffer.
 */

import { console } from 'inspector';
import path from 'path';
import { createRequire } from 'module';

export interface ProcessImageOptions {
  width?: number;
  height?: number;
}

// Type definition for the WASM module exports
interface WasmModule {
  resize_image: (input: Uint8Array, width: number, height: number) => Uint8Array;
}

let wasmModule: WasmModule | null = null;

/**
 * Loads the WASM package.
 * Tries dynamic import first (standard), falls back to filesystem load (Next.js server/dev context).
 */
async function loadWasmPkg(): Promise<WasmModule> {
  if (wasmModule) return wasmModule;

  try {
    // 1. Try standard dynamic import (works in most bundled environments if configured correctly)
    // @ts-ignore - The pkg directory is generated at build time
    const pkg = await import('./pkg/image_processor_wasm.js');
    if (pkg && typeof pkg.resize_image === 'function') {
      wasmModule = pkg;
      return pkg;
    }
    throw new Error('Invalid WASM module structure via import');
  } catch (importError) {
    // 2. Fallback: Load from filesystem (reliable in Next.js Server Actions / API routes)
    // This handles cases where the bundler doesn't resolve the relative import correctly at runtime
    try {
      const cwd = process.cwd();
      // Construct path: [project_root]/lib/wasm/pkg/image_processor_wasm.js
      // Ensure this path matches your build output structure
      const pkgPath = path.join(cwd, 'lib', 'wasm', 'pkg', 'image_processor_wasm.js');
      
      const require = createRequire(path.join(cwd, 'package.json'));
      const pkg = require(pkgPath);
      
      if (pkg && typeof pkg.resize_image === 'function') {
        wasmModule = pkg;
        return pkg;
      }
      throw new Error('Invalid WASM module structure via require');
    } catch (fsError) {
      // Combine errors for better debugging
      throw new Error(`Failed to load WASM module. Import error: ${importError}. FS error: ${fsError}`);
    }
  }
}

/**
 * Checks if the WASM module is ready/loadable.
 * Used for health checks or startup validation.
 */
export async function checkWasmReady(): Promise<boolean> {
  try {
    await loadWasmPkg();
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
  options: ProcessImageOptions = {}
): Promise<Buffer> {
  // If no resizing is needed, return original immediately
  if (!options.width && !options.height) {
    return buffer;
  }

  try {
    const mod = await loadWasmPkg();
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
       const out = mod.resize_image(input, w, h);
       return Buffer.from(out);
    }
    
    return buffer;
  } catch (error) {
    // Log the error but don't crash the request
    console.error('[WASM] Image processing failed (returning original):', error);
    return buffer;
  }
}
