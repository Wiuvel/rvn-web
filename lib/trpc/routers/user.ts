import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../init';
import { db } from '@/lib/database/db';
import { users, profileComments } from '@/lib/database/schema';
import { eq, asc, and, sql } from 'drizzle-orm';
import { hasUserRole } from '@/lib/auth/user-roles';
import { broadcastNewComment } from '@/lib/websocket/client';
import { logger } from '@/lib/utils/secure-logger';
import { cache, cached } from '@/lib/database/cache';
import { createCommentBodySchema, userIdParamSchema } from '@/lib/validation/api-schemas';

/** In-memory rate limit: userId -> last comment timestamp */
const commentRateLimit = new Map<string, number>();
const COMMENT_COOLDOWN_MS = 30_000;
const MAX_COMMENTS_PER_PROFILE = 5;

type CommentResponse = {
  id: string;
  profile_id: string;
  author_id: string;
  parent_id?: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author: {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
  };
};

export const userRouter = router({
  profile: publicProcedure.input(userIdParamSchema).query(async ({ input }) => {
    if (!db) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });
    }

    try {
      return await cached(
        `profile:${input.user_id}`,
        async () => {
          const rows = await db!
            .select({
              id: users.id,
              userId: users.userId,
              username: users.username,
              createdAt: users.createdAt,
              avatar: users.avatar,
              banner: users.banner,
            })
            .from(users)
            .where(eq(users.userId, input.user_id))
            .limit(1);
          const user = rows[0];

          if (!user) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
          }

          const [isSupport, isAdmin] = await Promise.all([
            hasUserRole(user.id, 'support'),
            hasUserRole(user.id, 'admin'),
          ]);

          return {
            id: user.id,
            user_id: user.userId,
            username: user.username,
            created_at: user.createdAt,
            avatar: user.avatar,
            banner: user.banner,
            isSupport,
            isAdmin,
          };
        },
        60,
      );
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
  }),

  comments: router({
    list: publicProcedure.input(userIdParamSchema).query(async ({ input }) => {
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      }

      try {
        return await cached(
          `comments:${input.user_id}`,
          async () => {
            const profileOwnerRows = await db!
              .select({ id: users.id })
              .from(users)
              .where(eq(users.userId, input.user_id))
              .limit(1);
            const profileOwner = profileOwnerRows[0];

            if (!profileOwner) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
            }

            const commentRows = await db!
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
              .where(eq(profileComments.profileId, profileOwner.id))
              .orderBy(asc(profileComments.createdAt));

            const formattedComments: CommentResponse[] = commentRows.map((c) => ({
              id: c.id,
              profile_id: c.profileId,
              author_id: c.authorId,
              parent_id: c.parentId ?? null,
              content: c.content,
              is_pinned: c.isPinned ?? false,
              created_at:
                c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
              author: {
                id: c.authorUuid ?? '',
                username: c.authorUsername ?? '',
                user_id: c.authorUserId ?? '',
                avatar: c.authorAvatar ?? null,
              },
            }));

            return formattedComments;
          },
          30,
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        logger.error('Error fetching comments', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch comments' });
      }
    }),

    create: protectedProcedure
      .input(
        createCommentBodySchema.extend({
          user_id: z.string().min(1, 'User ID is required'),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
        }

        try {
          const profileOwnerRows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.userId, input.user_id))
            .limit(1);
          const profileOwner = profileOwnerRows[0];

          if (!profileOwner) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
          }

          const author = ctx.user;

          /** Deny top-level comments on own profile (replies are allowed) */
          if (profileOwner.id === author.id && !input.parent_id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Нельзя оставлять комментарии на своей странице',
            });
          }

          /** Rate limit: 30-second cooldown between comments */
          const lastCommentTime = commentRateLimit.get(author.id);
          if (lastCommentTime && Date.now() - lastCommentTime < COMMENT_COOLDOWN_MS) {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              message: 'Подождите перед отправкой следующего комментария',
            });
          }

          /** Hidden limit: max 5 comments per profile per author */
          const [countResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(profileComments)
            .where(
              and(
                eq(profileComments.profileId, profileOwner.id),
                eq(profileComments.authorId, author.id),
              ),
            );
          if (countResult && countResult.count >= MAX_COMMENTS_PER_PROFILE) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Достигнут лимит комментариев на этом профиле',
            });
          }

          const [insertedComment] = await db
            .insert(profileComments)
            .values({
              profileId: profileOwner.id,
              authorId: author.id,
              parentId: input.parent_id || null,
              content: input.content.trim(),
            })
            .returning();

          const fullComment: CommentResponse = {
            id: insertedComment.id,
            profile_id: insertedComment.profileId,
            author_id: insertedComment.authorId,
            parent_id: insertedComment.parentId,
            content: insertedComment.content,
            is_pinned: insertedComment.isPinned ?? false,
            created_at:
              insertedComment.createdAt instanceof Date
                ? insertedComment.createdAt.toISOString()
                : String(insertedComment.createdAt),
            author: {
              id: author.id,
              username: author.username,
              user_id: author.userId,
              avatar: author.avatar,
            },
          };

          /** Update rate limit timestamp */
          commentRateLimit.set(author.id, Date.now());

          revalidateTag(`user-profile:${input.user_id}`, 'max');
          cache.delete(`comments:${input.user_id}`);

          try {
            broadcastNewComment(profileOwner.id, fullComment);
          } catch (wsError) {
            logger.error('Error broadcasting comment', { error: wsError });
          }

          return fullComment;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Error inserting comment', { error: errorMessage });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to post comment',
          });
        }
      }),
  }),
});
