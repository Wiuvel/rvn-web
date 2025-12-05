import { supabaseAdmin } from '@/lib/database/supabase';
import { logger } from '@/lib/utils/secure-logger';

export interface TeamStats {
    count: number;
    support: number;
    admin: number;
}

export async function getTeamCount(): Promise<TeamStats> {
    try {
        if (!supabaseAdmin) {
            logger.error('Supabase admin client is not configured for team count');
            return { count: 0, support: 0, admin: 0 };
        }

        // Получаем количество пользователей с ролями "Поддержка" и "Админ" напрямую из БД
        const { data: roleData, error: roleError } = await supabaseAdmin
            .from('user_roles')
            .select('user_id, role')
            .in('role', ['support', 'admin'])
            .eq('is_active', true)
            .is('revoked_at', null);

        if (roleError) {
            logger.error('Error fetching team roles', {
                error: roleError.message,
                code: roleError.code
            });
            return { count: 0, support: 0, admin: 0 };
        }

        // Получаем уникальные user_id
        const uniqueUserIds = new Set<string>();
        const supportCount = roleData?.filter(r => r.role === 'support').length || 0;
        const adminCount = roleData?.filter(r => r.role === 'admin').length || 0;

        roleData?.forEach(role => {
            uniqueUserIds.add(role.user_id);
        });

        return {
            count: uniqueUserIds.size,
            support: supportCount,
            admin: adminCount
        };
    } catch (error) {
        logger.error('Error counting team members', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { count: 0, support: 0, admin: 0 };
    }
}
