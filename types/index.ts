export interface UserData {
  id: string;
  user_id: string;
  username: string;
  token?: string;
  created_at: string;
  last_login?: string;
  avatar?: string | null;
  banner?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
  balance?: number;
  pex?: 'u' | 's' | 'a';
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

/**
 * Base type for API responses
 */
export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
}

/**
 * Types for Support API
 */
export interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed' | 'pending';
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  assigned_to: string | null;
  user?: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  };
  assigned_user?: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  } | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_type: 'user' | 'support';
  message_text: string;
  created_at: string;
  sender?: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  };
}

export interface TicketsResponse extends ApiResponse {
  tickets: Ticket[];
}

export interface TicketResponse extends ApiResponse {
  ticket: Ticket;
  messages: SupportMessage[];
}

/**
 * Types for Auth API
 */
export interface AuthResponse extends ApiResponse {
  user?: UserData;
  user_id?: string;
  token?: string;
}

/**
 * Types for Admin API
 */
export interface AdminUsersResponse extends ApiResponse {
  users?: UserData[];
  total?: number;
}
