'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MessageSquare, Reply, ChevronUp, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Author {
    id: string;
    username: string;
    user_id: string;
    avatar?: string | null;
}

interface Comment {
    id: string;
    profile_id: string;
    author_id: string;
    parent_id?: string | null;
    content: string;
    is_pinned: boolean;
    created_at: string;
    author: Author;
}

interface CommentsSectionProps {
    profileId: string; // The UUID of the profile owner
    profileUserId: string; // The user_id from URL (used for API calls)
}

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

import { getAvatarUrl, getGradientClasses } from '@/lib/utils/avatar-gradients';

export default function CommentsSection({ profileId, profileUserId }: CommentsSectionProps) {
    const { userData: currentUser } = useAuth();
    const authToken = currentUser?.token;

    // Allow WS connection even without auth token request? 
    // Currently server enforces auth, so only logged in users get real-time updates.
    // We pass authToken if available.
    const { socket, joinProfile, leaveProfile } = useWebSocket({
        enabled: true,
        token: authToken
    });

    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [newCommentText, setNewCommentText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Group comments: Top-level vs Replies
    const { topLevelComments, repliesMap, userCommentCount } = useMemo(() => {
        const top: Comment[] = [];
        const map: Record<string, Comment[]> = {};
        let count = 0;

        comments.forEach(c => {
            if (currentUser && c.author_id === currentUser.id) {
                count++;
            }

            if (c.parent_id) {
                if (!map[c.parent_id]) map[c.parent_id] = [];
                map[c.parent_id].push(c);
            } else {
                top.push(c);
            }
        });

        // Sort replies: Oldest first
        Object.keys(map).forEach(key => {
            map[key].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });

        // Sort top level: Newest first
        top.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return { topLevelComments: top, repliesMap: map, userCommentCount: count };
    }, [comments, currentUser]);

    // Initial Fetch
    useEffect(() => {
        const fetchComments = async () => {
            try {
                setLoading(true);
                const res = await fetch(`/api/user/${profileUserId}/comments`);
                if (!res.ok) throw new Error('Failed to load comments');
                const data = await res.json();
                setComments(data);
            } catch (err) {
                setError('Не удалось загрузить комментарии');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchComments();
    }, [profileUserId]);

    // WebSocket Subscription
    useEffect(() => {
        if (!profileId || !authToken) return; // Only subscribe if authenticated (current server limitation)

        joinProfile(profileId);

        const handleNewComment = (data: { profileId: string, comment: Comment }) => {
            if (data.profileId === profileId) {
                setComments(prev => {
                    if (prev.some(c => c.id === data.comment.id)) return prev;
                    return [...prev, data.comment];
                });
            }
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
    }, [profileId, authToken, socket, joinProfile, leaveProfile]);

    const handleSubmit = async (parentId?: string) => {
        if (!newCommentText.trim() || !authToken || !currentUser) return;

        if (userCommentCount >= 3) {
            alert('Вы достигли лимита комментариев (3 сообщения).');
            return;
        }

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
                avatar: currentUser.avatar
            }
        };

        // Immediately update UI
        setComments(prev => [...prev, newComment]);
        setNewCommentText('');
        setReplyingTo(null);
        setSubmitting(true);

        try {
            const res = await fetch(`/api/user/${profileUserId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, parent_id: parentId })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to post');
            }

            const savedComment = await res.json();

            // Replace temp comment with real one
            setComments(prev => prev.map(c => c.id === tempId ? savedComment : c));

        } catch (err: any) {
            // Revert optimistic update on error
            setComments(prev => prev.filter(c => c.id !== tempId));
            alert(err.message);
            // Restore text if specific failure handling needed
        } finally {
            setSubmitting(false);
        }
    };

    const isLimitReached = userCommentCount >= 3;

    if (loading) {
        return <SkeletonComments />;
    }

    return (
        <div className="mt-12 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    <MessageSquare className="w-6 h-6 text-primary-500" />
                    Комментарии ({comments.length})
                </h3>
                {currentUser && (
                    <span className={`text-sm font-medium ${isLimitReached ? 'text-red-400' : 'text-neutral-400'}`}>
                        Ваши сообщения: {userCommentCount}/3
                    </span>
                )}
            </div>

            {/* Main Input */}
            {currentUser ? (
                <div className="mb-8">
                    <div className="relative">
                        <textarea
                            value={!replyingTo ? newCommentText : ''}
                            onChange={(e) => {
                                if (!replyingTo) setNewCommentText(e.target.value);
                            }}
                            disabled={!!replyingTo || isLimitReached || submitting}
                            placeholder={isLimitReached ? "Лимит сообщений исчерпан" : "Напишите комментарий..."}
                            className={`w-full bg-neutral-900 border border-white/10 rounded-xl p-4 text-base text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 transition-colors resize-none h-28 ${isLimitReached ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {!replyingTo && !isLimitReached && (
                            <div className="absolute bottom-3 right-3">
                                <button
                                    onClick={() => handleSubmit()}
                                    disabled={!newCommentText.trim() || submitting}
                                    className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Отправить'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="mb-8 p-6 bg-neutral-900/40 border border-white/5 rounded-xl text-center">
                    <p className="text-neutral-400 text-base">
                        <Link href="/auth" className="text-white hover:underline font-medium">Войдите</Link>, чтобы присоединиться к обсуждению
                    </p>
                </div>
            )}

            {/* Comments List */}
            <div className="space-y-6">
                {topLevelComments.map(comment => (
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
                        isLimitReached={isLimitReached}
                    />
                ))}

                {topLevelComments.length === 0 && !loading && (
                    <div className="text-center py-12 px-4 rounded-2xl border border-white/5 bg-neutral-900/20">
                        <div className="w-16 h-16 rounded-full bg-neutral-800/50 flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="w-8 h-8 text-neutral-600" />
                        </div>
                        <p className="text-neutral-500 text-lg">Нет комментариев. Будьте первым!</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function SkeletonComments() {
    return (
        <div className="mt-12 max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-8">
                <div className="h-8 w-40 bg-neutral-800/50 rounded-lg animate-pulse" />
                <div className="h-4 w-24 bg-neutral-800/50 rounded animate-pulse" />
            </div>
            <div className="h-32 w-full bg-neutral-800/30 rounded-2xl animate-pulse mb-8" />
            {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-neutral-800/50 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-3">
                        <div className="h-4 w-32 bg-neutral-800/50 rounded animate-pulse" />
                        <div className="h-20 w-full bg-neutral-800/30 rounded-xl animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Separate component for item to handle "Show replies" state
// Separate component for item to handle "Show replies" state
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
    isLimitReached
}: {
    comment: Comment;
    replies: Comment[];
    currentUser: any;
    replyingTo: string | null;
    setReplyingTo: (id: string | null) => void;
    newCommentText: string;
    setNewCommentText: (text: string) => void;
    onSubmitReply: (parentId: string) => void;
    submitting: boolean;
    isLimitReached: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const isReplying = replyingTo === comment.id;

    const visibleReplies = expanded ? replies : (replies.length > 0 ? [replies[0]] : []);
    const hiddenCount = replies.length - 1;

    // Use helpers for avatar
    const avatarUrl = getAvatarUrl(comment.author.avatar);
    const gradientClasses = getGradientClasses(comment.author.avatar);

    return (
        <div className="group animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex gap-4 items-start">
                <div className="shrink-0 pt-1">
                    <div className={`w-8 h-8 rounded-full overflow-hidden ${!avatarUrl ? gradientClasses : 'bg-neutral-800'} flex items-center justify-center text-xs font-bold text-white`}>
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt={comment.author.username}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement!.className += ` ${getGradientClasses(null)}`;
                                    e.currentTarget.parentElement!.innerHTML = comment.author.username.substring(0, 2).toUpperCase();
                                }}
                            />
                        ) : (
                            comment.author.username.substring(0, 2).toUpperCase()
                        )}
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-medium text-white text-sm">{comment.author.username}</span>
                        <span className="text-xs text-neutral-500">{formatTimeAgo(comment.created_at)}</span>
                    </div>

                    <p className="text-neutral-300 text-sm whitespace-pre-wrap break-words leading-relaxed">{comment.content}</p>

                    <div className="flex items-center gap-4 mt-2">
                        {!isLimitReached && currentUser && (
                            <button
                                onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                                className="text-xs text-neutral-500 hover:text-white transition-colors flex items-center gap-1.5 py-1"
                            >
                                <Reply className="w-3 h-3" />
                                Ответить
                            </button>
                        )}
                    </div>

                    {/* Reply Input */}
                    {isReplying && (
                        <div className="mt-3 flex gap-3 animate-in fade-in slide-in-from-top-2">
                            <input
                                autoFocus
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                placeholder={`Ответ для ${comment.author.username}...`}
                                className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors placeholder-neutral-600"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (newCommentText.trim()) onSubmitReply(comment.id);
                                    }
                                }}
                            />
                            <button
                                onClick={() => onSubmitReply(comment.id)}
                                disabled={!newCommentText.trim() || submitting}
                                className="px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg disabled:opacity-50 transition-colors text-sm font-medium"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Отправить'}
                            </button>
                        </div>
                    )}

                    {/* Replies */}
                    {replies.length > 0 && (
                        <div className="mt-3 space-y-3">
                            {visibleReplies.map(reply => {
                                const replyAvatarUrl = getAvatarUrl(reply.author.avatar);
                                const replyGradientClasses = getGradientClasses(reply.author.avatar);
                                return (
                                    <div key={reply.id} className="flex gap-3 items-start">
                                        <div className="shrink-0 pt-1">
                                            <div className={`w-6 h-6 rounded-full overflow-hidden ${!replyAvatarUrl ? replyGradientClasses : 'bg-neutral-800'} flex items-center justify-center text-[10px] font-bold text-white`}>
                                                {replyAvatarUrl ? (
                                                    <img
                                                        src={replyAvatarUrl}
                                                        alt={reply.author.username}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                            e.currentTarget.parentElement!.className += ` ${getGradientClasses(null)}`;
                                                            e.currentTarget.parentElement!.innerHTML = reply.author.username.substring(0, 2).toUpperCase();
                                                        }}
                                                    />
                                                ) : (
                                                    reply.author.username.substring(0, 2).toUpperCase()
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 mb-0.5">
                                                <span className="font-medium text-white text-xs">{reply.author.username}</span>
                                                <span className="text-[10px] text-neutral-500">{formatTimeAgo(reply.created_at)}</span>
                                            </div>
                                            <p className="text-neutral-400 text-sm whitespace-pre-wrap break-words leading-relaxed">{reply.content}</p>
                                        </div>
                                    </div>
                                );
                            })}

                            {hiddenCount > 0 && !expanded && (
                                <button
                                    onClick={() => setExpanded(true)}
                                    className="text-xs font-medium text-neutral-500 hover:text-white flex items-center gap-2 py-1 transition-colors ml-9"
                                >
                                    <div className="w-6 h-[1px] bg-neutral-800 group-hover/btn:bg-neutral-600 transition-colors"></div>
                                    Показать еще {hiddenCount} {hiddenCount === 1 ? 'ответ' : 'ответа'}
                                </button>
                            )}

                            {expanded && replies.length > 1 && (
                                <button
                                    onClick={() => setExpanded(false)}
                                    className="text-xs font-medium text-neutral-500 hover:text-white flex items-center gap-2 mt-1 transition-colors ml-9"
                                >
                                    <ChevronUp className="w-3 h-3" />
                                    Скрыть ответы
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
