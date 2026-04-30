import { randomBytes } from 'node:crypto';

/**
 * Generates a random session ID.
 * Used for CSRF tokens and sessions.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}
