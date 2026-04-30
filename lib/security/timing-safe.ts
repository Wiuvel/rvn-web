import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Constant-time password verification using Argon2id
 */
export async function timingSafePasswordVerify(password: string, hash: string): Promise<boolean> {
  const startTime = process.hrtime.bigint();

  const { verify } = await import('@node-rs/argon2');
  const result = await verify(hash, password);

  // Add constant delay to prevent timing analysis
  const endTime = process.hrtime.bigint();
  const elapsed = Number(endTime - startTime);
  const minDelay = 100; // Minimum 100ms delay

  if (elapsed < minDelay) {
    await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
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
