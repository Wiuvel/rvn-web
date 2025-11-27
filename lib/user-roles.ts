/**
 * Утилиты для работы с ролями пользователей
 */

import { supabaseAdmin } from './supabase';
import { logger } from './secure-logger';

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
 */
export async function hasUserRole(userId: string, role: UserRole): Promise<boolean> {
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
      // PGRST116 - no rows returned (это нормально, если роли нет)
      // Другие ошибки логируем
      if (error.code !== 'PGRST116') {
        logger.error('Error checking user role', {
          error: error.message,
          code: error.code,
          userId,
          role
        });
      }
      return false;
    }

    return !!data;
  } catch (error) {
    logger.error('Unexpected error checking user role', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      role
    });
    return false;
  }
}

/**
 * Получает все активные роли пользователя
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  try {
    if (!supabaseAdmin) {
      return ['user']; // По умолчанию все пользователи имеют роль 'user'
    }

    const { data, error } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('revoked_at', null);

    if (error) {
      // Не логируем ошибки для каждого пользователя, чтобы не замедлять загрузку таблицы
      // Логируем только критические ошибки (не PGRST116 - "no rows returned")
      if (error.code !== 'PGRST116') {
        logger.warn('Error fetching user roles (non-critical)', {
          error: error.message,
          code: error.code,
          userId
        });
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
  grantedBy: string // ID админа, который выдает роль
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

    logger.info('User role granted', {
      userId,
      role,
      grantedBy
    });

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

    logger.info('User role revoked', {
      userId,
      role
    });

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

