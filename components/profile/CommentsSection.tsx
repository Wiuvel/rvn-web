'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MessageSquare, Reply, ChevronUp, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getAvatarUrl, getGradientClasses } from '@/lib/utils/avatar-gradients';
import type { Comment, CommentAuthor } from '@/types';

export type { Comment };

interface CommentsSectionProps {
  profileId: string; // The UUID of the profile owner
  profileUserId: string; // The user_id from URL (used for API calls)
  initialComments?: Comment[];
}

const EMPTY_COMMENTS: Comment[] = [];

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'только что';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}м`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}ч`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function CommentsSection({
  profileId,
  profileUserId,
  initialComments = EMPTY_COMMENTS,
}: CommentsSectionProps) {
  const { userData: currentUser } = useAuth();
  const authToken = currentUser?.token;

  const { socket, joinProfile, leaveProfile } = useWebSocket({
    enabled: true,
    token: authToken,
  });

  // tRPC — основной источник комментариев (fallback на initialComments с сервера)
  const utils = trpc.useUtils();
  const queryInput = useMemo(() => ({ user_id: profileUserId }), [profileUserId]);
  const { data: trpcComments, isLoading: swrLoading } = trpc.user.comments.list.useQuery(
    queryInput,
    {
      enabled: !!profileUserId,
      placeholderData: initialComments.length > 0 ? initialComments : undefined,
      refetchOnWindowFocus: true,
    },
  );

  const comments = (trpcComments ?? EMPTY_COMMENTS) as Comment[];

  // Helper for optimistic cache updates
  const mutateComments = useCallback(
    (updater: (prev: Comment[] | undefined) => Comment[] | undefined, revalidate = true) => {
      utils.user.comments.list.setData(queryInput, (prev) => {
        const result = updater(prev as unknown as Comment[] | undefined);
        return result as unknown as typeof prev;
      });
      if (revalidate) {
        utils.user.comments.list.invalidate(queryInput);
      }
    },
    [utils, queryInput],
  );

  const createComment = trpc.user.comments.create.useMutation();

  const [loading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group comments: Top-level vs Replies
  const { topLevelComments, repliesMap } = useMemo(() => {
    const top: Comment[] = [];
    const map: Record<string, Comment[]> = {};

    comments.forEach((c) => {
      if (c.parent_id) {
        if (!map[c.parent_id]) map[c.parent_id] = [];
        map[c.parent_id].push(c);
      } else {
        top.push(c);
      }
    });

    // Sort replies: Oldest first
    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    // Sort top level: Newest first
    top.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { topLevelComments: top, repliesMap: map };
  }, [comments]);

  // WebSocket Subscription
  useEffect(() => {
    if (!profileId || !authToken) return; // Only subscribe if authenticated (current server limitation)

    joinProfile(profileId);

    const handleNewComment = (data: { profileId: string; comment: Comment }) => {
      if (data.profileId !== profileId) return;
      mutateComments((prev) => {
        const current = prev ?? [];
        if (current.some((c) => c.id === data.comment.id)) return current;
        return [...current, data.comment];
      }, false);
    };

    if (socket) {
      socket.on('profile:comment:new', handleNewComment);
    }

    return () => {
      leaveProfile(profileId);
      if (socket) {
        socket.off('profile:comment:new', handleNewComment);
      }
    };
  }, [profileId, authToken, socket, joinProfile, leaveProfile, mutateComments]);

  const handleSubmit = async (parentId?: string) => {
    if (!newCommentText.trim() || !authToken || !currentUser) return;

    const tempId = `temp-${Date.now()}`;
    const content = newCommentText;
    const now = new Date().toISOString();

    // Optimistic Update
    const newComment: Comment = {
      id: tempId,
      profile_id: profileId,
      author_id: currentUser.id,
      parent_id: parentId || null,
      content: content,
      is_pinned: false,
      created_at: now,
      author: {
        id: currentUser.id,
        username: currentUser.username,
        user_id: currentUser.user_id,
        avatar: currentUser.avatar,
      },
    };

    // Optimistic update через SWR
    mutateComments((prev) => {
      const current = prev ?? [];
      return [...current, newComment];
    }, false);
    setNewCommentText('');
    setReplyingTo(null);
    setSubmitting(true);

    try {
      const savedComment = await createComment.mutateAsync({
        user_id: profileUserId,
        content,
        parent_id: parentId,
      });

      // Replace temp comment with real one
      mutateComments((prev) => {
        const current = prev ?? [];
        return current.map((c) => (c.id === tempId ? (savedComment as Comment) : c));
      }, false);
    } catch (err) {
      // Revert optimistic update on error
      mutateComments((prev) => {
        const current = prev ?? [];
        return current.filter((c) => c.id !== tempId);
      }, false);
      alert(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  const isOwnProfile = currentUser?.id === profileId;

  if (loading || swrLoading) {
    return <SkeletonComments />;
  }

  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-3 text-xl font-bold text-white">
          <MessageSquare className="h-6 w-6 text-primary-500" />
          Комментарии ({comments.length})
        </h3>
      </div>

      {/* Comment input — hidden on own profile */}
      {currentUser && !isOwnProfile ? (
        <div className="mb-8">
          <div className="relative">
            <textarea
              value={!replyingTo ? newCommentText : ''}
              onChange={(e) => {
                if (!replyingTo) setNewCommentText(e.target.value);
              }}
              disabled={!!replyingTo || submitting}
              placeholder="Напишите комментарий..."
              aria-label="Текст комментария"
              className="h-28 w-full resize-none rounded-xl border border-white/10 bg-neutral-900 p-4 text-base text-white placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none"
            />
            {!replyingTo && (
              <div className="absolute bottom-3 right-3">
                <button
                  onClick={() => handleSubmit()}
                  disabled={!newCommentText.trim() || submitting}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отправить'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : !currentUser ? (
        <div className="mb-8 rounded-xl border border-white/5 bg-neutral-900/40 p-6 text-center">
          <p className="text-base text-neutral-400">
            <Link href="/auth" prefetch={false} className="font-medium text-white hover:underline">
              Войдите
            </Link>
            , чтобы присоединиться к обсуждению
          </p>
        </div>
      ) : null}

      {/* Comments List */}
      <div className="space-y-6">
        {topLevelComments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={repliesMap[comment.id] || []}
            currentUser={currentUser}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            newCommentText={newCommentText}
            setNewCommentText={setNewCommentText}
            onSubmitReply={handleSubmit}
            submitting={submitting}
          />
        ))}

        {topLevelComments.length === 0 && !loading && (
          <div className="rounded-2xl border border-white/5 bg-neutral-900/20 px-4 py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800/50">
              <MessageSquare className="h-8 w-8 text-neutral-600" />
            </div>
            <p className="text-lg text-neutral-500">Нет комментариев. Будьте первым!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonComments() {
  return (
    <div className="mx-auto mt-12 max-w-3xl space-y-6">
      <div className="mb-8 flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-neutral-800/50" />
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-800/50" />
      </div>
      <div className="mb-8 h-32 w-full animate-pulse rounded-2xl bg-neutral-800/30" />
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex gap-4">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-neutral-800/50" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-32 animate-pulse rounded bg-neutral-800/50" />
            <div className="h-20 w-full animate-pulse rounded-xl bg-neutral-800/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentAvatar({
  url,
  alt,
  fallback,
  gradientClasses,
}: {
  url: string;
  alt: string;
  fallback: string;
  gradientClasses: string;
}) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <span
        className={`absolute inset-0 flex items-center justify-center text-xs font-bold text-white ${gradientClasses}`}
      >
        {fallback}
      </span>
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={32}
      height={32}
      className="h-full w-full rounded-full object-cover"
      unoptimized
      onError={() => setError(true)}
    />
  );
}

function CommentItem({
  comment,
  replies,
  currentUser,
  replyingTo,
  setReplyingTo,
  newCommentText,
  setNewCommentText,
  onSubmitReply,
  submitting,
}: {
  comment: Comment;
  replies: Comment[];
  currentUser: CommentAuthor | null;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  newCommentText: string;
  setNewCommentText: (text: string) => void;
  onSubmitReply: (parentId: string) => void;
  submitting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isReplying = replyingTo === comment.id;

  const visibleReplies = expanded ? replies : replies.length > 0 ? [replies[0]] : [];
  const hiddenCount = replies.length - 1;

  const avatarUrl = getAvatarUrl(comment.author.avatar);
  const gradientClasses = getGradientClasses(comment.author.avatar);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 group duration-500">
      <div className="flex items-start gap-4">
        <div className="shrink-0 pt-1">
          <div
            className={`h-8 w-8 overflow-hidden rounded-full ${!avatarUrl ? gradientClasses : 'bg-neutral-800'} relative flex items-center justify-center text-xs font-bold text-white`}
          >
            {avatarUrl ? (
              <CommentAvatar
                url={avatarUrl}
                alt={comment.author.username}
                fallback={comment.author.username.substring(0, 2).toUpperCase()}
                gradientClasses={getGradientClasses(null)}
              />
            ) : (
              comment.author.username.substring(0, 2).toUpperCase()
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm font-medium text-white">{comment.author.username}</span>
            <span className="text-xs text-neutral-500">{formatTimeAgo(comment.created_at)}</span>
          </div>

          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">
            {comment.content}
          </p>

          <div className="mt-2 flex items-center gap-4">
            {currentUser && (
              <button
                onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                className="flex items-center gap-1.5 py-1 text-xs text-neutral-500 transition-colors hover:text-white"
              >
                <Reply className="h-3 w-3" />
                Ответить
              </button>
            )}
          </div>

          {/* Reply Input */}
          {isReplying && (
            <div className="animate-in fade-in slide-in-from-top-2 mt-3 flex gap-3">
              <input
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={`Ответ для ${comment.author.username}...`}
                aria-label={`Ответ для ${comment.author.username}`}
                className="flex-1 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 transition-colors focus:border-primary-500 focus:outline-none"
              />
              <button
                onClick={() => onSubmitReply(comment.id)}
                disabled={!newCommentText.trim() || submitting}
                className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Отпр'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nested Replies */}
      {replies.length > 0 && (
        <div className="ml-4 mt-3 space-y-4 border-l-2 border-neutral-800/50 pl-12">
          {visibleReplies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]} // Only support 2 levels for now to prevent deep nesting
              currentUser={currentUser}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              newCommentText={newCommentText}
              setNewCommentText={setNewCommentText}
              onSubmitReply={onSubmitReply}
              submitting={submitting}
            />
          ))}

          {/* Show More Button */}
          {!expanded && hiddenCount > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-2 flex items-center gap-2 text-xs text-primary-400 transition-colors hover:text-primary-300"
            >
              <ChevronUp className="h-3 w-3 rotate-180" />
              Показать еще {hiddenCount} {hiddenCount === 1 ? 'ответ' : 'ответов'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
