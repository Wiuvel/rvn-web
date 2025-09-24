import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { redisManager } from './redis';
import { logger } from './secure-logger';

const CSRF_SECRET = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';
const CSRF_TOKEN_LIFETIME = 60 * 60; // 1 hour in seconds

export async function generateCSRFToken(sessionId: string): Promise<string> {
  try {
    const timestamp = Date.now().toString();
    const nonce = randomBytes(16).toString('hex');
    const data = `${sessionId}-${timestamp}-${nonce}`;
    const signature = createHmac('sha256', CSRF_SECRET)
      .update(data)
      .digest('hex');
    
    const token = `${data}-${signature}`;
    
    // Store token in Redis with TTL
    const redisKey = `csrf:${sessionId}`;
    await redisManager.set(redisKey, token, CSRF_TOKEN_LIFETIME);
    
    return token;
  } catch (error) {
    logger.error('Error generating CSRF token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: sessionId.substring(0, 8) + '...'
    });
    throw new Error('Failed to generate CSRF token');
  }
}

export async function verifyCSRFToken(token: string, sessionId: string): Promise<boolean> {
  try {
    const parts = token.split('-');
    if (parts.length < 4) return false;
    
    const signature = parts.pop();
    const nonce = parts.pop();
    const timestamp = parts.pop();
    const tokenSessionId = parts.join('-');
    
    if (tokenSessionId !== sessionId) return false;
    
    // Check if token exists in Redis
    const redisKey = `csrf:${sessionId}`;
    const storedToken = await redisManager.get(redisKey);
    if (!storedToken || storedToken !== token) return false;
    
    // Check token is not older than 1 hour
    const tokenTime = parseInt(timestamp || '0');
    const now = Date.now();
    if (now - tokenTime > CSRF_TOKEN_LIFETIME * 1000) {
      await redisManager.del(redisKey);
      return false;
    }
    
    const data = `${tokenSessionId}-${timestamp}-${nonce}`;
    const expectedSignature = createHmac('sha256', CSRF_SECRET)
      .update(data)
      .digest('hex');
    
    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(signature || '', 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    logger.error('Error verifying CSRF token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: sessionId.substring(0, 8) + '...'
    });
    return false;
  }
}

export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

export async function revokeCSRFToken(sessionId: string): Promise<void> {
  try {
    const redisKey = `csrf:${sessionId}`;
    await redisManager.del(redisKey);
  } catch (error) {
    logger.error('Error revoking CSRF token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: sessionId.substring(0, 8) + '...'
    });
  }
}
