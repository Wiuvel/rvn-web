/**
 * Общий клиент для API вызовов
 * Предоставляет типизированные методы для работы с API
 */
import type {
  ApiResult,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  AuthCheckResponse,
  RefreshTokenResponse,
  UserData,
  CreateTicketRequest,
  UpdateTicketRequest,
  SendMessageRequest,
  TicketsListResponse,
  TicketDetailResponse,
  CreateTicketResponse,
  SendMessageResponse,
  TicketsQueryParams,
  UsersQueryParams,
  AdminUsersResponse,
  AdminUserRoleRequest,
  AdminTeamCountResponse,
  VerifyProtectionRequest,
  VerifyProtectionResponse,
  IpResponse,
  Ticket,
} from './types';

/**
 * Базовый класс для API клиента
 */
class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshTokenPromise: Promise<string | null> | null = null;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
    
    // Загружаем токен из localStorage при инициализации (если есть)
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('access_token');
    }
  }

  /**
   * Обновление access token через refresh token
   */
  private async refreshAccessToken(): Promise<string | null> {
    // Предотвращаем множественные одновременные запросы на обновление
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          // Если refresh не удался, очищаем токены
          this.accessToken = null;
          if (typeof window !== 'undefined') {
            localStorage.removeItem('access_token');
          }
          return null;
        }

        const data = await response.json();
        const newAccessToken = data.access_token;

        if (newAccessToken) {
          this.accessToken = newAccessToken;
          if (typeof window !== 'undefined') {
            localStorage.setItem('access_token', newAccessToken);
          }
        }

        return newAccessToken;
      } catch {
        this.accessToken = null;
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
        }
        return null;
      } finally {
        this.refreshTokenPromise = null;
      }
    })();

    return this.refreshTokenPromise;
  }

  /**
   * Базовый метод для выполнения запросов с автоматическим обновлением токенов
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryOn401: boolean = true
  ): Promise<ApiResult<T>> {
    try {
      // Добавляем access token в заголовок, если он есть
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };

      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers: headers as HeadersInit,
      });

      // Если получили 401 и это не был запрос на refresh, пробуем обновить токен
      if (response.status === 401 && retryOn401 && endpoint !== '/api/auth/refresh') {
        const newToken = await this.refreshAccessToken();
        
        if (newToken) {
          // Повторяем запрос с новым токеном
          headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers: headers as HeadersInit,
          });

          const retryData = await retryResponse.json();

          if (!retryResponse.ok) {
            return {
              success: false,
              error: retryData.error || `HTTP ${retryResponse.status}: ${retryResponse.statusText}`,
            };
          }

          return {
            success: true,
            data: retryData as T,
          };
        }
      }

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // Сохраняем access token из ответа, если он есть (например, после login)
      if (data.access_token) {
        this.accessToken = data.access_token;
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', data.access_token);
        }
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Установка access token вручную (например, после login)
   */
  setAccessToken(token: string | null) {
    this.accessToken = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('access_token', token);
      } else {
        localStorage.removeItem('access_token');
      }
    }
  }

  /**
   * Очистка токенов (при logout)
   */
  clearTokens() {
    this.accessToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
    }
  }

  /**
   * Auth API
   */
  async login(credentials: LoginRequest): Promise<ApiResult<AuthResponse>> {
    const result = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }, false); // Не повторяем запрос при 401 для login
    
    // Сохраняем access token после успешного логина
    if (result.success && result.data.access_token) {
      this.setAccessToken(result.data.access_token);
    }
    
    return result;
  }

  async register(data: RegisterRequest): Promise<ApiResult<AuthResponse>> {
    return this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout(): Promise<ApiResult<{ message: string }>> {
    const result = await this.request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    });
    
    // Очищаем токены после logout
    this.clearTokens();
    
    return result;
  }

  async checkAuth(): Promise<ApiResult<AuthCheckResponse>> {
    return this.request<AuthCheckResponse>('/api/auth/check');
  }

  async getMe(): Promise<ApiResult<UserData>> {
    return this.request<UserData>('/api/auth/me');
  }

  async getCsrfToken(): Promise<ApiResult<{ token: string }>> {
    return this.request<{ token: string }>('/api/auth/csrf');
  }

  /**
   * Обновление access token через refresh token
   */
  async refreshTokens(): Promise<ApiResult<RefreshTokenResponse>> {
    const result = await this.request<RefreshTokenResponse>('/api/auth/refresh', {
      method: 'POST',
    }, false); // Не повторяем запрос при 401 для refresh
    
    if (result.success && result.data.access_token) {
      this.setAccessToken(result.data.access_token);
    }
    
    return result;
  }

  /**
   * Support API
   */
  async getTickets(params?: TicketsQueryParams): Promise<ApiResult<TicketsListResponse>> {
    const queryString = params
      ? '?' + new URLSearchParams(
          Object.entries(params).reduce((acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = String(value);
            }
            return acc;
          }, {} as Record<string, string>)
        ).toString()
      : '';
    
    return this.request<TicketsListResponse>(`/api/support/tickets${queryString}`);
  }

  async getTicket(ticketId: string): Promise<ApiResult<TicketDetailResponse>> {
    return this.request<TicketDetailResponse>(`/api/support/tickets/${ticketId}`);
  }

  async createTicket(data: CreateTicketRequest): Promise<ApiResult<CreateTicketResponse>> {
    return this.request<CreateTicketResponse>('/api/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTicket(
    ticketId: string,
    data: UpdateTicketRequest
  ): Promise<ApiResult<{ ticket: Ticket }>> {
    return this.request<{ ticket: Ticket }>(
      `/api/support/tickets/${ticketId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async sendMessage(
    ticketId: string,
    data: SendMessageRequest
  ): Promise<ApiResult<SendMessageResponse>> {
    return this.request<SendMessageResponse>(
      `/api/support/tickets/${ticketId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async markMessagesAsRead(ticketId: string): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>(
      `/api/support/tickets/${ticketId}/messages/read`,
      {
        method: 'POST',
      }
    );
  }

  async checkSupport(): Promise<ApiResult<{ available: boolean }>> {
    return this.request<{ available: boolean }>('/api/support/check');
  }

  /**
   * Admin API
   */
  async getUsers(params?: UsersQueryParams): Promise<ApiResult<AdminUsersResponse>> {
    const queryString = params
      ? '?' + new URLSearchParams(
          Object.entries(params).reduce((acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = String(value);
            }
            return acc;
          }, {} as Record<string, string>)
        ).toString()
      : '';
    
    return this.request<AdminUsersResponse>(`/api/admin/users${queryString}`);
  }

  async grantUserRole(data: AdminUserRoleRequest): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>('/api/admin/users/roles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async revokeUserRole(data: AdminUserRoleRequest): Promise<ApiResult<{ success: boolean }>> {
    return this.request<{ success: boolean }>('/api/admin/users/roles', {
      method: 'DELETE',
      body: JSON.stringify(data),
    });
  }

  async getTeamCount(): Promise<ApiResult<AdminTeamCountResponse>> {
    return this.request<AdminTeamCountResponse>('/api/admin/team/count');
  }

  /**
   * Protection API
   */
  async verifyProtection(data: VerifyProtectionRequest): Promise<ApiResult<VerifyProtectionResponse>> {
    return this.request<VerifyProtectionResponse>('/api/protection/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * IP API
   */
  async getIp(): Promise<ApiResult<IpResponse>> {
    return this.request<IpResponse>('/api/ip');
  }
}

// Экспортируем singleton экземпляр
export const apiClient = new ApiClient();

// Экспортируем класс для возможности создания кастомных экземпляров
export { ApiClient };

