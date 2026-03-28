import { cacheLife, cacheTag } from 'next/cache';
import { hasUserRole } from '@/lib/auth/user-roles';
import { db } from '@/lib/database/db';
import { users, profileComments } from '@/lib/database/schema';
import { eq, asc } from 'drizzle-orm';
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

  if (!user_id || !db) {
    return <PublicProfileClient userData={null} error={true} />;
  }

  try {
    const userRows = await db
      .select({
        id: users.id,
        userId: users.userId,
        username: users.username,
        createdAt: users.createdAt,
        avatar: users.avatar,
        banner: users.banner,
      })
      .from(users)
      .where(eq(users.userId, user_id))
      .limit(1);

    const user = userRows[0];

    if (!user) {
      return <PublicProfileClient userData={null} error={true} />;
    }

    const [isSupport, isAdmin] = await Promise.all([
      hasUserRole(user.id, 'support'),
      hasUserRole(user.id, 'admin'),
    ]);

    const commentRows = await db
      .select({
        id: profileComments.id,
        profileId: profileComments.profileId,
        authorId: profileComments.authorId,
        parentId: profileComments.parentId,
        content: profileComments.content,
        isPinned: profileComments.isPinned,
        createdAt: profileComments.createdAt,
        authorUuid: users.id,
        authorUserId: users.userId,
        authorUsername: users.username,
        authorAvatar: users.avatar,
      })
      .from(profileComments)
      .leftJoin(users, eq(profileComments.authorId, users.id))
      .where(eq(profileComments.profileId, user.id))
      .orderBy(asc(profileComments.createdAt));

    const comments = commentRows.map((c) => ({
      id: c.id,
      profile_id: c.profileId,
      author_id: c.authorId,
      parent_id: c.parentId,
      content: c.content,
      is_pinned: c.isPinned ?? false,
      created_at: c.createdAt.toISOString(),
      author: {
        id: c.authorUuid || '',
        username: c.authorUsername || '',
        user_id: c.authorUserId || '',
        avatar: c.authorAvatar,
      },
    }));

    const userData: PublicUserData = {
      id: user.id,
      user_id: user.userId,
      username: user.username,
      created_at: user.createdAt.toISOString(),
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
