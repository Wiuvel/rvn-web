/**
 * Утилиты для работы с ролями пользователей
 */

import { db } from '../database/db';
import { userRoles } from '../database/schema';
import { eq, and, isNull, inArray, desc } from 'drizzle-orm';
import { logger } from '../utils/secure-logger';
import { cached, cache } from '../database/cache';

export type UserRole = 'user' | 'support' | 'admin';

export interface UserRoleRecord {
  id: string;
  userId: string;
  role: UserRole;
  grantedBy: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Проверяет, имеет ли пользователь указанную роль
 * Использует кэширование для оптимизации частых запросов
 */
export async function hasUserRole(userId: string, role: UserRole): Promise<boolean> {
  const cacheKey = `user_role:${userId}:${role}`;

  return cached(
    cacheKey,
    async () => {
      try {
        if (!db) {
          return false;
        }

        const rows = await db
          .select({ id: userRoles.id })
          .from(userRoles)
          .where(
            and(
              eq(userRoles.userId, userId),
              eq(userRoles.role, role),
              eq(userRoles.isActive, true),
              isNull(userRoles.revokedAt),
            ),
          )
          .limit(1);
        const data = rows[0] ?? null;

        return !!data;
      } catch (error) {
        logger.error('Unexpected error checking user role', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
      }
    },
    5,
  );
}

/**
 * Batch проверка ролей для множества пользователей
 * Оптимизирует N+1 проблему, выполняя один запрос вместо N
 */
export async function batchHasUserRole(
  userIds: string[],
  role: UserRole,
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
    if (!db) {
      // Если БД недоступна, все false
      for (const userId of uncachedUserIds) {
        result.set(userId, false);
      }
      return result;
    }

    // Выполняем один batch запрос для всех некэшированных пользователей
    const data = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        and(
          inArray(userRoles.userId, uncachedUserIds),
          eq(userRoles.role, role),
          eq(userRoles.isActive, true),
          isNull(userRoles.revokedAt),
        ),
      );

    // Создаем Set для быстрой проверки
    const usersWithRole = new Set((data || []).map((r) => r.userId));

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
      error: error instanceof Error ? error.message : 'Unknown error',
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
    if (!db) {
      return ['user']; // By default, all users have the 'user' role
    }

    const data = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.isActive, true),
          isNull(userRoles.revokedAt),
        ),
      );

    const roles = data?.map((r) => r.role as UserRole) || [];
    // Всегда добавляем роль 'user', если её нет
    if (!roles.includes('user')) {
      roles.push('user');
    }

    return roles;
  } catch (error) {
    logger.error('Unexpected error fetching user roles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
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
  grantedBy: string, // Admin ID
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      return { success: false, error: 'Database not configured' };
    }

    if (role === 'user') {
      return { success: false, error: 'Cannot grant default user role' };
    }

    // ИСПРАВЛЕНО: Проверяем напрямую в БД, минуя кэш, чтобы избежать race condition
    const existingRoles = await db
      .select({ id: userRoles.id, isActive: userRoles.isActive })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));

    // Проверяем, есть ли уже активная роль
    const hasActiveRole = existingRoles?.some((r) => r.isActive === true) || false;
    if (hasActiveRole) {
      // Инвалидируем кэш на всякий случай
      cache.delete(`user_role:${userId}:${role}`);
      return { success: false, error: 'User already has this role' };
    }

    // ИСПРАВЛЕНО: Очищаем все дубликаты (неактивные записи) перед созданием новой
    if (existingRoles && existingRoles.length > 0) {
      // Обновляем самую последнюю неактивную запись (если есть)
      const inactiveRoles = existingRoles.filter((r) => r.isActive === false);
      if (inactiveRoles.length > 0) {
        // Берем последнюю по ID (самую новую)
        const latestInactive = inactiveRoles.sort((a, b) => b.id.localeCompare(a.id))[0];

        await db
          .update(userRoles)
          .set({
            isActive: true,
            revokedAt: null,
            grantedBy: grantedBy,
            grantedAt: new Date(),
          })
          .where(eq(userRoles.id, latestInactive.id));

        // Удаляем остальные дубликаты (если есть)
        if (inactiveRoles.length > 1) {
          const idsToDelete = inactiveRoles.slice(1).map((r) => r.id);
          await db.delete(userRoles).where(inArray(userRoles.id, idsToDelete));
        }
      } else {
        // Если все записи активны (не должно быть, но на всякий случай)
        // Удаляем все кроме первой
        if (existingRoles.length > 1) {
          const idsToDelete = existingRoles.slice(1).map((r) => r.id);
          await db.delete(userRoles).where(inArray(userRoles.id, idsToDelete));
        }
        // Инвалидируем кэш
        cache.delete(`user_role:${userId}:${role}`);
        return { success: false, error: 'User already has this role' };
      }
    } else {
      // Создаем новую запись, если нет существующих
      try {
        await db.insert(userRoles).values({
          userId,
          role,
          grantedBy,
          isActive: true,
        });
      } catch (insertError) {
        // Если ошибка уникальности - значит роль уже есть (race condition)
        if ((insertError as any).code === '23505') {
          cache.delete(`user_role:${userId}:${role}`);
          return { success: false, error: 'User already has this role' };
        }

        logger.error('Error granting user role', {
          error: insertError instanceof Error ? insertError.message : 'Unknown error',
          userId,
          role,
          grantedBy,
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
      grantedBy,
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
  role: UserRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!db) {
      return { success: false, error: 'Database not configured' };
    }

    if (role === 'user') {
      return { success: false, error: 'Cannot revoke default user role' };
    }

    // ИСПРАВЛЕНО: Получаем все активные записи для этой роли
    const activeRoles = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, userId), eq(userRoles.role, role), eq(userRoles.isActive, true)),
      );

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
    const deleteRoleIds = sortedRoles.slice(1).map((r) => r.id);

    // Обновляем последнюю запись
    await db
      .update(userRoles)
      .set({
        isActive: false,
        revokedAt: new Date(),
      })
      .where(eq(userRoles.id, keepRoleId));

    // Удаляем дубликаты (если есть)
    if (deleteRoleIds.length > 0) {
      try {
        await db.delete(userRoles).where(inArray(userRoles.id, deleteRoleIds));
      } catch (deleteError) {
        logger.error('Error deleting duplicate roles', {
          error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
          userId,
          role,
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
      role,
    });
    return { success: false, error: 'Unexpected error' };
  }
}

/**
 * Получает список всех пользователей с указанной ролью
 */
export async function getUsersByRole(role: UserRole): Promise<UserRoleRecord[]> {
  try {
    if (!db) {
      return [];
    }

    const data = await db
      .select()
      .from(userRoles)
      .where(
        and(eq(userRoles.role, role), eq(userRoles.isActive, true), isNull(userRoles.revokedAt)),
      )
      .orderBy(desc(userRoles.grantedAt));

    return (data || []) as UserRoleRecord[];
  } catch (error) {
    logger.error('Unexpected error fetching users by role', {
      error: error instanceof Error ? error.message : 'Unknown error',
      role,
    });
    return [];
  }
}
