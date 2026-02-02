/**
 * Проверяет загрузку WASM image processor (Rust).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { checkWasmReady } = await import('./lib/wasm/image-processor');
      const ok = await checkWasmReady();
      console.log(
        ok
          ? '[startup] WASM image processor: ready'
          : '[startup] WASM image processor: unavailable (fallback to passthrough)'
      );
    } catch {
      console.log('[startup] WASM image processor: failed to load (fallback to passthrough)');
    }
  }
}
