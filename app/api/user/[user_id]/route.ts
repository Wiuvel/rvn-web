import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase';
import { hasUserRole } from '@/lib/auth/user-roles';

/**
 * GET /api/user/[user_id] - Публичный профиль пользователя по user_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  try {
    const { user_id } = await params;

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, user_id, username, created_at, avatar, banner')
      .eq('user_id', user_id)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [isSupport, isAdmin] = await Promise.all([
      hasUserRole(user.id, 'support'),
      hasUserRole(user.id, 'admin'),
    ]);

    return NextResponse.json({
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      created_at: user.created_at,
      avatar: user.avatar,
      banner: user.banner,
      isSupport,
      isAdmin,
    });
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
