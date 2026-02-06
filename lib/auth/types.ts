export interface UserDataPayload {
  user_id: string;
  username: string;
  avatar?: string | null;
  banner?: string | null;
}

export interface SessionData {
  id: string;
  userId: string;
  username: string;
  tokenFingerprint: string;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}
