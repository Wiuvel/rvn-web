import { randomBytes } from 'node:crypto';

/**
 * Generate a random base64 secret. 32 bytes → 44-char base64 string,
 * which satisfies the >= 32 char check in lib/validation/env-validation.ts.
 */
export function genSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64');
}
