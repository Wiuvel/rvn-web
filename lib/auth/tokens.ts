/**
 * Управление refresh токенами в базе данных
 */

import { createHash } from 'crypto';
import { supabaseAdmin } from '../supabase';
import type { RefreshTokenRecord, User } from './types';

// ============================================================================
// Token Hashing
// ============================================================================

/**
 * Хеширует токен для безопасного хранения в БД
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// Token Storage
// ============================================================================

interface StoreTokenResult {
  success: true;
}

interface StoreTokenError {
  success: false;
  error: string;
}

/**
 * Сохраняет refresh токен в БД
 */
export async function storeRefreshToken(
  userId: string,
  token: string,
  jti: string,
  ipAddress: string,
  userAgent: string
): Promise<StoreTokenResult | StoreTokenError> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const tokenHash = hashToken(token);

    // Вычисляем время истечения (60 дней)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 60);

    // Проверяем количество активных токенов
    const { count, error: countError } = await supabaseAdmin
      .from('refresh_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());

    if (countError) {
      return { success: false, error: countError.message };
    }

    // Если слишком много активных токенов, удаляем самые старые
    const maxTokens = 5;
    if (count && count >= maxTokens) {
      const { error: deleteError } = await supabaseAdmin
        .from('refresh_tokens')
        .delete()
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('created_at', { ascending: true })
        .limit(count - maxTokens + 1);

      if (deleteError) {
        // Логируем, но продолжаем
        console.error('Error cleaning old tokens:', deleteError);
      }
    }

    // Сохраняем новый токен
    const { error: insertError } = await supabaseAdmin
      .from('refresh_tokens')
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        jti,
        ip_address: ipAddress,
        user_agent: userAgent,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Token Verification
// ============================================================================

interface VerifyTokenResult {
  valid: true;
  record: RefreshTokenRecord;
  user: User;
}

interface VerifyTokenError {
  valid: false;
  error: string;
  userInactive?: boolean;
}

/**
 * Проверяет refresh токен в БД и возвращает данные пользователя
 */
export async function verifyRefreshTokenInDB(
  token: string,
  jti: string,
  userId: string
): Promise<VerifyTokenResult | VerifyTokenError> {
  if (!supabaseAdmin) {
    return { valid: false, error: 'Database not configured' };
  }

  try {
    const tokenHash = hashToken(token);

    // Ищем токен в БД - простой запрос без JOIN
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('refresh_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .eq('jti', jti)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (tokenError || !tokenRecord) {
      return { valid: false, error: 'Token not found or revoked' };
    }

    // Получаем пользователя отдельным запросом
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return { valid: false, error: 'User not found' };
    }

    // Проверяем активность пользователя
    if (!user.is_active) {
      return { valid: false, error: 'User is inactive', userInactive: true };
    }

    // Проверяем версию токена
    const tokenVersion = (tokenRecord as RefreshTokenRecord & { ver?: number }).ver;
    if (tokenVersion !== undefined && tokenVersion !== user.token_version) {
      return { valid: false, error: 'Token version mismatch' };
    }

    // Обновляем last_used_at
    await supabaseAdmin
      .from('refresh_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRecord.id);

    return {
      valid: true,
      record: tokenRecord as RefreshTokenRecord,
      user: user as User,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Token Revocation
// ============================================================================

/**
 * Отзывает конкретный refresh токен
 */
export async function revokeRefreshToken(
  token: string,
  reason: string = 'manual'
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const tokenHash = hashToken(token);

    const { error } = await supabaseAdmin
      .from('refresh_tokens')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
      })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Отзывает все refresh токены пользователя
 */
export async function revokeAllUserTokens(
  userId: string,
  reason: string = 'logout'
): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('refresh_tokens')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
      })
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, count: data?.length || 0 };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Отзывает токен по JTI
 */
export async function revokeTokenByJti(
  jti: string,
  reason: string = 'rotation'
): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { error } = await supabaseAdmin
      .from('refresh_tokens')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: reason,
      })
      .eq('jti', jti)
      .is('revoked_at', null);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Token Cleanup
// ============================================================================

/**
 * Очищает истекшие и отозванные токены
 */
export async function cleanupExpiredTokens(): Promise<{ deleted: number; error?: string }> {
  if (!supabaseAdmin) {
    return { deleted: 0, error: 'Database not configured' };
  }

  try {
    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Удаляем истекшие токены
    const { data: expiredData, error: expiredError } = await supabaseAdmin
      .from('refresh_tokens')
      .delete()
      .lt('expires_at', now)
      .select('id');

    if (expiredError) {
      return { deleted: 0, error: expiredError.message };
    }

    // Удаляем отозванные токены старше 30 дней
    const { data: revokedData, error: revokedError } = await supabaseAdmin
      .from('refresh_tokens')
      .delete()
      .not('revoked_at', 'is', null)
      .lt('revoked_at', thirtyDaysAgo.toISOString())
      .select('id');

    if (revokedError) {
      return { deleted: expiredData?.length || 0, error: revokedError.message };
    }

    return {
      deleted: (expiredData?.length || 0) + (revokedData?.length || 0),
    };
  } catch (error) {
    return {
      deleted: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

