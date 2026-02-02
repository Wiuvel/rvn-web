import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/database/supabase';
import { getUserByToken } from '@/lib/auth/index';
import { broadcastNewComment } from '@/lib/websocket/server';
import { logger } from '@/lib/utils/secure-logger';

// Type definition matches the WS event structure
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

/**
 * GET - Fetch comments for a user profile
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        if (!token) {
            return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        }

        if (!supabaseAdmin) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
        }

        // 1. Resolve Profile Owner
        const { data: profileOwner, error: profileError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('dashboard_token', token)
            .single();

        if (profileError || !profileOwner) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // 2. Fetch Comments
        const { data: comments, error: commentsError } = await supabaseAdmin
            .from('profile_comments')
            .select(`
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
      `)
            .eq('profile_id', profileOwner.id)
            .order('created_at', { ascending: true }); // Oldest first (chronological) or Newest? Usually comments are Oldest first or Newest first. Let's do Oldest first for conversation flow.

        if (commentsError) {
            logger.error('Error fetching comments', { error: commentsError.message });
            return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
        }

        // 3. Transform Data
        const formattedComments: CommentResponse[] = comments.map((c: any) => ({
            id: c.id,
            profile_id: c.profile_id,
            author_id: c.author_id,
            parent_id: c.parent_id,
            content: c.content,
            is_pinned: c.is_pinned,
            created_at: c.created_at,
            author: {
                id: c.users.id,
                username: c.users.username,
                user_id: c.users.user_id,
                avatar: c.users.avatar,
            },
        }));

        return NextResponse.json(formattedComments);

    } catch (error) {
        logger.error('Unexpected error in GET comments', { error: error instanceof Error ? error.message : 'Unknown' });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST - Create a new comment
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const body = await request.json();
        const { content, parent_id } = body;

        if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 });
        if (!content || typeof content !== 'string' || !content.trim()) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }
        if (content.length > 1000) {
            return NextResponse.json({ error: 'Comment too long (max 1000 chars)' }, { status: 400 });
        }

        // 1. Authenticate Request Author
        const cookieStore = await cookies();
        const dashboardToken = cookieStore.get('dashboard_token')?.value;

        if (!dashboardToken) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: author, error: authError } = await supabaseAdmin!
            .from('users')
            .select('*')
            .eq('dashboard_token', dashboardToken)
            .single();

        // Or use helper: const author = await getUserByToken(dashboardToken); 
        // But direct DB select might be slightly faster if we don't need all fields, though helper is safer.
        // Let's use the helper for consistency
        // const author = await getUserByToken(dashboardToken);

        if (!author) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Resolve Profile Owner
        const { data: profileOwner, error: profileError } = await supabaseAdmin!
            .from('users')
            .select('id')
            .eq('dashboard_token', token)
            .single();

        if (profileError || !profileOwner) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // 3. Insert Comment
        // The DB trigger `trigger_check_comment_limit` will run here.
        const { data: insertedComment, error: insertError } = await supabaseAdmin!
            .from('profile_comments')
            .insert({
                profile_id: profileOwner.id,
                author_id: author.id,
                parent_id: parent_id || null, // Ensure explicit null if undefined
                content: content.trim(),
            })
            .select()
            .single();

        if (insertError) {
            // Check for trigger error
            if (insertError.message.includes('Достигнут лимит комментариев')) {
                return NextResponse.json({ error: 'Достигнут лимит комментариев (максимум 3 на профиль)' }, { status: 403 });
            }
            logger.error('Error inserting comment', { error: insertError.message });
            return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
        }

        // 4. Construct Response & Broadcast
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

        // Broadcast via WebSocket
        try {
            broadcastNewComment(profileOwner.id, fullComment);
        } catch (wsError) {
            logger.error('Error broadcasting comment', { error: wsError });
            // Don't fail the request if broadcast fails
        }

        return NextResponse.json(fullComment);

    } catch (error) {
        logger.error('Unexpected error in POST comment', { error: error instanceof Error ? error.message : 'Unknown' });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
