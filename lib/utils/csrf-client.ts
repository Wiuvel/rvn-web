/**
 * Утилита для работы с CSRF токенами на клиенте
 * Автоматически получает и обновляет токены перед истечением
 */

interface CSRFTokenData {
  token: string;
  expiresAt: number;
}

class CSRFTokenManager {
  private tokenData: CSRFTokenData | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<string> | null = null;
  private readonly TOKEN_LIFETIME = 60 * 60 * 1000; // 1 час
  private readonly REFRESH_BEFORE_EXPIRY = 10 * 60 * 1000; // Обновляем за 10 минут до истечения

  /**
   * Получить CSRF токен (с автоматическим обновлением)
   */
  async getToken(): Promise<string> {
    // Если токен еще валиден, возвращаем его
    if (this.tokenData && this.tokenData.expiresAt > Date.now()) {
      return this.tokenData.token;
    }

    // Если уже идет обновление, ждем его
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Запрашиваем новый токен
    this.refreshPromise = this.fetchToken();
    const token = await this.refreshPromise;
    this.refreshPromise = null;

    return token;
  }

  /**
   * Запросить новый CSRF токен с сервера
   */
  private async fetchToken(): Promise<string> {
    try {
      const response = await fetch('/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch CSRF token: ${response.status}`);
      }

      const data = await response.json();
      const token = data.csrfToken;

      if (!token) {
        throw new Error('CSRF token not found in response');
      }

      // Сохраняем токен с временем истечения
      this.tokenData = {
        token,
        expiresAt: Date.now() + this.TOKEN_LIFETIME,
      };

      // Планируем автоматическое обновление за 10 минут до истечения
      this.scheduleRefresh();

      return token;
    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      // В случае ошибки возвращаем старый токен, если он есть
      if (this.tokenData) {
        return this.tokenData.token;
      }
      throw error;
    }
  }

  /**
   * Запланировать автоматическое обновление токена
   */
  private scheduleRefresh(): void {
    // Очищаем предыдущий таймер
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenData) return;

    // Вычисляем время до обновления (за 10 минут до истечения)
    const timeUntilRefresh = this.tokenData.expiresAt - Date.now() - this.REFRESH_BEFORE_EXPIRY;

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setTimeout(() => {
        // Обновляем токен в фоне
        this.refreshPromise = this.fetchToken();
        this.refreshPromise
          .then(() => {
            this.refreshPromise = null;
          })
          .catch(() => {
            this.refreshPromise = null;
          });
      }, timeUntilRefresh);
    }
  }

  /**
   * Принудительно обновить токен
   */
  async refresh(): Promise<string> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.tokenData = null;
    return this.getToken();
  }

  /**
   * Очистить токен (при выходе)
   */
  clear(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.tokenData = null;
    this.refreshPromise = null;
  }
}

// Singleton instance
export const csrfTokenManager = new CSRFTokenManager();

/**
 * Получить CSRF токен (удобная функция)
 */
export async function getCSRFToken(): Promise<string> {
  return csrfTokenManager.getToken();
}
