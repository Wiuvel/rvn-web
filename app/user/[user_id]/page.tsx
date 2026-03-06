import { cacheLife, cacheTag } from 'next/cache';
import { hasUserRole } from '@/lib/auth/user-roles';
import { supabaseAdmin } from '@/lib/database/supabase';
import PublicProfileClient, { PublicUserData } from '@/components/profile/PublicProfileClient';

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ user_id: string }>;
}) {
  'use cache';
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const { user_id } = await params;
  cacheTag(`user-profile:${user_id}`);

  if (!user_id || !supabaseAdmin) {
    return <PublicProfileClient userData={null} error={true} />;
  }

  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, user_id, username, created_at, avatar, banner')
      .eq('user_id', user_id)
      .single();

    if (error || !user) {
      return <PublicProfileClient userData={null} error={true} />;
    }

    const [isSupport, isAdmin] = await Promise.all([
      hasUserRole(user.id, 'support'),
      hasUserRole(user.id, 'admin'),
    ]);

    const { data: commentsData, error: commentsError } = await supabaseAdmin
      .from('profile_comments')
      .select(
        `
        id,
        profile_id,
        author_id,
        parent_id,
        content,
        is_pinned,
        created_at,
        users!profile_comments_author_id_fkey (
          id,
          user_id,
          username,
          avatar
        )
      `,
      )
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
    }

    const comments = (commentsData || []).map((c: any) => {
      const author = Array.isArray(c.users) ? c.users[0] : c.users;
      return {
        id: c.id,
        profile_id: c.profile_id,
        author_id: c.author_id,
        parent_id: c.parent_id,
        content: c.content,
        is_pinned: c.is_pinned,
        created_at: c.created_at,
        author: {
          id: author?.id || '',
          username: author?.username || '',
          user_id: author?.user_id || '',
          avatar: author?.avatar,
        },
      };
    });

    const userData: PublicUserData = {
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      created_at: user.created_at,
      avatar: user.avatar,
      banner: user.banner,
      isSupport,
      isAdmin,
    };

    return <PublicProfileClient userData={userData} initialComments={comments} />;
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    return <PublicProfileClient userData={null} error={true} />;
  }
}
