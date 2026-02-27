import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase';
import { checkAuth } from '@/lib/auth/helper';
import { broadcastNewComment } from '@/lib/websocket/server';
import { logger } from '@/lib/utils/secure-logger';

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
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { data: profileOwner, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('user_id', user_id)
      .single();

    if (profileError || !profileOwner) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
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
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
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

    return NextResponse.json(formattedComments);
  } catch (error) {
    logger.error('Unexpected error in GET comments', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  try {
    const { user_id } = await params;
    const body = await request.json();
    const { content, parent_id } = body;

    if (!user_id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }
    if (content.length > 1000) {
      return NextResponse.json({ error: 'Comment too long (max 1000 chars)' }, { status: 400 });
    }

    const authResult = await checkAuth(request);
    if (!authResult.isAuthenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const author = authResult.user;

    const { data: profileOwner, error: profileError } = await supabaseAdmin!
      .from('users')
      .select('id')
      .eq('user_id', user_id)
      .single();

    if (profileError || !profileOwner) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: insertedComment, error: insertError } = await supabaseAdmin!
      .from('profile_comments')
      .insert({
        profile_id: profileOwner.id,
        author_id: author.id,
        parent_id: parent_id || null,
        content: content.trim(),
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.message.includes('Достигнут лимит комментариев')) {
        return NextResponse.json(
          { error: 'Достигнут лимит комментариев (максимум 3 на профиль)' },
          { status: 403 },
        );
      }
      logger.error('Error inserting comment', { error: insertError.message });
      return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
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

    try {
      broadcastNewComment(profileOwner.id, fullComment);
    } catch (wsError) {
      logger.error('Error broadcasting comment', { error: wsError });
    }

    return NextResponse.json(fullComment);
  } catch (error) {
    logger.error('Unexpected error in POST comment', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
