/**
 * Утилиты для работы с ролями пользователей
 */

import { supabaseAdmin } from '../database/supabase';
import { logger } from '../utils/secure-logger';
import { cached, cache } from '../database/cache';

export type UserRole = 'user' | 'support' | 'admin';

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Проверяет, имеет ли пользователь указанную роль
 * Использует кэширование для оптимизации частых запросов
 */
export async function hasUserRole(userId: string, role: UserRole): Promise<boolean> {
  const cacheKey = `user_role:${userId}:${role}`;
  
  return cached(cacheKey, async () => {
    try {
      if (!supabaseAdmin) {
        return false;
      }

      const { data, error } = await supabaseAdmin
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', role)
        .eq('is_active', true)
        .is('revoked_at', null)
        .limit(1)
        .maybeSingle();

      if (error) {
        // PGRST116 - No rows returned
        if (error.code !== 'PGRST116') {
          logger.error('Error checking user role', {
            error: error.message,
            code: error.code
          });
        }
        return false;
      }

      return !!data;
    } catch (error) {
      logger.error('Unexpected error checking user role', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }, 60);
}

/**
 * Batch проверка ролей для множества пользователей
 * Оптимизирует N+1 проблему, выполняя один запрос вместо N
 */
export async function batchHasUserRole(
  userIds: string[],
  role: UserRole
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  
  // Если нет пользователей, возвращаем пустой результат
  if (userIds.length === 0) {
    return result;
  }

  // Убираем дубликаты
  const uniqueUserIds = Array.from(new Set(userIds));
  
  // Проверяем кэш для каждого пользователя
  const uncachedUserIds: string[] = [];
  const cachePromises: Promise<[string, boolean]>[] = [];
  
  for (const userId of uniqueUserIds) {
    const cacheKey = `user_role:${userId}:${role}`;
    const cached = cache.get<boolean>(cacheKey);
    
    if (cached !== null) {
      result.set(userId, cached);
    } else {
      uncachedUserIds.push(userId);
    }
  }
  
  // Если все в кэше, возвращаем результат
  if (uncachedUserIds.length === 0) {
    return result;
  }
  
  try {
    if (!supabaseAdmin) {
      // Если БД недоступна, все false
      for (const userId of uncachedUserIds) {
        result.set(userId, false);
      }
      return result;
    }

    // Выполняем один batch запрос для всех некэшированных пользователей
    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .in('user_id', uncachedUserIds)
      .eq('role', role)
      .eq('is_active', true)
      .is('revoked_at', null);

    if (error) {
      // PGRST116 - No rows returned - это нормально
      if (error.code !== 'PGRST116') {
        logger.error('Error batch checking user roles', {
          error: error.message,
          code: error.code
        });
      }
      // При ошибке все false
      for (const userId of uncachedUserIds) {
        result.set(userId, false);
      }
      return result;
    }

    // Создаем Set для быстрой проверки
    const usersWithRole = new Set((data || []).map(r => r.user_id));
    
    // Заполняем результат и кэш
    for (const userId of uncachedUserIds) {
      const hasRole = usersWithRole.has(userId);
      result.set(userId, hasRole);
      
      // Кэшируем результат
      const cacheKey = `user_role:${userId}:${role}`;
      cache.set(cacheKey, hasRole, 60);
    }
  } catch (error) {
    logger.error('Unexpected error batch checking user roles', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // При ошибке все false
    for (const userId of uncachedUserIds) {
      result.set(userId, false);
    }
  }
  
  return result;
}

/**
 * Gets all active roles for a user
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  try {
    if (!supabaseAdmin) {
      return ['user']; // By default, all users have the 'user' role
    }

    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('revoked_at', null);

    if (error) {
      if (error.code !== 'PGRST116') {
        // Ошибка получения ролей не критична
      }
      return ['user'];
    }

    const roles = data?.map(r => r.role as UserRole) || [];
    // Всегда добавляем роль 'user', если её нет
    if (!roles.includes('user')) {
      roles.push('user');
    }

    return roles;
  } catch (error) {
    logger.error('Unexpected error fetching user roles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId
    });
    return ['user'];
  }
}

/**
 * Выдает роль пользователю (только для админов)
 */
export async function grantUserRole(
  userId: string,
  role: UserRole,
  grantedBy: string // Admin ID
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    if (role === 'user') {
      return { success: false, error: 'Cannot grant default user role' };
    }

    // Проверяем, не имеет ли пользователь уже эту роль
    const hasRole = await hasUserRole(userId, role);
    if (hasRole) {
      return { success: false, error: 'User already has this role' };
    }

    // Отзываем старую роль, если она была отозвана
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({
        is_active: true,
        revoked_at: null,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('role', role)
      .eq('is_active', false);

    // Если не было старой записи, создаем новую
    if (!updateError || updateError.code === 'PGRST116') {
      const { error: insertError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          granted_by: grantedBy,
          is_active: true
        });

      if (insertError) {
        logger.error('Error granting user role', {
          error: insertError.message,
          code: insertError.code,
          userId,
          role,
          grantedBy
        });
        return { success: false, error: 'Failed to grant role' };
      }
    }

    // Роль выдана - не логируем

    return { success: true };
  } catch (error) {
    logger.error('Unexpected error granting user role', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      role,
      grantedBy
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Отзывает роль у пользователя (только для админов)
 */
export async function revokeUserRole(
  userId: string,
  role: UserRole
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: 'Database not configured' };
    }

    if (role === 'user') {
      return { success: false, error: 'Cannot revoke default user role' };
    }

    const { error } = await supabaseAdmin
      .from('user_roles')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('role', role)
      .eq('is_active', true);

    if (error) {
      logger.error('Error revoking user role', {
        error: error.message,
        code: error.code,
        userId,
        role
      });
      return { success: false, error: 'Failed to revoke role' };
    }

    // Роль отозвана - не логируем

    return { success: true };
  } catch (error) {
    logger.error('Unexpected error revoking user role', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      role
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Получает список всех пользователей с указанной ролью
 */
export async function getUsersByRole(role: UserRole): Promise<UserRoleRecord[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('role', role)
      .eq('is_active', true)
      .is('revoked_at', null)
      .order('granted_at', { ascending: false });

    if (error) {
      logger.error('Error fetching users by role', {
        error: error.message,
        code: error.code,
        role
      });
      return [];
    }

    return (data || []) as UserRoleRecord[];
  } catch (error) {
    logger.error('Unexpected error fetching users by role', {
      error: error instanceof Error ? error.message : 'Unknown error',
      role
    });
    return [];
  }
}

