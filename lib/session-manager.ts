import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

interface SessionData {
  id: string;
  userId: string;
  username: string;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

interface SessionStore {
  [sessionId: string]: SessionData;
}

const sessions: SessionStore = {};
const SESSION_TIMEOUT = 60 * 60 * 1000; 
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  Object.keys(sessions).forEach(sessionId => {
    if (now - sessions[sessionId].lastActivity > SESSION_TIMEOUT) {
      delete sessions[sessionId];
    }
  });
}, SESSION_CLEANUP_INTERVAL);

export class SessionManager {
  static generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  static createSession(userId: string, username: string, ipAddress: string, userAgent: string): string {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    
    sessions[sessionId] = {
      id: sessionId,
      userId,
      username,
      createdAt: now,
      lastActivity: now,
      ipAddress,
      userAgent
    };
    
    return sessionId;
  }

  static getSession(sessionId: string): SessionData | null {
    const session = sessions[sessionId];
    if (!session) return null;
    
    const now = Date.now();
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      delete sessions[sessionId];
      return null;
    }
    
    session.lastActivity = now;
    return session;
  }

  static updateSession(sessionId: string, updates: Partial<SessionData>): boolean {
    const session = sessions[sessionId];
    if (!session) return false;
    
    Object.assign(session, updates);
    session.lastActivity = Date.now();
    return true;
  }

  static destroySession(sessionId: string): boolean {
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      return true;
    }
    return false;
  }

  static destroyAllUserSessions(userId: string): number {
    let destroyed = 0;
    Object.keys(sessions).forEach(sessionId => {
      if (sessions[sessionId].userId === userId) {
        delete sessions[sessionId];
        destroyed++;
      }
    });
    return destroyed;
  }

  static async setSessionCookie(sessionId: string, isLocalhost: boolean = false): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set('session_id', sessionId, {
      maxAge: SESSION_TIMEOUT / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });
  }

  static async clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete('session_id');
  }

  static validateSession(sessionId: string, ipAddress: string, userAgent: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;
    
    if (session.ipAddress !== ipAddress || session.userAgent !== userAgent) {
      this.destroySession(sessionId);
      return false;
    }
    
    return true;
  }
}
