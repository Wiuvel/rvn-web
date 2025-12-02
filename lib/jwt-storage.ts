/**
 * Управление хранением refresh токенов в базе данных
 */
import { createHash } from 'crypto';
import { supabaseAdmin } from './supabase';
import { logger } from './secure-logger';
import { appConfig } from './config';

/**
 * Хеширование токена для безопасного хранения
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Интерфейс для refresh токена в БД
 */
export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  token_fingerprint?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  expires_at: string;
  created_at: string;
  last_used_at?: string | null;
  is_revoked: boolean;
  revoked_at?: string | null;
  revoked_reason?: string | null;
}

/**
 * Сохранение refresh токена в БД
 */
export async function storeRefreshToken(
  userId: string,
  token: string,
  options?: {
    fingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      logger.error('Database not configured for refresh token storage');
      return { success: false, error: 'Database not configured' };
    }

    // Вычисляем время истечения (60 дней)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // Хешируем токен для безопасного хранения
    const tokenHash = hashToken(token);

    // Проверяем количество активных токенов пользователя
    const { data: activeTokens, error: countError } = await supabaseAdmin
      .from('refresh_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString());

    if (countError) {
      logger.error('Error counting active tokens', {
        error: countError.message,
        userId
      });
      // Продолжаем, даже если не удалось посчитать
    } else if (activeTokens && activeTokens.length >= appConfig.jwt.refreshTokenStorage.maxTokensPerUser) {
      // Удаляем самый старый токен
      const { data: oldestToken } = await supabaseAdmin
        .from('refresh_tokens')
        .select('id')
        .eq('user_id', userId)
        .eq('is_revoked', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (oldestToken) {
        await supabaseAdmin
          .from('refresh_tokens')
          .delete()
          .eq('id', oldestToken.id);
      }
    }

    // Сохраняем новый токен
    const { error: insertError } = await supabaseAdmin
      .from('refresh_tokens')
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        token_fingerprint: options?.fingerprint || null,
        ip_address: options?.ipAddress || null,
        user_agent: options?.userAgent || null,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      logger.error('Error storing refresh token', {
        error: insertError.message,
        code: insertError.code,
        userId
      });
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    logger.error('Unexpected error storing refresh token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Проверка существования и валидности refresh токена в БД
 */
export async function verifyRefreshTokenInDB(
  token: string,
  userId?: string
): Promise<{ valid: boolean; record?: RefreshTokenRecord; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { valid: false, error: 'Database not configured' };
    }

    const tokenHash = hashToken(token);

    // Ищем токен в БД
    let query = supabaseAdmin
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString());

    // Если передан userId, дополнительно проверяем
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return { valid: false, error: 'Token not found or invalid' };
    }

    // Обновляем last_used_at
    await supabaseAdmin
      .from('refresh_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    return { valid: true, record: data as RefreshTokenRecord };
  } catch (error) {
    logger.error('Error verifying refresh token in DB', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { valid: false, error: 'Unexpected error' };
  }
}

/**
 * Проверка refresh token с одновременным получением данных пользователя
 * Оптимизированная версия для уменьшения количества запросов к БД
 */
export async function verifyRefreshTokenWithUser(
  token: string,
  userId?: string
): Promise<{ 
  valid: boolean; 
  record?: RefreshTokenRecord; 
  user?: {
    id: string;
    username: string;
    user_id: string;
    dashboard_token: string;
    is_active: boolean;
  };
  error?: string 
}> {
  try {
    if (!supabaseAdmin) {
      return { valid: false, error: 'Database not configured' };
    }

    const tokenHash = hashToken(token);

    // Один запрос вместо двух - получаем токен и данные пользователя через JOIN
    let query = supabaseAdmin
      .from('refresh_tokens')
      .select(`
        *,
        users:user_id (
          id,
          username,
          user_id,
          dashboard_token,
          is_active
        )
      `)
      .eq('token_hash', tokenHash)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString());

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return { valid: false, error: 'Token not found or invalid' };
    }

    // Обновляем last_used_at
    await supabaseAdmin
      .from('refresh_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    // Извлекаем данные пользователя из результата
    const user = Array.isArray(data.users) ? data.users[0] : data.users;

    return { 
      valid: true, 
      record: data as RefreshTokenRecord,
      user: user ? {
        id: user.id,
        username: user.username,
        user_id: user.user_id,
        dashboard_token: user.dashboard_token,
        is_active: user.is_active
      } : undefined
    };
  } catch (error) {
    logger.error('Error verifying refresh token with user', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { valid: false, error: 'Unexpected error' };
  }
}

/**
 * Отзыв refresh токена
 */
export async function revokeRefreshToken(
  token: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    const tokenHash = hashToken(token);

    const { error } = await supabaseAdmin
      .from('refresh_tokens')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_reason: reason || 'Manual revocation'
      })
      .eq('token_hash', tokenHash)
      .eq('is_revoked', false);

    if (error) {
      logger.error('Error revoking refresh token', {
        error: error.message,
        code: error.code
      });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logger.error('Unexpected error revoking refresh token', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Отзыв всех refresh токенов пользователя
 */
export async function revokeAllUserRefreshTokens(
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; revokedCount?: number }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    const { data, error } = await supabaseAdmin
      .from('refresh_tokens')
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString(),
        revoked_reason: reason || 'User logout or security action'
      })
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .select('id');

    if (error) {
      logger.error('Error revoking all user refresh tokens', {
        error: error.message,
        code: error.code,
        userId
      });
      return { success: false, error: error.message };
    }

    return { success: true, revokedCount: data?.length || 0 };
  } catch (error) {
    logger.error('Unexpected error revoking all user refresh tokens', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Очистка истекших и отозванных токенов
 */
export async function cleanupExpiredRefreshTokens(): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    // Удаляем истекшие токены
    const now = new Date().toISOString();
    const { data: expiredData, error: expiredError } = await supabaseAdmin
      .from('refresh_tokens')
      .delete()
      .lt('expires_at', now)
      .select('id');

    // Удаляем отозванные токены старше 30 дней
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: revokedData, error: revokedError } = await supabaseAdmin
      .from('refresh_tokens')
      .delete()
      .eq('is_revoked', true)
      .lt('revoked_at', thirtyDaysAgo.toISOString())
      .select('id');

    const error = expiredError || revokedError;
    const data = [...(expiredData || []), ...(revokedData || [])];

    if (error) {
      logger.error('Error cleaning up expired refresh tokens', {
        error: error.message,
        code: error.code
      });
      return { success: false, error: error.message };
    }

    const deletedCount = data?.length || 0;
    if (deletedCount > 0) {
      logger.info('Cleaned up expired refresh tokens', { deletedCount });
    }

    return { success: true, deletedCount };
  } catch (error) {
    logger.error('Unexpected error cleaning up expired refresh tokens', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Получение всех активных токенов пользователя
 */
export async function getUserRefreshTokens(userId: string): Promise<{ tokens: RefreshTokenRecord[]; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { tokens: [], error: 'Database not configured' };
    }

    const { data, error } = await supabaseAdmin
      .from('refresh_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error getting user refresh tokens', {
        error: error.message,
        code: error.code,
        userId
      });
      return { tokens: [], error: error.message };
    }

    return { tokens: (data || []) as RefreshTokenRecord[] };
  } catch (error) {
    logger.error('Unexpected error getting user refresh tokens', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });
    return { tokens: [], error: 'Unexpected error' };
  }
}

