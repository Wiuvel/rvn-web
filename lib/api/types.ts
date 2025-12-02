/**
 * Единая типизация для всех API эндпоинтов
 */

/**
 * Базовый тип для всех API ответов
 */
export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Тип для успешного ответа
 */
export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

/**
 * Тип для ответа с ошибкой
 */
export type ApiErrorResponse = {
  success: false;
  error: string;
};

/**
 * Объединенный тип ответа API
 */
export type ApiResult<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Типы для Auth API
 */
export interface LoginRequest {
  username: string;
  password: string;
  csrfToken?: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  confirmPassword: string;
  csrfToken?: string;
}

export interface AuthResponse {
  message?: string;
  dashboard_token?: string;
  access_token?: string; // JWT Access Token
  user?: UserData;
}

export interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  created_at: string;
  last_login?: string | null;
  avatar_gradient?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
}

export interface AuthCheckResponse {
  authenticated: boolean;
  user?: UserData;
}

export interface RefreshTokenResponse {
  message?: string;
  access_token: string;
}

/**
 * Типы для Support API
 */
export type TicketStatus = 'open' | 'closed' | 'pending';

export interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  assigned_to: string | null;
  user?: {
    id: string;
    username: string;
    user_id: string;
    avatar_gradient?: string | null;
  };
  assigned_user?: {
    id: string;
    username: string;
    user_id: string;
    avatar_gradient?: string | null;
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
    avatar_gradient?: string | null;
  };
}

export interface CreateTicketRequest {
  subject: string;
  message: string;
}

export interface UpdateTicketRequest {
  status?: TicketStatus;
  assigned_to?: string | null;
}

export interface SendMessageRequest {
  message: string;
}

export interface TicketsListResponse {
  tickets: Ticket[];
}

export interface TicketDetailResponse {
  ticket: Ticket;
  messages: SupportMessage[];
}

export interface CreateTicketResponse {
  ticket: Ticket;
  message: SupportMessage;
}

export interface SendMessageResponse {
  message: SupportMessage;
  success: boolean;
}

/**
 * Типы для Admin API
 */
export interface AdminUsersResponse {
  users: UserData[];
  total?: number;
}

export interface AdminUserRoleRequest {
  userId: string;
  role: 'support' | 'admin';
}

export interface AdminTeamCountResponse {
  count: number;
}

/**
 * Типы для Protection API
 */
export interface VerifyProtectionRequest {
  token: string;
}

export interface VerifyProtectionResponse {
  success: boolean;
}

/**
 * Типы для IP API
 */
export interface IpResponse {
  ip: string;
}

/**
 * Query параметры для списка тикетов
 */
export interface TicketsQueryParams {
  status?: 'open' | 'closed' | 'pending' | 'all';
  statuses?: string; // через запятую
  forUser?: boolean;
}

/**
 * Query параметры для списка пользователей
 */
export interface UsersQueryParams {
  page?: number;
  limit?: number;
  search?: string;
}

