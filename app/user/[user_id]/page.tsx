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

  let userData: PublicUserData | null = null;
  let comments: {
    id: string;
    profile_id: string;
    author_id: string;
    parent_id: string | null;
    content: string;
    is_pinned: boolean;
    created_at: string;
    author: {
      id: string;
      username: string;
      user_id: string;
      avatar: string | null;
    };
  }[] = [];
  let isError = false;

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
      isError = true;
    } else {
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

      comments = commentRows.map((c) => ({
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

      userData = {
        id: user.id,
        user_id: user.userId,
        username: user.username,
        created_at: user.createdAt.toISOString(),
        avatar: user.avatar,
        banner: user.banner,
        isSupport,
        isAdmin,
      };
    }
  } catch (error) {
    console.error('Error fetching public user profile:', error);
    isError = true;
  }

  if (isError || !userData) {
    return <PublicProfileClient userData={null} error={true} />;
  }

  return <PublicProfileClient userData={userData} initialComments={comments} />;
}
