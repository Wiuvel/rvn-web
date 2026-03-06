import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../init';
import { supabaseAdmin } from '@/lib/database/supabase';
import { hasUserRole } from '@/lib/auth/user-roles';
import { broadcastNewComment } from '@/lib/websocket/server';
import { logger } from '@/lib/utils/secure-logger';
import { createCommentBodySchema, userIdParamSchema } from '@/lib/validation/api-schemas';

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
    if (!supabaseAdmin) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, user_id, username, created_at, avatar, banner')
      .eq('user_id', input.user_id)
      .single();

    if (error || !user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const [isSupport, isAdmin] = await Promise.all([
      hasUserRole(user.id, 'support'),
      hasUserRole(user.id, 'admin'),
    ]);

    return {
      id: user.id,
      user_id: user.user_id,
      username: user.username,
      created_at: user.created_at,
      avatar: user.avatar,
      banner: user.banner,
      isSupport,
      isAdmin,
    };
  }),

  comments: router({
    list: publicProcedure.input(userIdParamSchema).query(async ({ input }) => {
      if (!supabaseAdmin) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      }

      const { data: profileOwner, error: profileError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('user_id', input.user_id)
        .single();

      if (profileError || !profileOwner) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
      }

      const { data: comments, error: commentsError } = await supabaseAdmin
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
        .eq('profile_id', profileOwner.id)
        .order('created_at', { ascending: true });

      if (commentsError) {
        logger.error('Error fetching comments', { error: commentsError.message });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch comments' });
      }

      const formattedComments: CommentResponse[] = (comments || []).map(
        (c: Record<string, unknown>) => {
          const usersRel = c.users;
          const authorData = Array.isArray(usersRel) ? usersRel[0] : usersRel;
          const a = authorData as {
            id: string;
            username: string;
            user_id: string;
            avatar?: string | null;
          } | null;
          return {
            id: c.id as string,
            profile_id: c.profile_id as string,
            author_id: c.author_id as string,
            parent_id: (c.parent_id ?? null) as string | null | undefined,
            content: c.content as string,
            is_pinned: c.is_pinned as boolean,
            created_at: c.created_at as string,
            author: {
              id: a?.id ?? '',
              username: a?.username ?? '',
              user_id: a?.user_id ?? '',
              avatar: a?.avatar ?? null,
            },
          };
        },
      );

      return formattedComments;
    }),

    create: protectedProcedure
      .input(
        createCommentBodySchema.extend({
          user_id: z.string().min(1, 'User ID is required'),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!supabaseAdmin) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
        }

        const { data: profileOwner, error: profileError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('user_id', input.user_id)
          .single();

        if (profileError || !profileOwner) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
        }

        const author = ctx.user;

        const { data: insertedComment, error: insertError } = await supabaseAdmin
          .from('profile_comments')
          .insert({
            profile_id: profileOwner.id,
            author_id: author.id,
            parent_id: input.parent_id || null,
            content: input.content.trim(),
          })
          .select()
          .single();

        if (insertError) {
          if (insertError.message.includes('Достигнут лимит комментариев')) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Достигнут лимит комментариев (максимум 3 на профиль)',
            });
          }
          logger.error('Error inserting comment', { error: insertError.message });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to post comment',
          });
        }

        const fullComment: CommentResponse = {
          id: insertedComment.id,
          profile_id: insertedComment.profile_id,
          author_id: insertedComment.author_id,
          parent_id: insertedComment.parent_id,
          content: insertedComment.content,
          is_pinned: insertedComment.is_pinned,
          created_at: insertedComment.created_at,
          author: {
            id: author.id,
            username: author.username,
            user_id: author.user_id,
            avatar: author.avatar,
          },
        };

        revalidateTag(`user-profile:${input.user_id}`, 'max');

        try {
          broadcastNewComment(profileOwner.id, fullComment);
        } catch (wsError) {
          logger.error('Error broadcasting comment', { error: wsError });
        }

        return fullComment;
      }),
  }),
});
