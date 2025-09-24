import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

const CSRF_SECRET = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';
const CSRF_TOKEN_LIFETIME = 60 * 60 * 1000; // 1 hour

interface CSRFStore {
  [sessionId: string]: {
    token: string;
    createdAt: number;
  };
}

const csrfStore: CSRFStore = {};

// Cleanup expired tokens
setInterval(() => {
  const now = Date.now();
  Object.keys(csrfStore).forEach(sessionId => {
    if (now - csrfStore[sessionId].createdAt > CSRF_TOKEN_LIFETIME) {
      delete csrfStore[sessionId];
    }
  });
}, 5 * 60 * 1000); // Cleanup every 5 minutes

export function generateCSRFToken(sessionId: string): string {
  const timestamp = Date.now().toString();
  const nonce = randomBytes(16).toString('hex');
  const data = `${sessionId}-${timestamp}-${nonce}`;
  const signature = createHmac('sha256', CSRF_SECRET)
    .update(data)
    .digest('hex');
  
  const token = `${data}-${signature}`;
  
  // Store token for validation
  csrfStore[sessionId] = {
    token,
    createdAt: Date.now()
  };
  
  return token;
}

export function verifyCSRFToken(token: string, sessionId: string): boolean {
  try {
    const parts = token.split('-');
    if (parts.length < 4) return false;
    
    const signature = parts.pop();
    const nonce = parts.pop();
    const timestamp = parts.pop();
    const tokenSessionId = parts.join('-');
    
    if (tokenSessionId !== sessionId) return false;
    
    // Check if token exists in store
    const storedToken = csrfStore[sessionId];
    if (!storedToken || storedToken.token !== token) return false;
    
    // Check token is not older than 1 hour
    const tokenTime = parseInt(timestamp || '0');
    const now = Date.now();
    if (now - tokenTime > CSRF_TOKEN_LIFETIME) {
      delete csrfStore[sessionId];
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
  } catch {
    return false;
  }
}

export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

export function revokeCSRFToken(sessionId: string): void {
  delete csrfStore[sessionId];
}
