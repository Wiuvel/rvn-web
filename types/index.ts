/**
 * Реэкспорт типов из lib/api для обратной совместимости
 * Рекомендуется использовать импорты напрямую из lib/api
 */
export type {
  // Базовые типы
  ApiResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResult,
  
  // Auth типы
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserData,
  AuthCheckResponse,
  
  // Support типы
  TicketStatus,
  Ticket,
  SupportMessage,
  CreateTicketRequest,
  UpdateTicketRequest,
  SendMessageRequest,
  TicketsListResponse,
  TicketDetailResponse,
  CreateTicketResponse,
  SendMessageResponse,
  TicketsQueryParams,
  
  // Admin типы
  AdminUsersResponse,
  AdminUserRoleRequest,
  AdminTeamCountResponse,
  UsersQueryParams,
  
  // Другие типы
  VerifyProtectionRequest,
  VerifyProtectionResponse,
  IpResponse,
} from '@/lib/api/types';

// Импорты для использования в локальных типах
import type { Ticket, SupportMessage } from '@/lib/api/types';

/**
 * Локальные типы (не связанные с API)
 */
export interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

// Обратная совместимость - старые типы
export interface TicketsResponse {
  tickets: Ticket[];
}

export interface TicketResponse {
  ticket: Ticket;
  messages: SupportMessage[];
}

