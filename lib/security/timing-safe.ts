import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison to prevent timing attacks.
 * Hashes inputs with SHA-256 to ensure equal-length buffers before comparison,
 * preventing timing leaks based on string length.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();

  return timingSafeEqual(hashA, hashB);
}

/**
 * Constant-time password verification using Argon2id with guaranteed minimum delay.
 */
export async function timingSafePasswordVerify(password: string, hash: string): Promise<boolean> {
  const startTime = process.hrtime.bigint();

  let result = false;
  try {
    const { verify } = await import('@node-rs/argon2');
    result = await verify(hash, password);
  } catch {
    result = false;
  }

  // Add constant delay to prevent timing analysis (convert nanoseconds to milliseconds)
  const endTime = process.hrtime.bigint();
  const elapsedMs = Number(endTime - startTime) / 1_000_000;
  const minDelayMs = 100; // Minimum 100ms delay

  if (elapsedMs < minDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(minDelayMs - elapsedMs)));
  }

  return result;
}

/**
 * Constant-time username verification
 */
export function timingSafeUsernameVerify(input: string, stored: string): boolean {
  // Always perform the same operations
  const normalizedInput = input.toLowerCase().trim();
  const normalizedStored = stored.toLowerCase().trim();

  return timingSafeCompare(normalizedInput, normalizedStored);
}

/**
 * Add random delay to prevent timing analysis
 */
export function addRandomDelay(minMs: number = 50, maxMs: number = 150): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
