import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/database/db';
import { userRoles } from '@/lib/database/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { logger } from '@/lib/utils/secure-logger';

export interface TeamStats {
  count: number;
  support: number;
  admin: number;
}

export async function getTeamCount(): Promise<TeamStats> {
  'use cache';
  cacheLife('hours');
  cacheTag('team-count');

  try {
    if (!db) {
      logger.error('Database client is not configured for team count');
      return { count: 0, support: 0, admin: 0 };
    }

    const roleData = await db
      .select({ userId: userRoles.userId, role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          inArray(userRoles.role, ['support', 'admin']),
          eq(userRoles.isActive, true),
          isNull(userRoles.revokedAt),
        ),
      );

    const uniqueUserIds = new Set<string>();
    const supportCount = roleData.filter((r) => r.role === 'support').length;
    const adminCount = roleData.filter((r) => r.role === 'admin').length;

    roleData.forEach((role) => {
      uniqueUserIds.add(role.userId);
    });

    return {
      count: uniqueUserIds.size,
      support: supportCount,
      admin: adminCount,
    };
  } catch (error) {
    logger.error('Error counting team members', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { count: 0, support: 0, admin: 0 };
  }
}
