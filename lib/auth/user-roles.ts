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
 * ИСПРАВЛЕНО: Предотвращает дубликаты и правильно обрабатывает существующие записи
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

    // ИСПРАВЛЕНО: Проверяем напрямую в БД, минуя кэш, чтобы избежать race condition
    const { data: existingRoles, error: checkError } = await supabaseAdmin
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('role', role);

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Error checking existing roles', {
        error: checkError.message,
        code: checkError.code,
        userId,
        role
      });
      return { success: false, error: 'Failed to check existing role' };
    }

    // Проверяем, есть ли уже активная роль
    const hasActiveRole = existingRoles?.some(r => r.is_active === true) || false;
    if (hasActiveRole) {
      // Инвалидируем кэш на всякий случай
      cache.delete(`user_role:${userId}:${role}`);
      return { success: false, error: 'User already has this role' };
    }

    // ИСПРАВЛЕНО: Очищаем все дубликаты (неактивные записи) перед созданием новой
    if (existingRoles && existingRoles.length > 0) {
      // Обновляем самую последнюю неактивную запись (если есть)
      const inactiveRoles = existingRoles.filter(r => r.is_active === false);
      if (inactiveRoles.length > 0) {
        // Берем последнюю по ID (самую новую)
        const latestInactive = inactiveRoles.sort((a, b) => b.id.localeCompare(a.id))[0];
        
        const { error: updateError } = await supabaseAdmin
          .from('user_roles')
          .update({
            is_active: true,
            revoked_at: null,
            granted_by: grantedBy,
            granted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', latestInactive.id);

        if (updateError) {
          logger.error('Error reactivating role', {
            error: updateError.message,
            code: updateError.code,
            userId,
            role
          });
          return { success: false, error: 'Failed to reactivate role' };
        }

        // Удаляем остальные дубликаты (если есть)
        if (inactiveRoles.length > 1) {
          const idsToDelete = inactiveRoles.slice(1).map(r => r.id);
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .in('id', idsToDelete);
        }
      } else {
        // Если все записи активны (не должно быть, но на всякий случай)
        // Удаляем все кроме первой
        if (existingRoles.length > 1) {
          const idsToDelete = existingRoles.slice(1).map(r => r.id);
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .in('id', idsToDelete);
        }
        // Инвалидируем кэш
        cache.delete(`user_role:${userId}:${role}`);
        return { success: false, error: 'User already has this role' };
      }
    } else {
      // Создаем новую запись, если нет существующих
      const { error: insertError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          granted_by: grantedBy,
          is_active: true
        });

      if (insertError) {
        // Если ошибка уникальности - значит роль уже есть (race condition)
        if (insertError.code === '23505') {
          cache.delete(`user_role:${userId}:${role}`);
          return { success: false, error: 'User already has this role' };
        }
        
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

    // ИНВАЛИДАЦИЯ КЭША: Очищаем кэш роли для немедленного обновления
    cache.delete(`user_role:${userId}:${role}`);
    // Также очищаем все связанные кэши
    cache.deleteByPattern(new RegExp(`^user_role:${userId}:.*$`));

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
 * ИСПРАВЛЕНО: Обновляет все активные записи и очищает дубликаты
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

    // ИСПРАВЛЕНО: Получаем все активные записи для этой роли
    const { data: activeRoles, error: fetchError } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', role)
      .eq('is_active', true);

    if (fetchError && fetchError.code !== 'PGRST116') {
      logger.error('Error fetching active roles', {
        error: fetchError.message,
        code: fetchError.code,
        userId,
        role
      });
      return { success: false, error: 'Failed to fetch roles' };
    }

    // Если нет активных ролей, ничего не делаем
    if (!activeRoles || activeRoles.length === 0) {
      // Инвалидируем кэш на всякий случай
      cache.delete(`user_role:${userId}:${role}`);
      return { success: false, error: 'User does not have this role' };
    }

    // ИСПРАВЛЕНО: Обновляем все активные записи
    // Оставляем только одну запись (самую последнюю), остальные удаляем
    const sortedRoles = activeRoles.sort((a, b) => b.id.localeCompare(a.id));
    const keepRoleId = sortedRoles[0].id;
    const deleteRoleIds = sortedRoles.slice(1).map(r => r.id);

    // Обновляем последнюю запись
    const { error: updateError } = await supabaseAdmin
      .from('user_roles')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', keepRoleId);

    if (updateError) {
      logger.error('Error revoking user role', {
        error: updateError.message,
        code: updateError.code,
        userId,
        role
      });
      return { success: false, error: 'Failed to revoke role' };
    }

    // Удаляем дубликаты (если есть)
    if (deleteRoleIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('user_roles')
        .delete()
        .in('id', deleteRoleIds);

      if (deleteError) {
        logger.error('Error deleting duplicate roles', {
          error: deleteError.message,
          code: deleteError.code,
          userId,
          role
        });
        // Не критично, продолжаем
      }
    }

    // ИНВАЛИДАЦИЯ КЭША: Очищаем кэш роли для немедленного обновления
    cache.delete(`user_role:${userId}:${role}`);
    // Также очищаем все связанные кэши
    cache.deleteByPattern(new RegExp(`^user_role:${userId}:.*$`));

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

